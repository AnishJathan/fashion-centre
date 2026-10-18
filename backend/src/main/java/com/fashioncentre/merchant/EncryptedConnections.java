package com.fashioncentre.merchant;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Testable encryption/atomic-ownership boundary. No runtime repository or encryption key is configured. */
public final class EncryptedConnections implements ShopifyOAuth.Connections {
 public record Stored(String owner,String brand,String shop,Set<String> scopes,byte[] nonce,byte[] ciphertext){
  public Stored{scopes=Set.copyOf(scopes);nonce=nonce.clone();ciphertext=ciphertext.clone();}
  @Override public byte[] nonce(){return nonce.clone();}@Override public byte[] ciphertext(){return ciphertext.clone();}
  @Override public String toString(){return "StoredConnection[encrypted, redacted]";}
 }
 public interface Repository { /** Must atomically reject a shop or brand bound to another owner/connection. */ void saveExclusive(Stored value); }
 private final SecretKey key;private final Repository repository;private final SecureRandom random=new SecureRandom();
 public EncryptedConnections(SecretKey key,Repository repository){this.key=Objects.requireNonNull(key);this.repository=Objects.requireNonNull(repository);}
 public static byte[] aad(String owner,String brand,String shop){return (owner.length()+":"+owner+brand.length()+":"+brand+shop.length()+":"+shop).getBytes(StandardCharsets.UTF_8);}
 @Override public void save(String owner,String brand,String shop,ShopifyOAuth.Grant grant){
  byte[] plaintext=grant.token().getBytes(StandardCharsets.UTF_8);
  try{byte[] nonce=new byte[12];random.nextBytes(nonce);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key,new GCMParameterSpec(128,nonce));cipher.updateAAD(aad(owner,brand,shop));repository.saveExclusive(new Stored(owner,brand,shop,grant.scopes(),nonce,cipher.doFinal(plaintext)));}
  catch(RuntimeException ex){throw new ShopifyOAuth.Rejected("CONNECTION_STORAGE_REJECTED");}catch(Exception ex){throw new ShopifyOAuth.Rejected("CONNECTION_STORAGE_UNAVAILABLE");}finally{Arrays.fill(plaintext,(byte)0);}
 }
}
