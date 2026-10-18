package com.fashioncentre.shopify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.util.*;

/** Store-scoped mapping and contracts. No credentials or live merchant transport. */
public final class StorefrontAdapter {
 public static final String API_VERSION="2026-10";
 public static final String QUERY="query Catalogue { products(first: 6) { nodes { id title handle featuredImage { url } variants(first: 20) { nodes { id title availableForSale selectedOptions { name value } price { amount currencyCode } } pageInfo { hasNextPage } } } pageInfo { hasNextPage endCursor } } }";
 public static final String CART="mutation CreateCart($input: CartInput!) { cartCreate(input: $input) { cart { id checkoutUrl } userErrors { field message code } } }";
 public record Shop(String key, String name, URI endpoint) {}
 public static final Map<String,Shop> SHOPS=Map.of(
  "mock",new Shop("mock","Mock Shop",URI.create("https://mock.shop/api")),
  "apparel",new Shop("apparel","Elysian Thread",URI.create("https://apparel.mock.shop/api")));
 public record Variant(String key,String id,String title,boolean available,BigDecimal amount,String currency,Map<String,String> options) {}
 public record Item(String key,String id,String title,String handle,String image,List<Variant> variants,boolean moreVariants) {}
 public record Catalogue(String shopKey,String source,List<Item> products,boolean hasNextPage,String endCursor) {}
 public record Line(String variantKey,int quantity) {}
 public record Request(String query,Map<String,Object> variables) {}
 public record Reply(int status,String version,String body) {}
 public interface Transport { Reply execute(Shop shop,Request request) throws Exception; }
 public static class ContractException extends RuntimeException { public ContractException(String message){super(message);} }
 private final ObjectMapper json;
 public StorefrontAdapter(ObjectMapper json){this.json=json;}
 public static Shop shop(String key){var shop=SHOPS.get(key);if(shop==null)throw new IllegalArgumentException("Unknown sample shop");return shop;}
 public static String merchantHost(String host){if(host==null||!host.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.myshopify\\.com"))throw new IllegalArgumentException("Invalid canonical shop host");return host;}
 private static String required(JsonNode n,String key){var v=n.get(key);if(v==null||!v.isTextual()||v.asText().isBlank())throw new ContractException("Incomplete catalogue response");return v.asText();}
 public JsonNode data(Reply reply){
  if(reply.status()==429)throw new ContractException("Sample service is rate limited; try again later.");
  if(reply.status()!=200)throw new ContractException("Sample service is unavailable.");
  if(reply.version()!=null&&!reply.version().equals(API_VERSION))throw new ContractException("API version mismatch");
  try {var root=json.readTree(reply.body());if(root.has("errors")&&!root.path("errors").isEmpty())throw new ContractException("GraphQL request failed");if(!root.path("data").isObject())throw new ContractException("Missing GraphQL data");return root.path("data");}
  catch(ContractException ex){throw ex;}catch(Exception ex){throw new ContractException("Malformed service response");}
 }
 public Catalogue catalogue(Shop shop,Transport transport,String source) throws Exception {
  var connection=data(transport.execute(shop,new Request(QUERY,Map.of()))).path("products");
  if(!connection.path("nodes").isArray()||!connection.path("pageInfo").path("hasNextPage").isBoolean())throw new ContractException("Incomplete products page");
  List<Item> items=new ArrayList<>();Set<String> ids=new HashSet<>();
  for(var p:connection.path("nodes")){
   String id=required(p,"id");if(!id.startsWith("gid://shopify/Product/")||!ids.add(id))throw new ContractException("Invalid product identity");
   var variantConnection=p.path("variants");if(!variantConnection.path("nodes").isArray()||!variantConnection.path("pageInfo").path("hasNextPage").isBoolean())throw new ContractException("Incomplete variants page");
   List<Variant> variants=new ArrayList<>();Set<String> variantIds=new HashSet<>();
   for(var v:variantConnection.path("nodes")){
    String vid=required(v,"id"),currency=required(v.path("price"),"currencyCode");BigDecimal amount;
    try{amount=new BigDecimal(required(v.path("price"),"amount"));}catch(NumberFormatException ex){throw new ContractException("Invalid price");}
    if(amount.signum()<0||!currency.matches("[A-Z]{3}")||!vid.startsWith("gid://shopify/ProductVariant/")||!variantIds.add(vid)||!v.path("availableForSale").isBoolean())throw new ContractException("Invalid variant");
    Map<String,String> options=new LinkedHashMap<>();if(!v.path("selectedOptions").isArray())throw new ContractException("Missing variant options");for(var option:v.path("selectedOptions"))options.put(required(option,"name"),required(option,"value"));
    variants.add(new Variant(shop.key()+":"+vid,vid,required(v,"title"),v.path("availableForSale").asBoolean(),amount,currency,Map.copyOf(options)));
   }
   String image=p.path("featuredImage").path("url").asText("");if(!image.isEmpty()){try{var u=URI.create(image);if(!"https".equals(u.getScheme())||!"cdn.shopify.com".equals(u.getHost())||u.getUserInfo()!=null||u.getPort()!=-1)image="";}catch(Exception ex){image="";}}
   items.add(new Item(shop.key()+":"+id,id,required(p,"title"),required(p,"handle"),image,List.copyOf(variants),variantConnection.path("pageInfo").path("hasNextPage").asBoolean()));
  }
  boolean more=connection.path("pageInfo").path("hasNextPage").asBoolean();String cursor=connection.path("pageInfo").path("endCursor").asText("");if(more&&cursor.isBlank())throw new ContractException("Missing pagination cursor");
  return new Catalogue(shop.key(),source,List.copyOf(items),more,cursor);
 }
 /** Builds only; the runtime does not submit cart mutations. */
 public Request cartRequest(Catalogue catalogue,List<Line> lines){
  shop(catalogue.shopKey());if(lines==null||lines.isEmpty()||lines.size()>20)throw new IllegalArgumentException("Choose 1 to 20 variants");
  Map<String,Variant> available=new HashMap<>();catalogue.products().forEach(p->p.variants().forEach(v->available.put(v.key(),v)));
  List<Map<String,Object>> mapped=new ArrayList<>();Set<String> seen=new HashSet<>();
  for(var line:lines){var v=available.get(line.variantKey());if(v==null||!v.key().equals(catalogue.shopKey()+":"+v.id())||!v.available()||line.quantity()<1||line.quantity()>9||!seen.add(v.key()))throw new IllegalArgumentException("Unavailable, cross-shop, duplicate or invalid cart line");mapped.add(Map.of("merchandiseId",v.id(),"quantity",line.quantity()));}
  return new Request(CART,Map.of("input",Map.of("lines",mapped)));
 }
 public String checkoutUrl(Shop shop,Reply reply){var result=data(reply).path("cartCreate");if(!result.path("userErrors").isArray()||!result.path("userErrors").isEmpty())throw new ContractException("Cart rejected");required(result.path("cart"),"id");var url=URI.create(required(result.path("cart"),"checkoutUrl"));if(!"https".equals(url.getScheme())||!shop.endpoint().getHost().equals(url.getHost())||url.getUserInfo()!=null||url.getPort()!=-1)throw new ContractException("Untrusted checkout host");return url.toString();}
}
