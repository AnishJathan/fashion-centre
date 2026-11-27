//package com.fashioncentre.auth;
//
//import com.fasterxml.jackson.databind.JsonNode;
//import com.fashioncentre.merchant.ShopifyOAuth;
//import java.net.URI;
//import java.net.URLEncoder;
//import java.net.http.HttpClient;
//import java.nio.charset.StandardCharsets;
//import java.time.Duration;
//import java.time.Instant;
//import java.util.Map;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.http.HttpStatus;
//import org.springframework.http.MediaType;
//import org.springframework.http.client.JdkClientHttpRequestFactory;
//import org.springframework.security.oauth2.jwt.Jwt;
//import org.springframework.security.oauth2.jwt.JwtDecoder;
//import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
//import org.springframework.stereotype.Component;
//import org.springframework.util.LinkedMultiValueMap;
//import org.springframework.web.client.RestClient;
//import org.springframework.web.server.ResponseStatusException;
//
///** Only this backend exchanges provider credentials. Shopify online grants identify the acting staff member. */
//@Component
//class SignInProviders {
//    static final String BASE = "/api/auth/sign-in/";
//    static final String APP_RETURN = "fashioncentre://auth/complete";
//    private static final String GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs";
//    private final String origin, googleId, googleSecret, shopifyId, shopifySecret;
//    private final RestClient http;
//    private final JwtDecoder googleTokens;
//
//    @Autowired
//    SignInProviders(@Value("${auth.public-origin:}") String origin,
//                    @Value("${auth.google-client-id:}") String googleId, @Value("${auth.google-client-secret:}") String googleSecret,
//                    @Value("${auth.shopify-client-id:}") String shopifyId, @Value("${auth.shopify-client-secret:}") String shopifySecret) {
//        this(origin, googleId, googleSecret, shopifyId, shopifySecret, client(), NimbusJwtDecoder.withJwkSetUri(GOOGLE_KEYS).build());
//    }
//
//    SignInProviders(String origin, String googleId, String googleSecret, String shopifyId, String shopifySecret,
//                    RestClient http, JwtDecoder googleTokens) {
//        this.origin = origin.isBlank() ? "" : validateOrigin(origin);
//        this.googleId = googleId;
//        this.googleSecret = googleSecret;
//        this.shopifyId = shopifyId;
//        this.shopifySecret = shopifySecret;
//        this.http = http;
//        this.googleTokens = googleTokens;
//    }
//
//    private static RestClient client() {
//        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
//        var requests = new JdkClientHttpRequestFactory(client);
//        requests.setReadTimeout(Duration.ofSeconds(10));
//        return RestClient.builder().requestFactory(requests).build();
//    }
//
//    private static String validateOrigin(String value) {
//        URI uri = URI.create(value);
//        boolean local = "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost());
//        if ((!local && !"https".equals(uri.getScheme())) || uri.getHost() == null || uri.getRawUserInfo() != null
//                || uri.getRawQuery() != null || uri.getRawFragment() != null
//                || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
//            throw new IllegalArgumentException("Use HTTPS or HTTP localhost for local Google testing.");
//        }
//        return uri.getScheme() + "://" + uri.getRawAuthority();
//    }
//
//    String origin(String provider) {
//        boolean ready = switch (provider) {
//            case "google" -> !googleId.isBlank() && !googleSecret.isBlank();
//            case "shopify" -> origin.startsWith("https://") && !shopifyId.isBlank() && !shopifySecret.isBlank();
//            default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND);
//        };
//        if (origin.isEmpty() || !ready) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
//        return origin;
//    }
//
//    static String shop(String value) {
//        try { return ShopifyOAuth.canonicalShop(value); }
//        catch (ShopifyOAuth.Rejected ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST); }
//    }
//
//    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
//
//    private String callback(String provider) { return origin + BASE + provider + "/callback"; }
//
//    URI authorization(String provider, String shop, String state, String browserKey) {
//        String common = "&state=" + state + "&redirect_uri=" + encode(callback(provider));
//        if ("shopify".equals(provider)) {
//            return URI.create("https://" + shop + "/admin/oauth/authorize?client_id=" + encode(shopifyId)
//                    + common + "&scope=read_products&grant_options%5B%5D=per-user");
//        }
//        return URI.create("https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encode(googleId) + common
//                + "&response_type=code&scope=openid%20profile&nonce=" + nonce(browserKey)
//                + "&code_challenge_method=S256&code_challenge=" + SignInStore.challenge(browserKey)
//                + "&prompt=select_account");
//    }
//
//    private static String nonce(String key) { return AuthService.sha256("google-nonce:" + key); }
//
//    record Identity(String subject, String firstName, Instant expires) {}
//
//    Identity exchange(String provider, String shop, Map<String, String> query, String browserKey) {
//        String code = query.get("code");
//        if (code == null || code.isBlank() || code.length() > 2048) throw new IllegalArgumentException("Missing code");
//        if ("shopify".equals(provider)) {
//            long timestamp = Long.parseLong(query.getOrDefault("timestamp", ""));
//            long now = Instant.now().getEpochSecond();
//            if (!shop.equals(query.get("shop")) || timestamp < now - 300 || timestamp > now + 60
//                    || !ShopifyOAuth.validHmac(query, shopifySecret.getBytes(StandardCharsets.UTF_8))) {
//                throw new IllegalArgumentException("Invalid Shopify callback");
//            }
//            JsonNode grant = http.post().uri("https://" + shop + "/admin/oauth/access_token")
//                    .contentType(MediaType.APPLICATION_JSON)
//                    .body(Map.of("client_id", shopifyId, "client_secret", shopifySecret, "code", code))
//                    .retrieve().body(JsonNode.class);
//            if (grant == null || grant.path("access_token").asText("").isBlank()) throw new IllegalArgumentException("Missing grant");
//            JsonNode actor = grant.path("associated_user").path("id");
//            long ttl = Math.min(86400, grant.path("expires_in").asLong(0));
//            if (!actor.isIntegralNumber() || !actor.asText().matches("[1-9][0-9]{0,19}") || ttl <= 0)
//                throw new IllegalArgumentException("Missing online identity");
//            return new Identity(actor.asText(), null, Instant.now().plusSeconds(ttl));
//        }
//        var form = new LinkedMultiValueMap<String, String>();
//        form.set("grant_type", "authorization_code");
//        form.set("code", code);
//        form.set("client_id", googleId);
//        form.set("client_secret", googleSecret);
//        form.set("redirect_uri", callback(provider));
//        form.set("code_verifier", browserKey);
//        JsonNode grant = http.post().uri("https://oauth2.googleapis.com/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
//                .body(form).retrieve().body(JsonNode.class);
//        if (grant == null || !grant.path("id_token").isTextual()) throw new IllegalArgumentException("Missing ID token");
//        Jwt jwt = googleTokens.decode(grant.get("id_token").textValue());
//        String issuer = jwt.getClaimAsString("iss"), azp = jwt.getClaimAsString("azp"), sub = jwt.getSubject();
//        if (!("https://accounts.google.com".equals(issuer) || "accounts.google.com".equals(issuer))
//                || jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now())
//                || jwt.getAudience() == null || !jwt.getAudience().contains(googleId)
//                || ((azp != null || jwt.getAudience().size() > 1) && !googleId.equals(azp))
//                || !nonce(browserKey).equals(jwt.getClaimAsString("nonce"))
//                || sub == null || sub.isBlank() || sub.length() > 255) throw new IllegalArgumentException("Invalid Google identity");
//        String name = jwt.getClaimAsString("given_name");
//        return new Identity(sub, name == null ? null : name.substring(0, Math.min(80, name.length())), null);
//    }
//}
package com.fashioncentre.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashioncentre.merchant.ShopifyOAuth;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Only this backend exchanges provider credentials. Shopify online grants identify the acting staff member. */
@Component
class SignInProviders {
    static final String BASE = "/api/auth/sign-in/";
    static final String APP_RETURN = "fashioncentre://auth/complete";
    private static final String GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v1/certs";
    private static final String APPLE_ISSUER = "https://appleid.apple.com";
    private static final String APPLE_AUTHORIZE = APPLE_ISSUER + "/auth/authorize";
    private static final String APPLE_TOKEN = APPLE_ISSUER + "/auth/token";
    private static final Pattern EXPO_GO_RETURN =
            Pattern.compile("exp://[A-Za-z0-9.-]+(:[0-9]{1,5})?/--/auth/complete");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String origin, googleId, googleSecret, shopifyId, shopifySecret;
    private final String appleServicesId, appleTeamId, appleKeyId;
    private final PrivateKey applePrivateKey;
    private final boolean allowExpoGo;
    private final RestClient http;
    private final JwtDecoder googleTokens, appleTokens;

