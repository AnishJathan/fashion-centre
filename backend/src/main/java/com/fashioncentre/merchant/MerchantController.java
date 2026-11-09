package com.fashioncentre.merchant;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/merchant/shopify")
public class MerchantController {
 private final ShopifyOAuth flow;
 public MerchantController(){flow=null;}
 // Only tests wire an executable flow. No environment flag or credentials can activate runtime installation.
 MerchantController(ShopifyOAuth flow){this.flow=flow;}
 public record Install(String shop,String brandId){}
 private ShopifyOAuth.Identity identity(HttpServletRequest request){var principal=request.getUserPrincipal();var session=request.getSession(false);return principal==null||session==null?null:new ShopifyOAuth.Identity(principal.getName(),session.getId());}
 @GetMapping("/readiness") public ResponseEntity<?> readiness(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("ready",false,"connected",false,"connections",List.of(),"blockers",List.of("Authenticated brand-owner sign-in and brand membership are not configured.","Shopify public app credentials and exact HTTPS callback are not configured.","Durable tenant ownership, encrypted token storage and lifecycle handling are not configured.","Public distribution review and an authorized development-store installation are pending.")));}
 @PostMapping("/install") public ResponseEntity<?> install(@RequestBody Install input,HttpServletRequest request){
  var identity=identity(request);if(identity==null)return failure(401,"MERCHANT_SIGN_IN_REQUIRED");
  Object csrf=request.getSession(false).getAttribute("merchant.csrf");String sent=request.getHeader("X-CSRF-Token");if(!(csrf instanceof String expected)||expected.isBlank()||expected.length()>256||sent==null||sent.length()>256||!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),sent.getBytes(StandardCharsets.UTF_8)))return failure(403,"INVALID_CSRF");
  if(flow==null)return failure(503,"SHOPIFY_NOT_CONFIGURED");
  try{return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("authorizationUrl",flow.begin(identity,input.brandId(),input.shop()).toString()));}catch(ShopifyOAuth.Rejected ex){return failure(400,ex.getMessage());}
 }
 @GetMapping("/callback") public ResponseEntity<?> callback(@RequestParam MultiValueMap<String,String> query,HttpServletRequest request){
  if(flow==null)return failure(503,"SHOPIFY_NOT_CONFIGURED");var identity=identity(request);if(identity==null)return failure(401,"MERCHANT_SIGN_IN_REQUIRED");
  try{flow.callback(identity,query);return ResponseEntity.status(303).header(HttpHeaders.LOCATION,"/#/owner").cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").build();}catch(ShopifyOAuth.Rejected ex){return failure(400,ex.getMessage());}
 }
 private ResponseEntity<?> failure(int status,String code){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").body(Map.of("code",code,"connected",false,"message","Shopify connection was not completed. Return to the brand-owner dashboard to review setup."));}
}
