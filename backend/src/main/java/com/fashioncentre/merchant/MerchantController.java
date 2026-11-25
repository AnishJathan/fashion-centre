
package com.fashioncentre.merchant;

import com.fashioncentre.auth.AuthService;
import com.fashioncentre.auth.User;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/merchant/shopify")
public class MerchantController {

    private final ShopifyOAuth flow;
    private final AuthService authService;
    private final ShopifyProductService productService;
    private final JdbcConnections jdbcConnections;
    private final PublicCatalogueService publicCatalogue;
    private final boolean allowPrincipalForTests;

    public MerchantController() {
        this.flow = null;
        this.authService = null;
        this.productService = null;
        this.jdbcConnections = null;
        this.publicCatalogue = null;
        this.allowPrincipalForTests = false;
    }

    @Autowired
    public MerchantController(
            AuthService authService,
            ShopifyOAuth flow,
            ShopifyProductService productService,
            JdbcConnections jdbcConnections,
            PublicCatalogueService publicCatalogue) {

        this.authService = authService;
        this.flow = flow;
        this.productService = productService;
        this.jdbcConnections = jdbcConnections;
        this.publicCatalogue = publicCatalogue;
        this.allowPrincipalForTests = false;
    }

    MerchantController(ShopifyOAuth flow) {
        this.flow = flow;
        this.authService = null;
        this.productService = null;
        this.jdbcConnections = null;
        this.publicCatalogue = null;
        this.allowPrincipalForTests = true;
    }

    MerchantController(
            ShopifyOAuth flow,
            JdbcConnections jdbcConnections) {

        this.flow = flow;
        this.authService = null;
        this.productService = null;
        this.jdbcConnections = jdbcConnections;
        this.publicCatalogue = null;
        this.allowPrincipalForTests = true;
    }

    private Optional<User> authenticatedUser(HttpServletRequest request) {

        if (authService == null || request.getCookies() == null) {
            return Optional.empty();
        }

        for (Cookie cookie : request.getCookies()) {
            if ("fc_session".equals(cookie.getName())) {
                String token = cookie.getValue();

                if (token == null || token.isBlank()) {
                    return Optional.empty();
                }

                return authService.currentUser(token);
            }
        }

        return Optional.empty();
    }

    private ShopifyOAuth.Identity identity(HttpServletRequest request) {

        Optional<User> user = authenticatedUser(request);

        if (user.isPresent()) {

            String token = Arrays.stream(
                    Optional.ofNullable(request.getCookies())
                            .orElse(new Cookie[0]))
                    .filter(cookie -> "fc_session".equals(cookie.getName()))
                    .map(Cookie::getValue)
                    .filter(value -> value != null && !value.isBlank())
                    .findFirst()
                    .orElse(null);

            if (token == null) {
                return null;
            }

            try {
                String sessionId = HexFormat.of().formatHex(
                        MessageDigest.getInstance("SHA-256")
                                .digest(token.getBytes(StandardCharsets.UTF_8))
                );

                return new ShopifyOAuth.Identity(
                        user.get().getId(),
                        sessionId
                );

            } catch (Exception ex) {
                return null;
            }
        }

        if (!allowPrincipalForTests) {
            return null;
        }

        var principal = request.getUserPrincipal();
        var session = request.getSession(false);

        if (principal == null || session == null) {
            return null;
        }

        return new ShopifyOAuth.Identity(
                principal.getName(),
                session.getId()
        );
    }

