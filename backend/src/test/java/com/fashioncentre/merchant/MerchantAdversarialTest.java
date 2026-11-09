package com.fashioncentre.merchant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.net.URI;import java.time.*;import java.util.*;import java.util.concurrent.atomic.*;
import javax.crypto.Cipher;import javax.crypto.spec.*;

class MerchantAdversarialTest {
 final MerchantOAuthTest h=new MerchantOAuthTest();
 @Test void revocationDuringExchangeCannotPersistAndStateCannotReplay()throws Exception{
  var allowed=new AtomicBoolean(true);var saved=new AtomicInteger();byte[][] passed={null};
  var f=new ShopifyOAuth("test-client",h.secret,URI.create("https://example.test/callback"),Set.of("read_products"),(o,b)->allowed.get(),(u,c,s,code)->{passed[0]=s;allowed.set(false);return new ShopifyOAuth.Grant("test-token",Set.of("read_products"));},(o,b,s,g)->saved.incrementAndGet(),Clock.fixed(h.now,ZoneOffset.UTC));
  var q=h.signed(h.state(f),"brand.myshopify.com",h.now.getEpochSecond());assertEquals("BRAND_ACCESS_DENIED",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(h.owner,q)).getMessage());assertEquals(0,saved.get());assertArrayEquals(new byte[h.secret.length],passed[0]);allowed.set(true);assertEquals("STATE_EXPIRED_OR_USED",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(h.owner,q)).getMessage());
 }
 @Test void ownershipOutageAndMalformedIdentityFailClosed(){
  var calls=new AtomicInteger();var f=new ShopifyOAuth("test-client",h.secret,URI.create("https://example.test/callback"),Set.of("read_products"),(o,b)->{throw new IllegalStateException("private repository detail");},(u,c,s,code)->{calls.incrementAndGet();return null;},(o,b,s,g)->{},Clock.fixed(h.now,ZoneOffset.UTC));
  assertEquals("OWNERSHIP_UNAVAILABLE",assertThrows(ShopifyOAuth.Rejected.class,()->f.begin(h.owner,"brand","brand.myshopify.com")).getMessage());
  assertEquals("MERCHANT_SIGN_IN_REQUIRED",assertThrows(ShopifyOAuth.Rejected.class,()->f.begin(new ShopifyOAuth.Identity("owner\nforged","session"),"brand","brand.myshopify.com")).getMessage());assertEquals(0,calls.get());
  Map<String,List<String>> malformed=new HashMap<>();malformed.put(null,List.of("value"));assertEquals("INVALID_CALLBACK",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(h.owner,malformed)).getMessage());
 }
 @Test void grantedScopesAreImmutableAndIntegrityBound()throws Exception{
  Set<String> mutable=new HashSet<>(Set.of("read_products"));var grant=new ShopifyOAuth.Grant("test-token",mutable);mutable.add("write_products");assertEquals(Set.of("read_products"),grant.scopes());
  var key=new SecretKeySpec(new byte[32],"AES");List<EncryptedConnections.Stored> records=new ArrayList<>();new EncryptedConnections(key,records::add).save("owner","brand","brand.myshopify.com",grant);var r=records.get(0);
  var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,r.nonce()));cipher.updateAAD(EncryptedConnections.aad(r.owner(),r.brand(),r.shop(),Set.of("read_products","write_products")));assertThrows(javax.crypto.AEADBadTagException.class,()->cipher.doFinal(r.ciphertext()));
 }
 @Test void emptyCsrfAndSpoofedBrowserIdentityNeverAuthorize()throws Exception{
  var mvc=MockMvcBuilders.standaloneSetup(new MerchantController(h.flow(new AtomicInteger(),(o,b,s,g)->{}))).build();var session=new org.springframework.mock.web.MockHttpSession(null,"session");session.setAttribute("merchant.csrf","");String body="{\"brandId\":\"brand\",\"shop\":\"brand.myshopify.com\"}";
  mvc.perform(post("/api/merchant/shopify/install").session(session).header("X-User-Id","owner").header("X-CSRF-Token","").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/merchant/shopify/install").principal(()->"owner").session(session).header("X-CSRF-Token","").contentType("application/json").content(body)).andExpect(status().isForbidden());
 }
 @Test void repositoryFailureNeverReturnsConnectionAndCiphertextIsDefensivelyCopied()throws Exception{
  var key=new SecretKeySpec(new byte[32],"AES");var store=new EncryptedConnections(key,r->{byte[] copy=r.ciphertext();Arrays.fill(copy,(byte)0);assertFalse(Arrays.equals(copy,r.ciphertext()));throw new IllegalStateException("private disk detail");});
  var f=h.flow(new AtomicInteger(),store);var q=h.signed(h.state(f),"brand.myshopify.com",h.now.getEpochSecond());assertEquals("CONNECTION_STORAGE_REJECTED",assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(h.owner,q)).getMessage());assertThrows(ShopifyOAuth.Rejected.class,()->f.callback(h.owner,q));
 }
}
