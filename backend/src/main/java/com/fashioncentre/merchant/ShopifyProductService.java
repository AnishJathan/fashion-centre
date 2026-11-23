
package com.fashioncentre.merchant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class ShopifyProductService {

    private static final String API_VERSION = "2026-10";

    private final EncryptedConnections connections;
    private final ObjectMapper objectMapper;
    private final ShopifyTokenRefresh tokenRefresh;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public ShopifyProductService(
            EncryptedConnections connections,
            ShopifyTokenRefresh tokenRefresh,
            ObjectMapper objectMapper
    ) {
        this.connections = connections;
        this.tokenRefresh = tokenRefresh;
        this.objectMapper = objectMapper;
    }

    public record Option(String name, String value) {}

    public record Variant(
            String id,
            String title,
            boolean available,
            String price,
            String currency,
            List<Option> options
    ) {}

    public record Product(
            String id,
            String title,
            String handle,
            String description,
            String imageUrl,
            String imageAlt,
            String price,
            String currency,
            String productUrl,
            List<Variant> variants,
            boolean moreVariants
    ) {}

    public record Catalogue(List<Product> products) {}

    private static final String PRODUCTS_QUERY = """
            query Products($first: Int!) {
              products(first: $first, sortKey: TITLE) {
                nodes {
                  id
                  title
                  handle
                  description
                  onlineStoreUrl
                  featuredImage {
                    url
                    altText
                  }
                  priceRangeV2 {
                    minVariantPrice {
                      amount
                      currencyCode
                    }
                  }
                  variants(first: 100) {
                    nodes {
                      id
                      title
                      availableForSale
                      price
                      selectedOptions {
                        name
                        value
                      }
                    }
                    pageInfo {
                      hasNextPage
                    }
                  }
                }
              }
            }
            """;

    /**
     * Fetch products from the authenticated merchant's Shopify store.
     * The brand must belong to the currently authenticated user.
     */
    public Catalogue fetchProducts(String brandId, int limit) {

        if (limit < 1 || limit > 100) {
            throw new ShopifyOAuth.Rejected("INVALID_PRODUCT_LIMIT");
        }

        EncryptedConnections.Connection connection =
                connections.loadValid(brandId, tokenRefresh);

        ShopifyOAuth.Grant grant = connection.grant();

        Set<String> scopes = grant.scopes();

        if (!scopes.contains("read_products")) {
            throw new ShopifyOAuth.Rejected(
                    "SHOPIFY_READ_PRODUCTS_SCOPE_MISSING"
            );
        }

        String shop = ShopifyOAuth.canonicalShop(connection.shop());

        URI endpoint = URI.create(
                "https://" + shop
                        + "/admin/api/" + API_VERSION
                        + "/graphql.json"
        );

        try {
            String requestBody = objectMapper.writeValueAsString(
                    java.util.Map.of(
                            "query", PRODUCTS_QUERY,
                            "variables", java.util.Map.of("first", limit)
                    )
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(endpoint)
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header(
                            "X-Shopify-Access-Token",
                            grant.token()
                    )
                    .POST(
                            HttpRequest.BodyPublishers.ofString(requestBody)
                    )
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() != 200) {
                System.err.println(
                        "Shopify HTTP Status: " + response.statusCode()
                );
                System.err.println(
                        "Shopify Response Body: " + response.body()
                );

                throw new ShopifyOAuth.Rejected(
                        "SHOPIFY_PRODUCT_FETCH_FAILED"
                );
            }

            JsonNode root = objectMapper.readTree(response.body());

            JsonNode errors = root.path("errors");

        if (errors.isArray() && !errors.isEmpty()) {
                System.err.println("Shopify GraphQL Errors:");

        for (JsonNode error : errors) {
                System.err.println(error.toPrettyString());
        }

        throw new ShopifyOAuth.Rejected(
                "SHOPIFY_GRAPHQL_ERROR"
        );
        }

            JsonNode nodes = root.path("data")
                    .path("products")
                    .path("nodes");

            if (!nodes.isArray()) {
                throw new ShopifyOAuth.Rejected(
                        "INVALID_SHOPIFY_PRODUCT_RESPONSE"
                );
            }

            List<Product> products = new ArrayList<>();

            for (JsonNode node : nodes) {

                JsonNode image = node.path("featuredImage");

                JsonNode price = node.path("priceRangeV2")
                        .path("minVariantPrice");

                JsonNode variantsConnection = node.path("variants");
                JsonNode variantNodes = variantsConnection.path("nodes");

                List<Variant> variants = new ArrayList<>();

                if (variantNodes.isArray()) {
                    for (JsonNode variantNode : variantNodes) {

                        JsonNode selectedOptions =
                                variantNode.path("selectedOptions");

                        List<Option> options = new ArrayList<>();

                        if (selectedOptions.isArray()) {
                            for (JsonNode option : selectedOptions) {
                                options.add(new Option(
                                        text(option, "name"),
                                        text(option, "value")
                                ));
                            }
                        }

                        variants.add(new Variant(
                                text(variantNode, "id"),
                                text(variantNode, "title"),
                                variantNode.path("availableForSale").asBoolean(false),
                                text(variantNode, "price"),
                                text(price, "currencyCode"),
                                List.copyOf(options)
                        ));
                    }
                }

                boolean moreVariants = variantsConnection
                        .path("pageInfo")
                        .path("hasNextPage")
                        .asBoolean(false);

                products.add(new Product(
                        text(node, "id"),
                        text(node, "title"),
                        text(node, "handle"),
                        text(node, "description"),
                        text(image, "url"),
                        text(image, "altText"),
                        text(price, "amount"),
                        text(price, "currencyCode"),
                        text(node, "onlineStoreUrl"),
                        List.copyOf(variants),
                        moreVariants
                ));
            }

            return new Catalogue(List.copyOf(products));

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();

            throw new ShopifyOAuth.Rejected(
                    "SHOPIFY_PRODUCT_FETCH_INTERRUPTED"
            );
        } catch (Exception ex) {
            ex.printStackTrace();

            throw new ShopifyOAuth.Rejected(
                    "SHOPIFY_PRODUCT_FETCH_FAILED"
            );
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);

        if (value.isMissingNode() || value.isNull()) {
            return null;
        }

        return value.asText();
    }
}
