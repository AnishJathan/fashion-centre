
package com.fashioncentre.merchant;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/merchant/brands")
public class BrandController {

    private final ObjectProvider<JdbcConnections> connections;

    public BrandController(ObjectProvider<JdbcConnections> connections) {
        this.connections = connections;
    }

    public record RegisterBrandRequest(String name) {}

    public record BrandResponse(String id, String name) {}

    @PostMapping
    public ResponseEntity<?> registerBrand(
            @RequestBody RegisterBrandRequest request,
            HttpServletRequest httpRequest
    ) {
        // Validate CSRF token
        var session = httpRequest.getSession(false);

        if (session == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "CSRF_INVALID"));
        }

        Object storedToken = session.getAttribute("merchant.csrf");
        String suppliedToken = httpRequest.getHeader("X-CSRF-Token");

        if (!(storedToken instanceof String expectedToken)
                || suppliedToken == null
                || !MessageDigest.isEqual(
                        expectedToken.getBytes(StandardCharsets.UTF_8),
                        suppliedToken.getBytes(StandardCharsets.UTF_8)
                )) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "CSRF_INVALID"));
        }

        try {
            JdbcConnections.Brand brand =
                    connections.getObject().registerBrand(
                            request == null ? null : request.name()
                    );

            return ResponseEntity
                    .status(HttpStatus.CREATED)
                    .body(new BrandResponse(brand.id(), brand.name()));

        } catch (ShopifyOAuth.Rejected ex) {
            String code = ex.getMessage();

            HttpStatus status = switch (code == null ? "" : code) {
                case "MERCHANT_SIGN_IN_REQUIRED" ->
                        HttpStatus.UNAUTHORIZED;
                case "INVALID_BRAND_NAME" ->
                        HttpStatus.BAD_REQUEST;
                case "BRAND_ACCESS_DENIED" ->
                        HttpStatus.FORBIDDEN;
                default ->
                        HttpStatus.SERVICE_UNAVAILABLE;
            };

            return ResponseEntity
                    .status(status)
                    .body(Map.of("error", code == null
                            ? "BRAND_REGISTRATION_FAILED" : code));
        }
    }
}
