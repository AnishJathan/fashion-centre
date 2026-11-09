package com.fashioncentre.shopify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/** Store-scoped mapping and contracts. No credentials or live merchant transport. */
public final class StorefrontAdapter {
 public static final String API_VERSION="2026-10";
 public static final String QUERY="query Catalogue { shop { name } products(first: 48) { nodes { id title handle productType description createdAt featuredImage { url } variants(first: 100) { nodes { id title availableForSale selectedOptions { name value } price { amount currencyCode } } pageInfo { hasNextPage } } } pageInfo { hasNextPage endCursor } } }";
 public static final String CART="mutation CreateCart($input: CartInput!) { cartCreate(input: $input) { cart { id checkoutUrl } userErrors { field message code } } }";
 public record Shop(String key, String name, URI endpoint) {}
 public static final Map<String,Shop> SHOPS=Map.of(
  "mock",new Shop("mock","Mock Shop",URI.create("https://mock.shop/api")),
  "apparel",new Shop("apparel","Elysian Thread",URI.create("https://apparel.mock.shop/api")));
 public record Variant(String key,String id,String title,boolean available,BigDecimal amount,String currency,Map<String,String> options) {}
 public record Item(String key,String id,String title,String handle,String category,String image,List<Variant> variants,boolean moreVariants,String description,String createdAt) {}
 public record Catalogue(String shopKey,String shopName,String source,List<Item> products,boolean hasNextPage,String endCursor) {}
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
 private static String optionalText(JsonNode n,String key,int limit){var value=n.get(key);if(value==null||value.isNull())return "";if(!value.isTextual()||value.textValue().length()>limit)throw new ContractException("Invalid product metadata");return value.textValue();}
 private static String createdAt(JsonNode n){String value=optionalText(n,"createdAt",64);if(value.isEmpty())return "";try{return OffsetDateTime.parse(value).toInstant().toString();}catch(DateTimeParseException ex){throw new ContractException("Invalid product creation timestamp");}}
 public JsonNode data(Reply reply){
  if(reply.status()==429)throw new ContractException("Sample service is rate limited; try again later.");
  if(reply.status()!=200)throw new ContractException("Sample service is unavailable.");
  if(reply.version()!=null&&!reply.version().equals(API_VERSION))throw new ContractException("API version mismatch");
  try {var root=json.readTree(reply.body());if(root.has("errors")&&!root.path("errors").isEmpty())throw new ContractException("GraphQL request failed");if(!root.path("data").isObject())throw new ContractException("Missing GraphQL data");return root.path("data");}
  catch(ContractException ex){throw ex;}catch(Exception ex){throw new ContractException("Malformed service response");}
 }
 public Catalogue catalogue(Shop shop,Transport transport,String source) throws Exception {
  var root=data(transport.execute(shop,new Request(QUERY,Map.of())));var connection=root.path("products");
  if(!connection.path("nodes").isArray()||!connection.path("pageInfo").path("hasNextPage").isBoolean())throw new ContractException("Incomplete products page");
  List<Item> items=new ArrayList<>();Set<String> ids=new HashSet<>();Map<String,Variant> sharedVariants=new HashMap<>();
  for(var p:connection.path("nodes")){
   String id=required(p,"id");if(!id.startsWith("gid://shopify/Product/")||!ids.add(id))throw new ContractException("Invalid product identity");
   var variantConnection=p.path("variants");if(!variantConnection.path("nodes").isArray()||!variantConnection.path("pageInfo").path("hasNextPage").isBoolean())throw new ContractException("Incomplete variants page");
   List<Variant> variants=new ArrayList<>();Set<String> variantIds=new HashSet<>();
   for(var v:variantConnection.path("nodes")){
    String vid=required(v,"id"),currency=required(v.path("price"),"currencyCode");BigDecimal amount;
    try{amount=new BigDecimal(required(v.path("price"),"amount"));}catch(NumberFormatException ex){throw new ContractException("Invalid price");}
    validateMoney(amount,currency);
    if(!vid.matches("gid://shopify/ProductVariant/[0-9]+")||!variantIds.add(vid)||!v.path("availableForSale").isBoolean())throw new ContractException("Invalid variant");
    Map<String,String> options=new LinkedHashMap<>();if(!v.path("selectedOptions").isArray())throw new ContractException("Missing variant options");for(var option:v.path("selectedOptions"))options.put(required(option,"name"),required(option,"value"));
    var variant=new Variant(shop.key()+":"+vid,vid,required(v,"title"),v.path("availableForSale").asBoolean(),amount,currency,Map.copyOf(options));
    var existing=sharedVariants.putIfAbsent(vid,variant);if(existing!=null&&!consistentVariant(existing,variant))throw new ContractException("Conflicting shared variant");
    variants.add(variant);
   }
   String image=p.path("featuredImage").path("url").asText("");if(!image.isEmpty()){try{var u=URI.create(image);if(!"https".equals(u.getScheme())||!"cdn.shopify.com".equals(u.getHost())||u.getUserInfo()!=null||u.getPort()!=-1)image="";}catch(Exception ex){image="";}}
   items.add(new Item(shop.key()+":"+id,id,required(p,"title"),required(p,"handle"),p.path("productType").asText(""),image,List.copyOf(variants),variantConnection.path("pageInfo").path("hasNextPage").asBoolean(),optionalText(p,"description",20_000),createdAt(p)));
  }
  boolean more=connection.path("pageInfo").path("hasNextPage").asBoolean();String cursor=connection.path("pageInfo").path("endCursor").asText("");if(more&&cursor.isBlank())throw new ContractException("Missing pagination cursor");
  return new Catalogue(shop.key(),required(root.path("shop"),"name"),source,List.copyOf(items),more,cursor);
 }
 /** Combined listings can expose the same merchandise through multiple product contexts. */
 private static boolean consistentVariant(Variant a,Variant b){return a.key().equals(b.key())&&a.id().equals(b.id())&&a.title().equals(b.title())&&a.available()==b.available()&&a.amount().compareTo(b.amount())==0&&a.currency().equals(b.currency())&&a.options().equals(b.options());}
 /** Keep integer minor units safe in JavaScript even for twenty lines of nine units. */
 private static void validateMoney(BigDecimal amount,String code){
  try{int digits=Currency.getInstance(code).getDefaultFractionDigits();
   if(digits<0||amount.signum()<0||amount.compareTo(new BigDecimal("1000000000000"))>0||amount.stripTrailingZeros().scale()>digits||amount.movePointRight(digits).compareTo(new BigDecimal("50039995859672"))>0)throw new ContractException("Invalid price precision or bounds");
  }catch(IllegalArgumentException ex){throw new ContractException("Invalid currency");}
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