    private boolean validCsrf(HttpServletRequest request) {

        var session = request.getSession(false);

        Object csrf = session != null
                ? session.getAttribute("merchant.csrf")
                : null;

        String sent = request.getHeader("X-CSRF-Token");

        return csrf instanceof String expected
                && !expected.isBlank()
                && expected.length() <= 256
                && sent != null
                && sent.length() <= 256
                && MessageDigest.isEqual(
                        expected.getBytes(StandardCharsets.UTF_8),
                        sent.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/readiness")
    public ResponseEntity<?> readiness(HttpServletRequest request) {

        var user = authenticatedUser(request);
        boolean authenticated = user.isPresent();

        boolean configured = flow != null
                && authService != null
                && productService != null
                && jdbcConnections != null
                && publicCatalogue != null;

        boolean connected = false;
        String brandId = null;

        List<String> blockers = new java.util.ArrayList<>();

        if (!authenticated) {
            blockers.add("Authenticated brand-owner sign-in is required.");
        }

        if (!configured) {
            blockers.add("Shopify backend services are not configured.");
        }

        if (authenticated && configured) {
            try {
                var brand = jdbcConnections.resolveBrandForCurrentActor();
                brandId = brand.id();
                connected = jdbcConnections.read(brandId).isPresent();

            } catch (ShopifyOAuth.Rejected ex) {
                blockers.add(ex.getMessage());

            } catch (RuntimeException ex) {
                blockers.add("Unable to verify Shopify connection.");
            }
        }

        if (!connected) {
            blockers.add("Shopify store is not connected for this brand.");
        }

        boolean ready = authenticated && configured && connected;

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of(
                        "ready", ready,
                        "authenticated", authenticated,
                        "configured", configured,
                        "connected", connected,
                        "connections", connected && brandId != null
                                ? List.of(Map.of("brandId", brandId))
                                : List.of(),
                        "blockers", blockers
                ));
    }

    @GetMapping("/stores")
    public ResponseEntity<?> stores(HttpServletRequest request) {

        if (identity(request) == null) {
            return failure(401, "MERCHANT_SIGN_IN_REQUIRED");
        }

        if (jdbcConnections == null) {
            return failure(503, "SHOPIFY_NOT_CONFIGURED");
        }

        try {
            var brand = jdbcConnections.resolveBrandForCurrentActor();
            var connection = jdbcConnections.read(brand.id());

            List<Map<String, Object>> stores = connection.isPresent()
                    ? List.of(Map.<String, Object>of(
                            "shop", connection.get().shop(),
                            "status", "connected"))
                    : List.of();

            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("stores", stores));

        } catch (ShopifyOAuth.Rejected ex) {
            return failure(400, ex.getMessage());
        }
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync(HttpServletRequest request) {

        if (identity(request) == null) {
            return failure(401, "MERCHANT_SIGN_IN_REQUIRED");
        }

        if (!validCsrf(request)) {
            return failure(403, "INVALID_CSRF");
        }

        if (productService == null
                || jdbcConnections == null
                || publicCatalogue == null) {
            return failure(503, "SHOPIFY_NOT_CONFIGURED");
        }

        try {
            var brand = jdbcConnections.resolveBrandForCurrentActor();
            var connection = jdbcConnections.read(brand.id());

            if (connection.isEmpty()) {
                return failure(400, "SHOPIFY_NOT_CONNECTED");
            }

            var catalogue = productService.fetchProducts(brand.id(), 48);

            publicCatalogue.save(
                    brand.id(),
                    connection.get().shop(),
                    brand.name(),
                    catalogue
            );

            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("synced", catalogue.products().size()));

        } catch (ShopifyOAuth.Rejected ex) {
            return failure(400, ex.getMessage());
        }
    }

    @PostMapping("/install")
    public ResponseEntity<?> install(
            @RequestBody Install input,
            HttpServletRequest request) {

        var identity = identity(request);

        if (identity == null) {
            return failure(401, "MERCHANT_SIGN_IN_REQUIRED");
        }

        if (input == null || input.shop() == null || input.shop().isBlank()) {
            return failure(400, "INVALID_INSTALL_REQUEST");
        }

        if (!validCsrf(request)) {
            return failure(403, "INVALID_CSRF");
        }

        if (flow == null || jdbcConnections == null) {
            return failure(503, "SHOPIFY_NOT_CONFIGURED");
        }

        try {
            var brand = jdbcConnections.resolveBrandForCurrentActor();

            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of(
                            "authorizationUrl",
                            flow.begin(
                                    identity,
                                    brand.id(),
                                    input.shop()
                            ).toString()
                    ));

        } catch (ShopifyOAuth.Rejected ex) {
            return failure(400, ex.getMessage());
        }
    }

    @GetMapping("/products")
    public ResponseEntity<?> products(
            @RequestParam(defaultValue = "50") int limit,
            HttpServletRequest request) {

        if (identity(request) == null) {
            return failure(401, "MERCHANT_SIGN_IN_REQUIRED");
        }

        if (limit < 1 || limit > 100) {
            return failure(400, "INVALID_PRODUCT_LIMIT");
        }

        if (productService == null || jdbcConnections == null) {
            return failure(503, "SHOPIFY_PRODUCT_SERVICE_NOT_CONFIGURED");
        }

        try {
            var brand = jdbcConnections.resolveBrandForCurrentActor();

            var catalogue = productService.fetchProducts(
                    brand.id(),
                    limit
            );

            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .header("Referrer-Policy", "no-referrer")
                    .body(catalogue);

        } catch (ShopifyOAuth.Rejected ex) {
            return failure(400, ex.getMessage());
        }
    }

    @GetMapping("/callback")
    public ResponseEntity<?> callback(
            @RequestParam MultiValueMap<String, String> query,
            HttpServletRequest request) {

        if (flow == null) {
            return failure(503, "SHOPIFY_NOT_CONFIGURED");
        }

        try {
            flow.callback(query);

            return ResponseEntity.status(303)
                    .header(HttpHeaders.LOCATION, "/#/owner")
                    .cacheControl(CacheControl.noStore())
                    .header("Referrer-Policy", "no-referrer")
                    .build();

        } catch (ShopifyOAuth.Rejected ex) {
            return failure(400, ex.getMessage());
        }
    }

    private ResponseEntity<?> failure(int status, String code) {

        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .body(Map.of(
                        "code", code,
                        "connected", false,
                        "message",
                        "Shopify connection was not completed. Return to the brand-owner dashboard to review setup."
                ));
    }

    public record Install(String shop) {}
}