    @Autowired
    SignInProviders(@Value("${auth.public-origin:}") String origin,
                    @Value("${auth.google-client-id:}") String googleId,
                    @Value("${auth.google-client-secret:}") String googleSecret,
                    @Value("${auth.shopify-client-id:}") String shopifyId,
                    @Value("${auth.shopify-client-secret:}") String shopifySecret,
                    @Value("${auth.apple-services-id:}") String appleServicesId,
                    @Value("${auth.apple-team-id:}") String appleTeamId,
                    @Value("${auth.apple-key-id:}") String appleKeyId,
                    @Value("${auth.apple-private-key:}") String applePem,
                    @Value("${auth.allow-expo-go:false}") boolean allowExpoGo) {
        this(origin, googleId, googleSecret, shopifyId, shopifySecret, appleServicesId, appleTeamId, appleKeyId,
                applePem, allowExpoGo, client(),
                NimbusJwtDecoder.withJwkSetUri(GOOGLE_KEYS).build(),
                NimbusJwtDecoder.withJwkSetUri(APPLE_ISSUER + "/auth/keys").build());
    }

    SignInProviders(String origin, String googleId, String googleSecret, String shopifyId, String shopifySecret,
                    String appleServicesId, String appleTeamId, String appleKeyId, String applePem,
                    boolean allowExpoGo, RestClient http, JwtDecoder googleTokens, JwtDecoder appleTokens) {
        this.origin = origin.isBlank() ? "" : validateOrigin(origin);
        this.googleId = googleId;
        this.googleSecret = googleSecret;
        this.shopifyId = shopifyId;
        this.shopifySecret = shopifySecret;
        this.appleServicesId = appleServicesId;
        this.appleTeamId = appleTeamId;
        this.appleKeyId = appleKeyId;
        this.applePrivateKey = applePem.isBlank() ? null : parseKey(applePem);
        this.allowExpoGo = allowExpoGo;
        this.http = http;
        this.googleTokens = googleTokens;
        this.appleTokens = appleTokens;
    }

