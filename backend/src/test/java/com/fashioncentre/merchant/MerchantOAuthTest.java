package com.fashioncentre.merchant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.net.*;import java.nio.charset.StandardCharsets;import java.time.*;import java.util.*;import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;import javax.crypto.Cipher;import javax.crypto.spec.*;
import org.h2.jdbcx.JdbcDataSource;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.concurrent.atomic.AtomicReference;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class MerchantOAuthTest {
 final byte[] secret="test-only-secret-not-a-credential".getBytes(StandardCharsets.UTF_8);
 final Instant now=Instant.parse("2026-10-18T12:00:00Z");final ShopifyOAuth.Identity owner=new ShopifyOAuth.Identity("owner","session");
 ShopifyOAuth flow(AtomicInteger calls,ShopifyOAuth.Connections store){return new ShopifyOAuth("test-client",secret,URI.create("https://example.test/api/merchant/shopify/callback"),Set.of("read_products"),(o,b)->o.equals("owner")&&b.equals("brand"),(uri,id,s,code)->{assertEquals("https://brand.myshopify.com/admin/oauth/access_token",uri.toString());calls.incrementAndGet();return new ShopifyOAuth.Grant("test-token",Set.of("read_products"));},store,Clock.fixed(now,ZoneOffset.UTC));}
 Map<String,List<String>> signed(String state,String shop,long timestamp)throws Exception{String message="code=test-code&shop="+shop+"&state="+state+"&timestamp="+timestamp;Mac m=Mac.getInstance("HmacSHA256");m.init(new SecretKeySpec(secret,"HmacSHA256"));Map<String,List<String>> q=new HashMap<>();q.put("code",List.of("test-code"));q.put("shop",List.of(shop));q.put("state",List.of(state));q.put("timestamp",List.of(""+timestamp));q.put("hmac",List.of(HexFormat.of().formatHex(m.doFinal(message.getBytes(StandardCharsets.UTF_8)))));return q;}
 String state(ShopifyOAuth f){String u=f.begin(owner,"brand"," BRAND.myshopify.com ").toString();assertTrue(u.startsWith("https://brand.myshopify.com/admin/oauth/authorize?"));return u.substring(u.indexOf("&state=")+7);}
 @Test void roundTripConsumesStateAndReturnsNoToken()throws Exception{var calls=new AtomicInteger();var saved=new AtomicInteger();var f=flow(calls,(o,b,s,g)->saved.incrementAndGet());var q=signed(state(f),"brand.myshopify.com",now.getEpochSecond());var c=f.callback(owner,q);assertEquals("brand",c.brandId());assertFalse(c.toString().contains("test-token"));assertEquals(1,saved.get());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q));assertEquals(1,calls.get());}
 @Test void rejectsTamperingDuplicatesWrongSessionAndWrongShop()throws Exception{var calls=new AtomicInteger();var f=flow(calls,(o,b,s,g)->{});var state=state(f);var q=signed(state,"brand.myshopify.com",now.getEpochSecond());q.put("code",List.of("tampered"));assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q));q.put("code",List.of("test-code","other"));assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q));var valid=signed(state,"brand.myshopify.com",now.getEpochSecond());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(new ShopifyOAuth.Identity("owner","other-session"),valid));var wrong=signed(state,"other.myshopify.com",now.getEpochSecond());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,wrong));assertEquals(0,calls.get());}
 @Test void rejectsStaleTimeAndUnauthorizedOwner()throws Exception{var calls=new AtomicInteger();var f=flow(calls,(o,b,s,g)->{});var q=signed(state(f),"brand.myshopify.com",now.minusSeconds(301).getEpochSecond());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q));assertThrows(ShopifyOAuth.Rejected.class,()->f.begin(new ShopifyOAuth.Identity("intruder","session"),"brand","brand.myshopify.com"));assertEquals(0,calls.get());}
 @Test void rejectsNonCanonicalDomains(){for(String s:List.of("https://brand.myshopify.com","brand.myshopify.com.evil.test","brand.myshopify.com:443","brand.myshopify.com/a","evil@brand.myshopify.com"))assertThrows(ShopifyOAuth.Rejected.class,()->ShopifyOAuth.canonicalShop(s));}
 @Test void failedStorageConsumesAuthorization()throws Exception{var calls=new AtomicInteger();var f=flow(calls,(o,b,s,g)->{throw new IllegalStateException("private error");});var q=signed(state(f),"brand.myshopify.com",now.getEpochSecond());assertEquals("CONNECTION_FAILED_RESTART_REQUIRED",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q)).getMessage());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,q));assertEquals(1,calls.get());}

