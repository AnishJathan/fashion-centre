package com.fashioncentre;
import com.fashioncentre.shopify.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class ShopifyTest {
 final ObjectMapper json=new ObjectMapper();final StorefrontAdapter adapter=new StorefrontAdapter(json);
 String fixture()throws Exception{try(var in=getClass().getResourceAsStream("/shopify-fixture.json")){return new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);}}
 StorefrontAdapter.Catalogue catalogue(String shop)throws Exception{return adapter.catalogue(StorefrontAdapter.shop(shop),(s,r)->{assertEquals(StorefrontAdapter.QUERY,r.query());assertTrue(r.variables().isEmpty());return new StorefrontAdapter.Reply(200,"2026-10",fixture());},"fixture");}
 @Test void mapsMoneyAvailabilityAndShopIsolation()throws Exception{var a=catalogue("mock");var b=catalogue("apparel");var v=a.products().get(0).variants().get(0);assertEquals("79.95",v.amount().toPlainString());assertEquals("CAD",v.currency());assertEquals("M",v.options().get("Size"));assertTrue(v.available());assertFalse(a.products().get(0).variants().get(1).available());assertNotEquals(a.products().get(0).key(),b.products().get(0).key());assertFalse(a.hasNextPage());}
 @Test void cartContractRejectsCrossShopUnavailableAndInvalidQuantities()throws Exception{var c=catalogue("mock");var v=c.products().get(0).variants().get(0);var request=adapter.cartRequest(c,List.of(new StorefrontAdapter.Line(v.key(),2)));assertEquals(StorefrontAdapter.CART,request.query());assertTrue(json.writeValueAsString(request.variables()).contains("merchandiseId"));for(var line:List.of(new StorefrontAdapter.Line("apparel:"+v.id(),1),new StorefrontAdapter.Line(v.key(),0),new StorefrontAdapter.Line(v.key(),10),new StorefrontAdapter.Line(c.products().get(0).variants().get(1).key(),1)))assertThrows(IllegalArgumentException.class,()->adapter.cartRequest(c,List.of(line)));assertThrows(IllegalArgumentException.class,()->adapter.cartRequest(c,List.of(new StorefrontAdapter.Line(v.key(),1),new StorefrontAdapter.Line(v.key(),1))));}
 @Test void rejectsUnsafeShopInput(){for(String host:List.of("http://localhost","foo.myshopify.com.evil.test","foo.myshopify.com:443","foo.myshopify.com/","127.0.0.1","foo@bar.myshopify.com"))assertThrows(IllegalArgumentException.class,()->StorefrontAdapter.merchantHost(host));assertEquals("owned-dev.myshopify.com",StorefrontAdapter.merchantHost("owned-dev.myshopify.com"));assertThrows(IllegalArgumentException.class,()->StorefrontAdapter.shop("https://localhost"));}
 @Test void rejectsFailedPartialAndVersionDriftResponses()throws Exception{for(var reply:List.of(new StorefrontAdapter.Reply(429,null,"{}"),new StorefrontAdapter.Reply(503,null,"{}"),new StorefrontAdapter.Reply(200,"2027-01",fixture()),new StorefrontAdapter.Reply(200,null,"{\"errors\":[{\"message\":\"secret upstream error\"}],\"data\":{}}"),new StorefrontAdapter.Reply(200,null,"invalid")))assertThrows(StorefrontAdapter.ContractException.class,()->adapter.data(reply));String broken=fixture().replace("79.95","oops");assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,broken),"fixture"));String more=fixture().replace("\"endCursor\":\"fixture-end\"","\"endCursor\":\"\"").replace("\"hasNextPage\":false","\"hasNextPage\":true");assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,more),"fixture"));}
 @Test void checkoutContractHandlesErrorsAndUntrustedUrls(){String body="{\"data\":{\"cartCreate\":{\"cart\":{\"id\":\"gid://shopify/Cart/fixture\",\"checkoutUrl\":\"https://mock.shop/checkout/fixture\"},\"userErrors\":[]}}}";assertEquals("https://mock.shop/checkout/fixture",adapter.checkoutUrl(StorefrontAdapter.shop("mock"),new StorefrontAdapter.Reply(200,null,body)));assertThrows(StorefrontAdapter.ContractException.class,()->adapter.checkoutUrl(StorefrontAdapter.shop("apparel"),new StorefrontAdapter.Reply(200,null,body)));assertThrows(StorefrontAdapter.ContractException.class,()->adapter.checkoutUrl(StorefrontAdapter.shop("mock"),new StorefrontAdapter.Reply(200,null,body.replace("\"userErrors\":[]","\"userErrors\":[{\"message\":\"Unavailable\"}]"))));}
 @Test void verifiesExactRawWebhookBytesOnly()throws Exception{byte[] secret="synthetic-test-secret-not-a-credential".getBytes(),body="{\"id\":1}".getBytes();var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret,"HmacSHA256"));String signature=Base64.getEncoder().encodeToString(mac.doFinal(body));assertTrue(WebhookSignature.verify(body,signature,secret));assertFalse(WebhookSignature.verify("{ \"id\":1}".getBytes(),signature,secret));assertFalse(WebhookSignature.verify(body,"garbage",secret));assertFalse(WebhookSignature.verify(body,signature,"different-test-secret".getBytes()));}
 @Test void runtimeIsPreviewOnlyAndUnknownSourcesFailClosed()throws Exception{var mvc=MockMvcBuilders.standaloneSetup(new ShopifyController(json)).build();mvc.perform(get("/api/integrations/shopify/status")).andExpect(status().isOk()).andExpect(jsonPath("$.connected").value(false));mvc.perform(get("/api/integrations/shopify/catalogue/mock?source=fixture")).andExpect(status().isBadRequest());mvc.perform(get("/api/integrations/shopify/catalogue/unknown")).andExpect(status().isBadRequest());mvc.perform(get("/api/integrations/shopify/catalogue/mock?source=live")).andExpect(status().isBadRequest());for(String path:List.of("connect","cart","sync","webhooks"))mvc.perform(post("/api/integrations/shopify/"+path)).andExpect(status().isNotImplemented());}
 @Test void acceptsConsistentSharedVariantsButRejectsConflictsAndWithinProductDuplicates()throws Exception{
  var root=json.readTree(fixture());var nodes=(com.fasterxml.jackson.databind.node.ArrayNode)root.path("data").path("products").path("nodes");
  var duplicate=(com.fasterxml.jackson.databind.node.ObjectNode)nodes.get(0).deepCopy();duplicate.put("id","gid://shopify/Product/999");nodes.add(duplicate);
  var firstVariant=(com.fasterxml.jackson.databind.node.ObjectNode)duplicate.path("variants").path("nodes").get(0);var price=(com.fasterxml.jackson.databind.node.ObjectNode)firstVariant.path("price");price.put("amount","79.9500");
  var c=adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture");assertEquals(2,c.products().size());assertEquals(c.products().get(0).variants().get(0).key(),c.products().get(1).variants().get(0).key());
  for(String field:List.of("amount","currencyCode","title","availableForSale","selectedOptions")){
   var changed=root.deepCopy();var v=(com.fasterxml.jackson.databind.node.ObjectNode)changed.path("data").path("products").path("nodes").get(1).path("variants").path("nodes").get(0);
   switch(field){case "amount"->((com.fasterxml.jackson.databind.node.ObjectNode)v.path("price")).put(field,"80.00");case "currencyCode"->((com.fasterxml.jackson.databind.node.ObjectNode)v.path("price")).put(field,"USD");case "availableForSale"->v.put(field,false);case "selectedOptions"->((com.fasterxml.jackson.databind.node.ObjectNode)v.path(field).get(0)).put("value","Other");default->v.put(field,"Different");}
   assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,changed.toString()),"fixture"));
  }
  ((com.fasterxml.jackson.databind.node.ArrayNode)duplicate.path("variants").path("nodes")).add(firstVariant.deepCopy());assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture"));
 }
 @Test void rejectsOverflowAndUnsupportedMinorUnitsButAllowsZeroAndThreeDecimalCurrencies()throws Exception{
  for(String value:List.of("1E+309","1000000000001","79.951","-0.01","1E-1000000000")){
   String body=fixture().replace("79.95",value);assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,body),"fixture"));
  }
  for(String currency:List.of("ZZZ","XXX","JPY")){String body=fixture().replace("CAD",currency);assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,body),"fixture"));}
  for(var pair:List.of(List.of("JPY","80"),List.of("BHD","79.951"),List.of("CAD","79.9500"))){String body=fixture().replace("CAD",pair.get(0)).replace("79.95",pair.get(1));assertEquals(1,adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,body),"fixture").products().size());}
 }
 @Test void mapsSourceDescriptionAndCreationDateWithoutInventingMissingMetadata()throws Exception{
  assertTrue(StorefrontAdapter.QUERY.contains("productType description createdAt"));assertFalse(StorefrontAdapter.QUERY.contains("descriptionHtml"));
  var old=catalogue("mock").products().get(0);assertEquals("",old.description());assertEquals("",old.createdAt());
  var root=json.readTree(fixture());var product=(com.fasterxml.jackson.databind.node.ObjectNode)root.path("data").path("products").path("nodes").get(0);
  String text="Cotton shirt.\nCare: wash cold. Literal <text> & characters stay text.";product.put("description",text);product.put("createdAt","2026-10-18T14:30:00+02:00");
  var item=adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture").products().get(0);
  assertEquals(text,item.description());assertEquals("2026-10-18T12:30:00Z",item.createdAt());
  product.put("description","");product.put("createdAt","");assertEquals("",adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture").products().get(0).createdAt());
 }
 @Test void rejectsMalformedAndOversizeProductMetadata()throws Exception{
  for(String invalid:List.of("2026-02-30T12:00:00Z","2026-10-18","2026-10-18T12:30:00","not-a-date"," ")){
   var root=json.readTree(fixture());((com.fasterxml.jackson.databind.node.ObjectNode)root.path("data").path("products").path("nodes").get(0)).put("createdAt",invalid);
   assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture"));
  }
  for(String field:List.of("description","createdAt")){
   var root=json.readTree(fixture());var product=(com.fasterxml.jackson.databind.node.ObjectNode)root.path("data").path("products").path("nodes").get(0);product.put(field,123);
   assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture"));
   product.put(field,"x".repeat(20_001));assertThrows(StorefrontAdapter.ContractException.class,()->adapter.catalogue(StorefrontAdapter.shop("mock"),(s,r)->new StorefrontAdapter.Reply(200,null,root.toString()),"fixture"));
  }
 }
}