    private static RestClient client() {
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var requests = new JdkClientHttpRequestFactory(client);
        requests.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder().requestFactory(requests).build();
    }

    private static String validateOrigin(String value) {
        URI uri = URI.create(value);
        boolean local = "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost());
        if ((!local && !"https".equals(uri.getScheme())) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Use HTTPS or HTTP localhost for local Google testing.");
        }
        return uri.getScheme() + "://" + uri.getRawAuthority();
    }

    private static PrivateKey parseKey(String pem) {
        try {
            String body = pem.replace("\\n", "\n")
                    .replaceAll("-----[A-Z ]+-----", "")
                    .replaceAll("\\s", "");
            return KeyFactory.getInstance("EC")
                    .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            throw new IllegalStateException("AUTH_APPLE_PRIVATE_KEY is not a PKCS#8 EC key.", ex);
        }
    }

    /** Dev: exp:// URLs from Expo Go, only when AUTH_ALLOW_EXPO_GO=true. Production: the app scheme only. */
    String validReturn(String value) {
        if (APP_RETURN.equals(value) || allowExpoGo && value != null && EXPO_GO_RETURN.matcher(value).matches())
            return value;
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Restart sign-in.");
    }

    String origin(String provider) {
        boolean ready = switch (provider) {
            case "google" -> !googleId.isBlank() && !googleSecret.isBlank();
            case "apple" -> origin.startsWith("https://") && !appleServicesId.isBlank()
                    && !appleTeamId.isBlank() && !appleKeyId.isBlank() && applePrivateKey != null;
            case "shopify" -> origin.startsWith("https://") && !shopifyId.isBlank() && !shopifySecret.isBlank();
            default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        };
        if (origin.isEmpty() || !ready) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        return origin;
    }

