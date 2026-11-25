package com.fashioncentre.merchant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Component
public final class ShopifyTokenExchange
        implements ShopifyOAuth.TokenExchange {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public ShopifyTokenExchange(
            RestClient.Builder builder,
            ObjectMapper objectMapper
    ) {
        this.restClient = builder.build();
        this.objectMapper = objectMapper;
    }

    @Override
    public ShopifyOAuth.Grant exchange(
            URI endpoint,
            String clientId,
            byte[] secret,
            String code
    ) {

        if (endpoint == null
                || !"https".equalsIgnoreCase(endpoint.getScheme())
                || endpoint.getHost() == null
                || !endpoint.getHost().endsWith(".myshopify.com")
                || clientId == null
                || clientId.isBlank()
                || secret == null
                || secret.length == 0
                || code == null
                || code.isBlank()) {

            throw new ShopifyOAuth.Rejected(
                    "INVALID_TOKEN_EXCHANGE_REQUEST"
            );
        }

        String clientSecret =
                new String(secret, StandardCharsets.UTF_8);

        try {
            LinkedMultiValueMap<String, String> form =
                    new LinkedMultiValueMap<>();

            form.add("client_id", clientId);
            form.add("client_secret", clientSecret);
            form.add("code", code);
            form.add("expiring", "1");

            String response = restClient.post()
                    .uri(endpoint)
                    .contentType(
                            MediaType.APPLICATION_FORM_URLENCODED
                    )
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve()
                    .body(String.class);

            if (response == null || response.isBlank()) {
                throw new ShopifyOAuth.Rejected(
                        "EMPTY_TOKEN_RESPONSE"
                );
            }

            JsonNode json = objectMapper.readTree(response);

            String accessToken =
                    json.path("access_token").asText(null);

            String refreshToken =
                    json.path("refresh_token").asText(null);

            String scopeValue =
                    json.path("scope").asText(null);

            long expiresIn =
                    json.path("expires_in").asLong(0);

            long refreshTokenExpiresIn =
                    json.path("refresh_token_expires_in")
                            .asLong(0);

            if (accessToken == null
                    || accessToken.isBlank()
                    || refreshToken == null
                    || refreshToken.isBlank()
                    || scopeValue == null
                    || scopeValue.isBlank()
                    || expiresIn <= 0
                    || refreshTokenExpiresIn <= 0) {

                throw new ShopifyOAuth.Rejected(
                        "INVALID_TOKEN_RESPONSE"
                );
            }

            Set<String> scopes = new HashSet<>();

            for (String scope : scopeValue.split(",")) {
                String trimmed = scope.trim();

                if (!trimmed.isEmpty()) {
                    scopes.add(trimmed);
                }
            }

            Instant now = Instant.now();

            return new ShopifyOAuth.Grant(
                    accessToken,
                    refreshToken,
                    now.plusSeconds(expiresIn),
                    now.plusSeconds(refreshTokenExpiresIn),
                    scopes
            );

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ShopifyOAuth.Rejected(
                    "SHOPIFY_TOKEN_EXCHANGE_FAILED"
            );
        }
    }
}