@Test
void encryptedStorageBindsCiphertextToTenant() throws Exception {
    var key = new SecretKeySpec(new byte[32], "AES");
    List<EncryptedConnections.Stored> records = new ArrayList<>();

    var store = new EncryptedConnections(key, records::add);

    store.save(
            "owner",
            "brand",
            "brand.myshopify.com",
            new ShopifyOAuth.Grant("test-token", Set.of("read_products"))
    );

    var stored = records.get(0);

    // Decrypt using the correct tenant identity.
    var cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            new GCMParameterSpec(128, stored.nonce())
    );

    cipher.updateAAD(
            EncryptedConnections.aad(
                    "owner",
                    "brand",
                    "brand.myshopify.com",
                    stored.scopes()
            )
    );

    var decrypted = new String(
            cipher.doFinal(stored.ciphertext()),
            StandardCharsets.UTF_8
    );

    // The encrypted payload contains the complete grant, not just the access token.
    assertTrue(decrypted.contains("test-token"));
    assertTrue(decrypted.contains("legacy-no-refresh-token"));
    assertTrue(decrypted.contains("read_products"));

    // A different tenant must not be able to decrypt the ciphertext.
    cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            new GCMParameterSpec(128, stored.nonce())
    );

    cipher.updateAAD(
            EncryptedConnections.aad(
                    "intruder",
                    "brand",
                    "brand.myshopify.com",
                    stored.scopes()
            )
    );

    assertThrows(
            Exception.class,
            () -> cipher.doFinal(stored.ciphertext())
    );

    assertFalse(stored.toString().contains("test-token"));
}

@Test
void loadValidRefreshesAndPersistsRotatedTokens() {

    var key = new SecretKeySpec(new byte[32], "AES");

    // In-memory repository for this isolated test.
    var stored = new AtomicReference<EncryptedConnections.Stored>();

    EncryptedConnections.Repository repository =
            new EncryptedConnections.Repository() {

        @Override
        public void saveExclusive(EncryptedConnections.Stored value) {
            if (!stored.compareAndSet(null, value)) {
                throw new IllegalStateException(
                        "Connection already exists"
                );
            }
        }

        @Override
        public Optional<EncryptedConnections.Stored> read(String brand) {
            return Optional.ofNullable(stored.get());
        }

        @Override
        public boolean replaceIfUnchanged(
                EncryptedConnections.Stored expected,
                EncryptedConnections.Stored replacement
        ) {
            return stored.compareAndSet(expected, replacement);
        }
    };

    var connections = new EncryptedConnections(key, repository);

    Instant currentTime = Instant.now();

    // Initial access token is expired, but refresh token is still valid.
    var originalGrant = new ShopifyOAuth.Grant(
            "synthetic-old-access-token",
            "synthetic-old-refresh-token",
            currentTime.minusSeconds(60),
            currentTime.plusSeconds(86400),
            Set.of("read_products")
    );

    connections.save(
            "owner",
            "brand",
            "brand.myshopify.com",
            originalGrant
    );

    // Mock Shopify's token refresh endpoint.
    RestClient.Builder builder = RestClient.builder();

    MockRestServiceServer server =
            MockRestServiceServer.bindTo(builder).build();

    server.expect(
            requestTo(
                    "https://brand.myshopify.com/admin/oauth/access_token"
            )
    )
    .andExpect(method(HttpMethod.POST))
    .andRespond(withSuccess(
            """
            {
                "access_token": "synthetic-new-access-token",
                "refresh_token": "synthetic-new-refresh-token",
                "expires_in": 3600,
                "refresh_token_expires_in": 86400,
                "scope": "read_products"
            }
            """,
            org.springframework.http.MediaType.APPLICATION_JSON
    ));

    var tokenRefresh = new ShopifyTokenRefresh(
            builder,
            "test-client",
            "test-secret"
    );

    // This should refresh and persist the rotated tokens.
    var refreshed = connections.loadValid(
            "brand",
            tokenRefresh
    );

    assertEquals(
            "synthetic-new-access-token",
            refreshed.grant().token()
    );

    assertEquals(
            "synthetic-new-refresh-token",
            refreshed.grant().refreshToken()
    );

    // Verify that the new encrypted record can be loaded and decrypted.
    var persisted = connections.load("brand").orElseThrow();

    assertEquals(
            "synthetic-new-access-token",
            persisted.grant().token()
    );

    assertEquals(
            "synthetic-new-refresh-token",
            persisted.grant().refreshToken()
    );

    // Verify that a second load does not refresh again.
    var secondLoad = connections.loadValid(
            "brand",
            tokenRefresh
    );

    assertEquals(
            "synthetic-new-access-token",
            secondLoad.grant().token()
    );

    server.verify();
}
 @Test void signedCallbackStillRejectsExpiredPendingState()throws Exception{
  Instant[] instant={now};Clock clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return instant[0];}};
  var calls=new AtomicInteger();var f=new ShopifyOAuth("test-client",secret,URI.create("https://example.test/callback"),Set.of("read_products"),(o,b)->true,(u,c,s,code)->{calls.incrementAndGet();return new ShopifyOAuth.Grant("test-token",Set.of("read_products"));},(o,b,s,g)->{},clock);
  String state=state(f);instant[0]=now.plusSeconds(300);var query=signed(state,"brand.myshopify.com",instant[0].getEpochSecond());
  assertEquals("STATE_EXPIRED_OR_USED",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,query)).getMessage());assertEquals(0,calls.get());
 }
 @Test void missingScopesNeverPersistAndConsumeState()throws Exception{
  var calls=new AtomicInteger();var saved=new AtomicInteger();var f=new ShopifyOAuth("test-client",secret,URI.create("https://example.test/callback"),Set.of("read_products"),(o,b)->true,(u,c,s,code)->{calls.incrementAndGet();return new ShopifyOAuth.Grant("test-token",Set.of());},(o,b,s,g)->saved.incrementAndGet(),Clock.fixed(now,ZoneOffset.UTC));
  var query=signed(state(f),"brand.myshopify.com",now.getEpochSecond());assertEquals("MISSING_GRANTED_SCOPES",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,query)).getMessage());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(owner,query));assertEquals(1,calls.get());assertEquals(0,saved.get());
 }

