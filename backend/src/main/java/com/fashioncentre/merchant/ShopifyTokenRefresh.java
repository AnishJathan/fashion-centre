package com.fashioncentre.merchant;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

public final class ShopifyTokenRefresh {

    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;

    public ShopifyTokenRefresh(
            RestClient.Builder builder,
            String clientId,
            String clientSecret
    ) {
        this.restClient = builder.build();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    /**
     * Refresh an expiring Shopify offline access token.
     *
     * Shopify returns a new access token and refresh token.
     * The caller must persist the new Grant atomically.
     */
    public ShopifyOAuth.Grant refresh(
            String shop,
            ShopifyOAuth.Grant currentGrant
    ) {

        if (shop == null
                || !shop.matches(
                    "^[a-zA-Z0-9][a-zA-Z0-9-]*\\.myshopify\\.com$"
                )
                || currentGrant == null
                || currentGrant.refreshToken() == null
                || currentGrant.refreshToken().isBlank()) {

            throw new ShopifyOAuth.Rejected(
                    "INVALID_REFRESH_REQUEST"
            );
        }

        URI endpoint = URI.create(
                "https://" + shop + "/admin/oauth/access_token"
        );

        try {
            LinkedMultiValueMap<String, String> form =
                    new LinkedMultiValueMap<>();

            form.add("client_id", clientId);
            form.add("client_secret", clientSecret);
            form.add("grant_type", "refresh_token");
            form.add(
                    "refresh_token",
                    currentGrant.refreshToken()
            );

            JsonNode response = restClient.post()
                    .uri(endpoint)
                    .contentType(
                            MediaType.APPLICATION_FORM_URLENCODED
                    )
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) {
                throw new ShopifyOAuth.Rejected(
                        "EMPTY_REFRESH_RESPONSE"
                );
            }

            String accessToken =
                    response.path("access_token").asText(null);

            String refreshToken =
                    response.path("refresh_token").asText(null);

            long expiresIn =
                    response.path("expires_in").asLong(0);

            long refreshTokenExpiresIn =
                    response.path("refresh_token_expires_in")
                            .asLong(0);

            String scopeValue =
                    response.path("scope").asText(null);

            if (accessToken == null
                    || accessToken.isBlank()
                    || refreshToken == null
                    || refreshToken.isBlank()
                    || expiresIn <= 0
                    || refreshTokenExpiresIn <= 0) {

                throw new ShopifyOAuth.Rejected(
                        "INVALID_REFRESH_RESPONSE"
                );
            }

            Set<String> scopes;

            if (scopeValue != null && !scopeValue.isBlank()) {
                scopes = new HashSet<>();

                for (String scope : scopeValue.split(",")) {
                    String trimmed = scope.trim();

                    if (!trimmed.isEmpty()) {
                        scopes.add(trimmed);
                    }
                }
            } else {
                scopes = currentGrant.scopes();
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
                    "SHOPIFY_TOKEN_REFRESH_FAILED"
            );
        }
    }
}