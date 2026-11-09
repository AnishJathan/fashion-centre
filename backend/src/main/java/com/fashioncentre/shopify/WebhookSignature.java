package com.fashioncentre.shopify;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;
import java.util.Base64;
/** Pure verifier only. No HTTP receiver, event processing or order updates are enabled. */
public final class WebhookSignature {
 private WebhookSignature(){}
 public static boolean verify(byte[] rawBody,String signature,byte[] secret){
  if(rawBody==null||rawBody.length>1024*1024||signature==null||secret==null||secret.length<16)return false;
  try{var expected=Base64.getDecoder().decode(signature);if(expected.length!=32)return false;var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret,"HmacSHA256"));return MessageDigest.isEqual(expected,mac.doFinal(rawBody));}catch(Exception ex){return false;}
 }
}
