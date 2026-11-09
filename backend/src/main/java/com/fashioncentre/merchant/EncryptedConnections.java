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
 public interface Repository { /** Must transactionally recheck active brand membership and reject a shop or brand bound to another owner/connection. Commit durably before returning; never report success on partial writes. */ void saveExclusive(Stored value); }
 private final SecretKey key;private final Repository repository;private final SecureRandom random=new SecureRandom();
 public EncryptedConnections(SecretKey key,Repository repository){this.key=Objects.requireNonNull(key);this.repository=Objects.requireNonNull(repository);}
 public static byte[] aad(String owner,String brand,String shop,Set<String> scopes){StringBuilder value=new StringBuilder("fashion-centre-connection-v1:");for(String part:List.of(owner,brand,shop))value.append(part.length()).append(':').append(part);value.append(':').append(scopes.size()).append(':');for(String scope:new TreeSet<>(scopes))value.append(scope.length()).append(':').append(scope);return value.toString().getBytes(StandardCharsets.UTF_8);}
 @Override public void save(String owner,String brand,String shop,ShopifyOAuth.Grant grant){
  byte[] plaintext=grant.token().getBytes(StandardCharsets.UTF_8);
  try{byte[] nonce=new byte[12];random.nextBytes(nonce);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key,new GCMParameterSpec(128,nonce));cipher.updateAAD(aad(owner,brand,shop,grant.scopes()));repository.saveExclusive(new Stored(owner,brand,shop,grant.scopes(),nonce,cipher.doFinal(plaintext)));}
  catch(RuntimeException ex){throw new ShopifyOAuth.Rejected("CONNECTION_STORAGE_REJECTED");}catch(Exception ex){throw new ShopifyOAuth.Rejected("CONNECTION_STORAGE_UNAVAILABLE");}finally{Arrays.fill(plaintext,(byte)0);}
 }
}
