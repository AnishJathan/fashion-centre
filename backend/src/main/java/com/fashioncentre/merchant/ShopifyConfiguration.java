package com.fashioncentre.merchant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.web.client.RestClient;

@Configuration
public class ShopifyConfiguration {

    @Bean
    public EncryptedConnections encryptedConnections(
            @Value("${SHOPIFY_ENCRYPTION_KEY}") String encryptionKey,
            JdbcConnections jdbcConnections) {

        byte[] keyBytes;

        try {
            keyBytes = Base64.getDecoder().decode(encryptionKey);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "Invalid Shopify encryption key", ex);
        }

        try {
            if (keyBytes.length != 32) {
                throw new IllegalStateException(
                        "Shopify encryption key must be 32 bytes");
            }

            return new EncryptedConnections(
                    new SecretKeySpec(keyBytes, "AES"),
                    jdbcConnections
            );

        } finally {
            Arrays.fill(keyBytes, (byte) 0);
        }
    }

    @Bean
    public ShopifyTokenRefresh shopifyTokenRefresh(
            RestClient.Builder builder,
            @Value("${shopify.client-id}") String clientId,
            @Value("${shopify.client-secret}") String clientSecret) {

        return new ShopifyTokenRefresh(
                builder,
                clientId,
                clientSecret
        );
    }

    @Bean
    public ShopifyOAuth shopifyOAuth(
            @Value("${shopify.client-id}") String clientId,
            @Value("${shopify.client-secret}") String clientSecret,
            @Value("${shopify.redirect-uri}") String redirectUri,
            @Value("${shopify.scopes:read_products}") String scopes,
            JdbcConnections jdbcConnections,
            ShopifyTokenExchange tokenExchange,
            EncryptedConnections encryption,
            Clock clock) {

        Set<String> requestedScopes = Arrays.stream(
                scopes.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());

        return new ShopifyOAuth(
                clientId,
                clientSecret.getBytes(StandardCharsets.UTF_8),
                URI.create(redirectUri),
                requestedScopes,
                jdbcConnections,
                tokenExchange,
                encryption,
                clock
        );
    }
}