package com.fashioncentre.shopify;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

@RestController @RequestMapping("/api/integrations/shopify")
public class ShopifyController {
 private final ObjectMapper json;private final StorefrontAdapter adapter;
 private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
 public ShopifyController(ObjectMapper json){this.json=json;adapter=new StorefrontAdapter(json);}
 @GetMapping("/status") public Map<String,Object> status(){return Map.of("connected",false,"mode","PREVIEW_ONLY","apiVersion",StorefrontAdapter.API_VERSION,"shops",List.of(Map.of("key","mock","name","Mock Shop"),Map.of("key","apparel","name","Elysian Thread")));}
 @GetMapping("/catalogue/{shopKey}") public StorefrontAdapter.Catalogue catalogue(@PathVariable String shopKey,@RequestParam(defaultValue="public") String source){
  try {var shop=StorefrontAdapter.shop(shopKey);
   if(!source.equals("public"))throw new IllegalArgumentException("Unknown source");
   return adapter.catalogue(shop,(s,r)->{
    // Fixed read-only query and exact server-owned endpoint. No arbitrary query/URL or credentials.
    var request=HttpRequest.newBuilder(s.endpoint()).timeout(Duration.ofSeconds(12)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(r))).build();
    var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
    try(var body=response.body()){byte[] bytes=body.readNBytes(1024*1024+1);if(bytes.length>1024*1024)throw new StorefrontAdapter.ContractException("Response exceeds preview limit");return new StorefrontAdapter.Reply(response.statusCode(),null,new String(bytes,java.nio.charset.StandardCharsets.UTF_8));}
   },"public-mock-shop");
  }catch(IllegalArgumentException ex){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown sample shop or source");}
  catch(Exception ex){if(ex instanceof InterruptedException)Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Sample catalogue unavailable. Retry or choose local fixtures.");}
 }
 @PostMapping({"/connect","/cart","/webhooks","/sync"}) public void disabled(){throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,"Live Shopify actions are not configured; preview only.");}
}
