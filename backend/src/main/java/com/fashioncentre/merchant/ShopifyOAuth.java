package com.fashioncentre.merchant;

import com.fashioncentre.shopify.StorefrontAdapter;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Authorization protocol. Runtime has no configured instance; tests inject all external boundaries. */
public final class ShopifyOAuth {
 public record Identity(String ownerId,String sessionId) {}
 public record Connection(String brandId,String shop,Set<String> scopes) {}
 public record Grant(String token,Set<String> scopes) { public Grant{if(scopes!=null)scopes=Set.copyOf(scopes);} @Override public String toString(){return "Grant[redacted]";} }
 public interface Ownership { boolean ownsBrand(String owner,String brand); }
 public interface TokenExchange { Grant exchange(URI endpoint,String clientId,byte[] secret,String code); }
 public interface Connections { void save(String owner,String brand,String shop,Grant grant); }
 public static final class Rejected extends RuntimeException { public Rejected(String code){super(code);} }
 private record Pending(Identity identity,String brand,String shop,Instant expires) {}
 private final String clientId;private final byte[] secret;private final URI redirect;private final Set<String> scopes;
 private final Ownership ownership;private final TokenExchange exchange;private final Connections connections;private final Clock clock;
 private final Map<String,Pending> states=new HashMap<>();private final SecureRandom random=new SecureRandom();
 public ShopifyOAuth(String clientId,byte[] secret,URI redirect,Set<String> scopes,Ownership ownership,TokenExchange exchange,Connections connections,Clock clock){
  if(clientId==null||clientId.isBlank()||secret==null||secret.length<16||redirect==null||!"https".equals(redirect.getScheme())||redirect.getHost()==null||redirect.getUserInfo()!=null||redirect.getQuery()!=null||redirect.getFragment()!=null||scopes==null||scopes.isEmpty()||scopes.stream().anyMatch(s->!s.matches("[a-z_]+")))throw new Rejected("INVALID_CONFIGURATION");
  this.clientId=clientId;this.secret=secret.clone();this.redirect=redirect;this.scopes=Set.copyOf(scopes);this.ownership=Objects.requireNonNull(ownership);this.exchange=Objects.requireNonNull(exchange);this.connections=Objects.requireNonNull(connections);this.clock=Objects.requireNonNull(clock);
 }
 public static String canonicalShop(String value){if(value==null)throw new Rejected("INVALID_SHOP");try{return StorefrontAdapter.merchantHost(value.trim().toLowerCase(Locale.ROOT));}catch(IllegalArgumentException ex){throw new Rejected("INVALID_SHOP");}}
 private static boolean identifier(String value){return value!=null&&!value.isBlank()&&value.length()<=256&&value.chars().noneMatch(Character::isISOControl);}
 private void identity(Identity identity,String brand){if(identity==null||!identifier(identity.ownerId())||!identifier(identity.sessionId()))throw new Rejected("MERCHANT_SIGN_IN_REQUIRED");if(!identifier(brand))throw new Rejected("BRAND_ACCESS_DENIED");boolean owns;try{owns=ownership.ownsBrand(identity.ownerId(),brand);}catch(RuntimeException ex){throw new Rejected("OWNERSHIP_UNAVAILABLE");}if(!owns)throw new Rejected("BRAND_ACCESS_DENIED");}
 private static String encoded(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8);}
 public synchronized URI begin(Identity identity,String brand,String input){
  identity(identity,brand);String shop=canonicalShop(input);Instant now=clock.instant();states.values().removeIf(p->!p.expires().isAfter(now));if(states.size()>=256)throw new Rejected("INSTALL_CAPACITY_REACHED");
  byte[] bytes=new byte[32];random.nextBytes(bytes);String state=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  states.put(state,new Pending(identity,brand,shop,now.plusSeconds(300)));
  return URI.create("https://"+shop+"/admin/oauth/authorize?client_id="+encoded(clientId)+"&scope="+encoded(String.join(",",new TreeSet<>(scopes)))+"&redirect_uri="+encoded(redirect.toString())+"&state="+state);
 }
 /** Takes decoded query values. Duplicate parameters are rejected before canonicalization. */
 public Connection callback(Identity identity,Map<String,List<String>> query){
  Map<String,String> params=new TreeMap<>();if(query==null||query.size()>20)throw new Rejected("INVALID_CALLBACK");
  for(var e:query.entrySet()){if(e.getKey()==null||e.getKey().length()>64||!e.getKey().matches("[a-z_]+")||e.getValue()==null||e.getValue().size()!=1||e.getValue().get(0)==null||e.getValue().get(0).length()>4096)throw new Rejected("INVALID_CALLBACK");params.put(e.getKey(),e.getValue().get(0));}
  if(!validHmac(params,secret))throw new Rejected("INVALID_CALLBACK_SIGNATURE");
  String shop=canonicalShop(params.get("shop")),state=params.get("state"),code=params.get("code");
  if(code==null||code.isBlank()||code.length()>1024||state==null)throw new Rejected("INVALID_CALLBACK");
  long timestamp;try{timestamp=Long.parseLong(params.getOrDefault("timestamp",""));}catch(NumberFormatException ex){throw new Rejected("INVALID_CALLBACK_TIME");}
  long now=clock.instant().getEpochSecond();if(timestamp<now-300||timestamp>now+60)throw new Rejected("INVALID_CALLBACK_TIME");
  Pending pending;
  synchronized(this){pending=states.get(state);if(pending==null||!pending.expires().isAfter(clock.instant())){states.remove(state);throw new Rejected("STATE_EXPIRED_OR_USED");}if(!pending.identity().equals(identity)||!pending.shop().equals(shop))throw new Rejected("STATE_BINDING_MISMATCH");identity(identity,pending.brand());states.remove(state);}
  // Consume before exchange: an ambiguous exchange must restart authorization, never replay its code.
  byte[] exchangeSecret=secret.clone();
  try{Grant grant=exchange.exchange(URI.create("https://"+shop+"/admin/oauth/access_token"),clientId,exchangeSecret,code);if(grant==null||grant.token()==null||grant.token().isBlank()||grant.scopes()==null||!grant.scopes().containsAll(scopes))throw new Rejected("MISSING_GRANTED_SCOPES");identity(identity,pending.brand());connections.save(identity.ownerId(),pending.brand(),shop,grant);return new Connection(pending.brand(),shop,Set.copyOf(grant.scopes()));}
  catch(Rejected ex){throw ex;}catch(RuntimeException ex){throw new Rejected("CONNECTION_FAILED_RESTART_REQUIRED");}
  finally{Arrays.fill(exchangeSecret,(byte)0);}
 }
 public static boolean validHmac(Map<String,String> params,byte[] secret){
  try{String supplied=params.get("hmac");if(supplied==null||!supplied.matches("[a-f0-9]{64}"))return false;StringJoiner message=new StringJoiner("&");new TreeMap<>(params).forEach((k,v)->{if(!k.equals("hmac"))message.add(k+"="+v);});Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret,"HmacSHA256"));return MessageDigest.isEqual(HexFormat.of().parseHex(supplied),mac.doFinal(message.toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){return false;}
 }
}