    static String shop(String value) {
        try { return ShopifyOAuth.canonicalShop(value); }
        catch (ShopifyOAuth.Rejected ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST); }
    }

    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

    private String callback(String provider) { return origin + BASE + provider + "/callback"; }

    private static String nonce(String key) { return AuthService.sha256("provider-nonce:" + key); }

    URI authorization(String provider, String shop, String state, String browserKey) {
        String redirect = "&state=" + state + "&redirect_uri=" + encode(callback(provider));
        return switch (provider) {
            case "shopify" -> URI.create("https://" + shop + "/admin/oauth/authorize?client_id=" + encode(shopifyId)
                    + redirect + "&scope=read_products&grant_options%5B%5D=per-user");
            case "apple" -> URI.create(APPLE_AUTHORIZE + "?client_id=" + encode(appleServicesId) + redirect
                    + "&response_type=code&response_mode=form_post&scope=name%20email&nonce=" + nonce(browserKey));
            default -> URI.create("https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encode(googleId)
                    + redirect + "&response_type=code&scope=openid%20profile&nonce=" + nonce(browserKey)
                    + "&code_challenge_method=S256&code_challenge=" + SignInStore.challenge(browserKey)
                    + "&prompt=select_account");
        };
    }

    record Identity(String subject, String firstName, Instant expires) {}

    Identity exchange(String provider, String shop, Map<String, String> query, String browserKey) {
        String code = query.get("code");
        if (code == null || code.isBlank() || code.length() > 2048) throw new IllegalArgumentException("Missing code");
        return switch (provider) {
            case "shopify" -> exchangeShopify(shop, code, query);
            case "apple" -> exchangeApple(code, query, browserKey);
            default -> exchangeGoogle(code, browserKey);
        };
    }

    private Identity exchangeShopify(String shop, String code, Map<String, String> query) {
        long timestamp = Long.parseLong(query.getOrDefault("timestamp", ""));
        long now = Instant.now().getEpochSecond();
        if (!shop.equals(query.get("shop")) || timestamp < now - 300 || timestamp > now + 60
                || !ShopifyOAuth.validHmac(query, shopifySecret.getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("Invalid Shopify callback");
        }
        JsonNode grant = http.post().uri("https://" + shop + "/admin/oauth/access_token")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("client_id", shopifyId, "client_secret", shopifySecret, "code", code))
                .retrieve().body(JsonNode.class);
        if (grant == null || grant.path("access_token").asText("").isBlank())
            throw new IllegalArgumentException("Missing grant");
        JsonNode actor = grant.path("associated_user").path("id");
        long ttl = Math.min(86400, grant.path("expires_in").asLong(0));
        if (!actor.isIntegralNumber() || !actor.asText().matches("[1-9][0-9]{0,19}") || ttl <= 0)
            throw new IllegalArgumentException("Missing online identity");
        return new Identity(actor.asText(), null, Instant.now().plusSeconds(ttl));
    }

    private Identity exchangeGoogle(String code, String browserKey) {
        var form = new LinkedMultiValueMap<String, String>();
        form.set("grant_type", "authorization_code");
        form.set("code", code);
        form.set("client_id", googleId);
        form.set("client_secret", googleSecret);
        form.set("redirect_uri", callback("google"));
        form.set("code_verifier", browserKey);
        JsonNode grant = http.post().uri("https://oauth2.googleapis.com/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form)
                .retrieve().body(JsonNode.class);
        if (grant == null || !grant.path("id_token").isTextual()) throw new IllegalArgumentException("Missing ID token");
        Jwt jwt = googleTokens.decode(grant.get("id_token").textValue());
        String issuer = jwt.getClaimAsString("iss"), azp = jwt.getClaimAsString("azp"), sub = jwt.getSubject();
        if (!("https://accounts.google.com".equals(issuer) || "accounts.google.com".equals(issuer))
                || jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now())
                || jwt.getAudience() == null || !jwt.getAudience().contains(googleId)
                || ((azp != null || jwt.getAudience().size() > 1) && !googleId.equals(azp))
                || !nonce(browserKey).equals(jwt.getClaimAsString("nonce"))
                || sub == null || sub.isBlank() || sub.length() > 255)
            throw new IllegalArgumentException("Invalid Google identity");
        String name = jwt.getClaimAsString("given_name");
        return new Identity(sub, name == null ? null : name.substring(0, Math.min(80, name.length())), null);
    }

    private Identity exchangeApple(String code, Map<String, String> query, String browserKey) {
        var form = new LinkedMultiValueMap<String, String>();
        form.set("grant_type", "authorization_code");
        form.set("code", code);
        form.set("client_id", appleServicesId);
        form.set("client_secret", appleClientSecret());
        form.set("redirect_uri", callback("apple"));
        JsonNode grant = http.post().uri(APPLE_TOKEN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form)
                .retrieve().body(JsonNode.class);
        if (grant == null || !grant.path("id_token").isTextual()) throw new IllegalArgumentException("Missing ID token");
        Jwt jwt = appleTokens.decode(grant.get("id_token").textValue());
        String sub = jwt.getSubject();
        if (!APPLE_ISSUER.equals(jwt.getClaimAsString("iss"))
                || jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now())
                || jwt.getAudience() == null || !jwt.getAudience().contains(appleServicesId)
                || !nonce(browserKey).equals(jwt.getClaimAsString("nonce"))
                || sub == null || sub.isBlank() || sub.length() > 255)
            throw new IllegalArgumentException("Invalid Apple identity");
        // Apple sends the name only on the first authorization, as JSON in the "user" form field.
        return new Identity(sub, appleName(query.get("user")), null);
    }

    private static String appleName(String user) {
        if (user == null || user.length() > 4096) return null;
        try {
            String first = JSON.readTree(user).path("name").path("firstName").asText("").strip();
            return first.isEmpty() ? null : first.substring(0, Math.min(80, first.length()));
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    /** Short-lived ES256 client secret, signed for each sign-in. Nothing needs regenerating on a schedule. */
    private String appleClientSecret() {
        Instant now = Instant.now();
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(appleKeyId).build(),
                    new JWTClaimsSet.Builder()
                            .issuer(appleTeamId)
                            .subject(appleServicesId)
                            .audience(APPLE_ISSUER)
                            .issueTime(Date.from(now))
                            .expirationTime(Date.from(now.plusSeconds(300)))
                            .build());
            jwt.sign(new ECDSASigner((ECPrivateKey) applePrivateKey));
            return jwt.serialize();
        } catch (JOSEException ex) {
            throw new IllegalStateException("Apple client secret could not be signed.", ex);
        }
    }
}