@Test
void installRequiresSessionCsrfAndCallbackUsesSameServerIdentity() throws Exception {
    var calls = new AtomicInteger();
    var f = flow(calls, (o, b, s, g) -> {});

    // Create an isolated in-memory H2 database for this test.
    var dataSource = new JdbcDataSource();
    dataSource.setURL("jdbc:h2:mem:merchant-oauth-test;DB_CLOSE_DELAY=-1");

    try (var connection = dataSource.getConnection();
         var statement = connection.createStatement()) {

        statement.execute("""
            CREATE TABLE fc_schema_version (
                singleton INTEGER PRIMARY KEY,
                version INTEGER NOT NULL
            )
            """);

        statement.execute(
            "INSERT INTO fc_schema_version(singleton, version) VALUES (1, 1)"
        );

        statement.execute("""
            CREATE TABLE fc_brand (
                id VARCHAR(256) PRIMARY KEY,
                name VARCHAR(120) NOT NULL
            )
            """);

        statement.execute("""
            CREATE TABLE fc_brand_membership (
                brand_id VARCHAR(256) PRIMARY KEY,
                owner_id VARCHAR(256) NOT NULL,
                active BOOLEAN NOT NULL,
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                UNIQUE (brand_id, owner_id)
            )
            """);

        statement.execute("""
            CREATE TABLE fc_merchant_connection (
                brand_id VARCHAR(256) PRIMARY KEY,
                owner_id VARCHAR(256) NOT NULL
            )
            """);

        statement.execute(
            "INSERT INTO fc_brand(id, name) VALUES ('brand', 'Test Brand')"
        );

        statement.execute("""
            INSERT INTO fc_brand_membership
                (brand_id, owner_id, active, created_at, updated_at)
            VALUES
                ('brand', 'owner', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """);
    }

    // This is a trusted test identity, not a browser-supplied owner ID.
    var jdbcConnections = new JdbcConnections(
        dataSource,
        () -> Optional.of(
            new JdbcConnections.Actor("owner", now.plusSeconds(600))
        ),
        Clock.fixed(now, ZoneOffset.UTC)
    );

    var mvc = MockMvcBuilders
        .standaloneSetup(new MerchantController(f, jdbcConnections))
        .build();

    var session = new org.springframework.mock.web.MockHttpSession(
        null,
        "session"
    );

    session.setAttribute("merchant.csrf", "synthetic-csrf");

    String body = """
        {"shop":"brand.myshopify.com","brandId":"brand"}
        """;

    // Missing CSRF token must be rejected.
    mvc.perform(
        post("/api/merchant/shopify/install")
            .principal(() -> "owner")
            .session(session)
            .contentType("application/json")
            .content(body)
    ).andExpect(status().isForbidden());

    // Incorrect CSRF token must also be rejected.
    mvc.perform(
        post("/api/merchant/shopify/install")
            .principal(() -> "owner")
            .session(session)
            .header("X-CSRF-Token", "wrong")
            .contentType("application/json")
            .content(body)
    ).andExpect(status().isForbidden());

    // Valid session and CSRF token should allow installation.
    var response = mvc.perform(
        post("/api/merchant/shopify/install")
            .principal(() -> "owner")
            .session(session)
            .header("X-CSRF-Token", "synthetic-csrf")
            .contentType("application/json")
            .content(body)
    )
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();

    String url = new com.fasterxml.jackson.databind.ObjectMapper()
        .readTree(response)
        .path("authorizationUrl")
        .asText();

    assertTrue(url.startsWith(
        "https://brand.myshopify.com/admin/oauth/authorize?"
    ));

    var query = signed(
        url.substring(url.indexOf("&state=") + 7),
        "brand.myshopify.com",
        now.getEpochSecond()
    );

    var request = get("/api/merchant/shopify/callback")
        .principal(() -> "owner")
        .session(session);

    query.forEach((k, v) -> request.param(k, v.get(0)));

    mvc.perform(request)
        .andExpect(status().isSeeOther())
        .andExpect(header().string("Location", "/#/owner"))
        .andExpect(content().string(""));

    assertEquals(1, calls.get());
}

}
