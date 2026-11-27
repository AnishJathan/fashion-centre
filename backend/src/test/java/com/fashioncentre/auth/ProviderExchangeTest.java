package com.fashioncentre.auth;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ProviderExchangeTest {
    static final String SHOP = "fixture.myshopify.com", KEY = "fixture-secret", BROWSER = SignInStore.token();
    final RestClient.Builder http = RestClient.builder();
    final MockRestServiceServer provider = MockRestServiceServer.bindTo(http).build();
    final KeyPair keys = rsa();
    final SignInProviders client = new SignInProviders(
            "https://fashion.example",
            "google-id", KEY,
            "shop-id", KEY,
            "", "", "", "",          // Apple disabled
            false,                    // allowExpoGo
            http.build(),
            NimbusJwtDecoder.withPublicKey((RSAPublicKey) keys.getPublic()).build(),
            NimbusJwtDecoder.withPublicKey((RSAPublicKey) keys.getPublic()).build());  // Apple decoder, unused here
    static KeyPair rsa() {
        try { var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048); return generator.generateKeyPair(); }
        catch (Exception ex) { throw new AssertionError(ex); }
    }

    private String token(String audience, String nonce, KeyPair signer) throws Exception {
        var claims = new JWTClaimsSet.Builder().issuer("https://accounts.google.com").audience(audience).subject("stable-subject")
                .claim("given_name","Ada").claim("nonce",nonce).issueTime(new Date())
                .expirationTime(Date.from(Instant.now().plusSeconds(300))).build();
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
        jwt.sign(new RSASSASigner(signer.getPrivate()));
        return jwt.serialize();
    }

    @Test void googleOnlyAcceptsSignedTokensForThisClientAndThisBrowser() throws Exception {
        String nonce = AuthService.sha256("google-nonce:" + BROWSER);
        assertThat(client.authorization("google",null,"state",BROWSER).toString()).contains("nonce="+nonce,
                "code_challenge="+SignInStore.challenge(BROWSER)).doesNotContain(BROWSER);
        var tokens = List.of(token("google-id",nonce,keys), token("other-id",nonce,keys),
                token("google-id","old-nonce",keys), token("google-id",nonce,rsa()));
        for (String jwt : tokens) {
            provider.expect(requestTo("https://oauth2.googleapis.com/token")).andExpect(content().string(org.hamcrest.Matchers.containsString("code_verifier="+BROWSER)))
                    .andRespond(withSuccess("{\"id_token\":\""+jwt+"\"}", MediaType.APPLICATION_JSON));
        }
        Map<String,String> params = Map.of("code","sample-code");
        assertThat(client.exchange("google",null,params,BROWSER)).isEqualTo(new SignInProviders.Identity("stable-subject","Ada",null));
        for (int i=1; i<tokens.size(); i++)
            assertThatThrownBy(() -> client.exchange("google", null, params, BROWSER)).isInstanceOf(RuntimeException.class);
        provider.verify();
    }

    private static Map<String,String> signedCallback(String shop, long timestamp) throws Exception {
        var query = new TreeMap<>(Map.of("shop",shop,"timestamp",Long.toString(timestamp),"code","fixture","state","fixture-state"));
        String message = query.entrySet().stream().map(e -> e.getKey()+"="+e.getValue()).collect(Collectors.joining("&"));
        var hmac = Mac.getInstance("HmacSHA256");
        hmac.init(new SecretKeySpec(KEY.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        query.put("hmac", HexFormat.of().formatHex(hmac.doFinal(message.getBytes(StandardCharsets.UTF_8))));
        return query;
    }

    @Test void shopifyRequiresASignedRecentCallbackForThatShopAndAnOnlineUserGrant() throws Exception {
        assertThat(client.authorization("shopify",SHOP,"state",BROWSER).toString()).contains("grant_options%5B%5D=per-user");
        var query = signedCallback(SHOP, Instant.now().getEpochSecond());
        String endpoint = "https://"+SHOP+"/admin/oauth/access_token";
        provider.expect(requestTo(endpoint)).andRespond(withSuccess("{\"access_token\":\"fixture\",\"expires_in\":3600,\"associated_user\":{\"id\":123}}",MediaType.APPLICATION_JSON));
        provider.expect(requestTo(endpoint)).andRespond(withSuccess("{\"access_token\":\"offline-fixture\"}",MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.exchange("shopify", "other.myshopify.com", query, BROWSER)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.exchange("shopify", SHOP, signedCallback(SHOP, 1), BROWSER)).isInstanceOf(IllegalArgumentException.class);
        var invalid = new TreeMap<>(query);
        invalid.put("hmac","0".repeat(64));
        assertThatThrownBy(() -> client.exchange("shopify", SHOP, invalid, BROWSER)).isInstanceOf(IllegalArgumentException.class);
        assertThat(client.exchange("shopify", SHOP, query, BROWSER).subject()).isEqualTo("123");
        assertThatThrownBy(() -> client.exchange("shopify", SHOP, query, BROWSER)).isInstanceOf(IllegalArgumentException.class);
        provider.verify();
    }

    @Test void providersWithoutCredentialsAreUnavailable() {
        var empty = new SignInProviders(
                "", "", "", "", "",
                "", "", "", "",
                false,
                RestClient.builder().build(),
                null,
                null);                 // Apple decoder: not used when origin is empty                 // Apple decoder: not used when origin is empty
        assertThatThrownBy(() -> empty.origin("google")).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(503));
        assertThatThrownBy(() -> empty.origin("shopify")).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(503));
    }
}
