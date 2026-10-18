package com.fashioncentre.merchant;

import org.h2.jdbcx.JdbcDataSource;
import org.h2.tools.RunScript;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import java.io.*;import java.nio.charset.StandardCharsets;import java.nio.file.*;import java.sql.*;import java.time.*;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;import java.lang.reflect.*;import java.util.function.Supplier;import java.util.logging.Logger;
import javax.sql.DataSource;import javax.crypto.Cipher;import javax.crypto.spec.*;

class JdbcConnectionsTest {
 @TempDir Path temp;
 final Instant now=Instant.parse("2026-10-18T10:00:00Z");final Clock clock=Clock.fixed(now,ZoneOffset.UTC);
 final SecretKeySpec key=new SecretKeySpec(new byte[32],"AES");
 JdbcDataSource source(){var source=new JdbcDataSource();source.setURL("jdbc:h2:file:"+temp.resolve("merchant").toString().replace('\\','/')+";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0;LOCK_TIMEOUT=5000");return source;}
 void migrate(DataSource source)throws Exception{try(var connection=source.getConnection();var reader=new InputStreamReader(Objects.requireNonNull(getClass().getResourceAsStream("/db/migration/V1__merchant_connections.sql")),StandardCharsets.UTF_8)){RunScript.execute(connection,reader);}}
 void membership(DataSource source,String brand,String owner)throws Exception{try(var c=source.getConnection();var insert=c.prepareStatement("INSERT INTO fc_brand_membership(brand_id,owner_id,active) VALUES (?,?,TRUE)")){insert.setString(1,brand);insert.setString(2,owner);insert.executeUpdate();}}
 Supplier<Optional<JdbcConnections.Actor>> actor(String owner){return ()->Optional.of(new JdbcConnections.Actor(owner,now.plusSeconds(600)));}
 JdbcConnections repository(DataSource source,String owner){return new JdbcConnections(source,actor(owner),clock);}
 void save(JdbcConnections repo,String owner,String brand,String shop){new EncryptedConnections(key,repo).save(owner,brand,shop,new ShopifyOAuth.Grant("synthetic-test-token-very-distinct-not-real",Set.of("read_products")));}
 long count(DataSource source)throws Exception{try(var c=source.getConnection();var q=c.createStatement();var r=q.executeQuery("SELECT COUNT(*) FROM fc_merchant_connection")){r.next();return r.getLong(1);}}

 @Test void fileDatabaseSurvivesNewRepositoryAndStoresNoPlaintextToken()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");save(repository(source,"owner"),"owner","brand","brand.myshopify.com");
  // Every JDBC connection is closed. A fresh datasource reopens the file database.
  var reopened=repository(source(),"owner");var stored=reopened.read("brand").orElseThrow();assertEquals("brand.myshopify.com",stored.shop());
  var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,stored.nonce()));cipher.updateAAD(EncryptedConnections.aad(stored.owner(),stored.brand(),stored.shop(),stored.scopes()));assertEquals("synthetic-test-token-very-distinct-not-real",new String(cipher.doFinal(stored.ciphertext()),StandardCharsets.UTF_8));
  try(var files=Files.list(temp)){for(Path file:files.toList())if(Files.isRegularFile(file))assertFalse(new String(Files.readAllBytes(file),StandardCharsets.ISO_8859_1).contains("synthetic-test-token-very-distinct-not-real"));}
 }
 @Test void committedCiphertextSurvivesAbruptWriterJvmHalt()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");
  String java=Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").toLowerCase(Locale.ROOT).startsWith("windows")?"java.exe":"java").toString();
  var process=new ProcessBuilder(java,"-cp",System.getProperty("java.class.path"),CrashWriter.class.getName(),source.getURL()).redirectErrorStream(true).start();
  try{assertTrue(process.waitFor(20,TimeUnit.SECONDS),"Synthetic crash writer must finish");String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertEquals(0,process.exitValue(),output);assertTrue(output.contains("COMMITTED"),output);assertTrue(repository(source(),"owner").read("brand").isPresent());}finally{if(process.isAlive())process.destroyForcibly();}
 }
 public static class CrashWriter {
  public static void main(String[] args)throws Exception{
   var source=new JdbcDataSource();source.setURL(args[0]);
   // Keep the database open beyond repository commit, then halt without normal H2 shutdown.
   Connection keeper=source.getConnection();Instant now=Instant.parse("2026-10-18T10:00:00Z");var repo=new JdbcConnections(source,()->Optional.of(new JdbcConnections.Actor("owner",now.plusSeconds(60))),Clock.fixed(now,ZoneOffset.UTC));
   new EncryptedConnections(new SecretKeySpec(new byte[32],"AES"),repo).save("owner","brand","brand.myshopify.com",new ShopifyOAuth.Grant("synthetic-crash-token-not-real",Set.of("read_products")));
   if(keeper.isClosed())throw new IllegalStateException("Keeper closed");System.out.println("COMMITTED");System.out.flush();Runtime.getRuntime().halt(0);
  }
 }
 @Test void competingOwnersCannotBindSameShop()throws Exception{
  var source=source();migrate(source);membership(source,"brand-a","alice");membership(source,"brand-b","bob");var a=repository(source,"alice");var b=repository(source,"bob");var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
  try{var one=pool.submit(()->raceSave(start,a,"alice","brand-a"));var two=pool.submit(()->raceSave(start,b,"bob","brand-b"));start.countDown();assertNotEquals(one.get(15,TimeUnit.SECONDS),two.get(15,TimeUnit.SECONDS));assertEquals(1,count(source));}finally{pool.shutdownNow();}
 }
 boolean raceSave(CountDownLatch start,JdbcConnections repo,String owner,String brand)throws Exception{start.await();try{save(repo,owner,brand,"shared.myshopify.com");return true;}catch(ShopifyOAuth.Rejected ex){return false;}}
 @Test void sameBrandCannotRebindAndWrongOwnerCannotReadOrRevoke()throws Exception{
  var source=source();migrate(source);membership(source,"brand","alice");var alice=repository(source,"alice");save(alice,"alice","brand","first.myshopify.com");assertThrows(ShopifyOAuth.Rejected.class,()->save(alice,"alice","brand","second.myshopify.com"));assertEquals("first.myshopify.com",alice.read("brand").orElseThrow().shop());
  var bob=repository(source,"bob");assertThrows(ShopifyOAuth.Rejected.class,()->bob.read("brand"));assertThrows(ShopifyOAuth.Rejected.class,()->bob.revokeMembership("brand"));assertThrows(ShopifyOAuth.Rejected.class,()->save(bob,"alice","brand","third.myshopify.com"));assertEquals(1,count(source));
 }
 @Test void revocationDeletesBindingAndRejectsStaleSaveAndRead()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var repo=repository(source,"owner");save(repo,"owner","brand","brand.myshopify.com");repo.revokeMembership("brand");assertEquals(0,count(source));assertThrows(ShopifyOAuth.Rejected.class,()->repo.read("brand"));assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));assertEquals(0,count(source));
 }
 @Test void missingExpiredOrChangedAuthenticationFailsClosed()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");
  for(Supplier<Optional<JdbcConnections.Actor>> auth:List.<Supplier<Optional<JdbcConnections.Actor>>>of(Optional::empty,()->Optional.of(new JdbcConnections.Actor("owner",now)),()->{throw new IllegalStateException("private auth failure");},()->{throw new ShopifyOAuth.Rejected("private detail");})){
   var repo=new JdbcConnections(source,auth,clock);assertEquals("MERCHANT_SIGN_IN_REQUIRED",assertThrows(ShopifyOAuth.Rejected.class,()->repo.read("brand")).getMessage());assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));
  }
  var calls=new AtomicInteger();var repo=new JdbcConnections(source,()->Optional.of(new JdbcConnections.Actor(calls.incrementAndGet()==1?"owner":"intruder",now.plusSeconds(60))),clock);assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));assertEquals(0,count(source));
 }
 @Test void commitFailureRollsBackSaveAndRevocation()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var fail=new AtomicBoolean();var failing=new DelegatingSource(source,fail);var repo=repository(failing,"owner");fail.set(true);assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));assertEquals(0,count(source));
  fail.set(false);save(repo,"owner","brand","brand.myshopify.com");fail.set(true);assertThrows(ShopifyOAuth.Rejected.class,()->repo.revokeMembership("brand"));fail.set(false);assertTrue(repository(source(),"owner").read("brand").isPresent());assertEquals(1,count(source));
 }
 @Test void revocationSerializesAfterSaveAndEncryptedRead()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var pool=Executors.newFixedThreadPool(2);
  try{
   // A save owns the membership lock until COMMIT. Revocation must wait, then remove it.
   var ready=new CountDownLatch(1);var release=new CountDownLatch(1);var blocking=new DelegatingSource(source,new AtomicBoolean());blocking.beforeCommit=()->{ready.countDown();await(release);};var writer=repository(blocking,"owner");var revoker=repository(source,"owner");
   var write=pool.submit(()->save(writer,"owner","brand","brand.myshopify.com"));assertTrue(ready.await(5,TimeUnit.SECONDS));var revoke=pool.submit(()->revoker.revokeMembership("brand"));assertThrows(TimeoutException.class,()->revoke.get(100,TimeUnit.MILLISECONDS));release.countDown();write.get(10,TimeUnit.SECONDS);revoke.get(10,TimeUnit.SECONDS);assertEquals(0,count(source));
   // Independently provision another brand to verify reads participate in the same lock protocol.
   membership(source,"read-brand","owner");save(revoker,"owner","read-brand","read.myshopify.com");var readReady=new CountDownLatch(1);var readRelease=new CountDownLatch(1);blocking.beforeCommit=()->{readReady.countDown();await(readRelease);};
   var read=pool.submit(()->writer.read("read-brand"));assertTrue(readReady.await(5,TimeUnit.SECONDS));var revokeRead=pool.submit(()->revoker.revokeMembership("read-brand"));assertThrows(TimeoutException.class,()->revokeRead.get(100,TimeUnit.MILLISECONDS));readRelease.countDown();assertTrue(read.get(10,TimeUnit.SECONDS).isPresent());revokeRead.get(10,TimeUnit.SECONDS);assertThrows(ShopifyOAuth.Rejected.class,()->revoker.read("read-brand"));assertEquals(0,count(source));
  }finally{pool.shutdownNow();}
 }
 static void await(CountDownLatch latch){try{if(!latch.await(5,TimeUnit.SECONDS))throw new IllegalStateException("Synthetic test barrier expired");}catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException(ex);}}
 @Test void expiredContextAfterLockWaitCannotSave()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var valid=new AtomicBoolean(true);var entered=new CountDownLatch(1);var repo=new JdbcConnections(source,()->{entered.countDown();return valid.get()?actor("owner").get():Optional.empty();},clock);var pool=Executors.newSingleThreadExecutor();
  try(var lock=source.getConnection()){lock.setAutoCommit(false);try(var query=lock.createStatement()){query.executeQuery("SELECT * FROM fc_brand_membership WHERE brand_id='brand' FOR UPDATE").close();}
   var save=pool.submit(()->assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com")));assertTrue(entered.await(5,TimeUnit.SECONDS));valid.set(false);lock.commit();save.get(10,TimeUnit.SECONDS);assertEquals(0,count(source));
  }finally{pool.shutdownNow();}
 }
 @Test void membershipRevokedWhileSaveWaitsCannotLeaveBinding()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var entered=new CountDownLatch(1);var repo=new JdbcConnections(source,()->{entered.countDown();return actor("owner").get();},clock);var pool=Executors.newSingleThreadExecutor();
  try(var revocation=source.getConnection()){revocation.setAutoCommit(false);try(var query=revocation.createStatement()){query.executeQuery("SELECT * FROM fc_brand_membership WHERE brand_id='brand' FOR UPDATE").close();}
   var pending=pool.submit(()->assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com")));assertTrue(entered.await(5,TimeUnit.SECONDS));
   try(var update=revocation.createStatement()){update.executeUpdate("UPDATE fc_brand_membership SET active=FALSE WHERE brand_id='brand'");}revocation.commit();pending.get(10,TimeUnit.SECONDS);assertEquals(0,count(source()));
  }finally{pool.shutdownNow();}
 }
 @Test void separateReaderCannotObserveUncommittedCiphertextAndRollbackLeavesNoRecord()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");List<EncryptedConnections.Stored> prepared=new ArrayList<>();new EncryptedConnections(key,prepared::add).save("owner","brand","brand.myshopify.com",new ShopifyOAuth.Grant("synthetic-uncommitted",Set.of("read_products")));var value=prepared.get(0);
  try(var writer=source.getConnection()){writer.setAutoCommit(false);try(var insert=writer.prepareStatement("INSERT INTO fc_merchant_connection(brand_id,owner_id,shop,scopes,aad_version,nonce,ciphertext) VALUES('brand','owner','brand.myshopify.com','read_products',1,?,?)")){insert.setBytes(1,value.nonce());insert.setBytes(2,value.ciphertext());insert.executeUpdate();}
   assertTrue(repository(source,"owner").read("brand").isEmpty());writer.rollback();
  }assertTrue(repository(source(),"owner").read("brand").isEmpty());assertEquals(0,count(source()));
 }
 @Test void ambiguousPostCommitFailurePreservesBindingAndNeverOverwritesOnRetry()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");var wrapper=new DelegatingSource(source,new AtomicBoolean());wrapper.failAfterCommit.set(true);var repo=repository(wrapper,"owner");assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));
  var stored=repository(source(),"owner").read("brand").orElseThrow();wrapper.failAfterCommit.set(false);assertThrows(ShopifyOAuth.Rejected.class,()->save(repo,"owner","brand","brand.myshopify.com"));assertArrayEquals(stored.ciphertext(),repository(source(),"owner").read("brand").orElseThrow().ciphertext());assertEquals(1,count(source()));
 }
 @Test void unsupportedOrInterruptedSchemaNeverAutoRepairsOrDropsData()throws Exception{
  var source=source();try(var c=source.getConnection();var s=c.createStatement()){s.execute("CREATE TABLE fc_schema_version(singleton INTEGER PRIMARY KEY,version INTEGER NOT NULL)");}
  assertThrows(ShopifyOAuth.Rejected.class,()->repository(source,"owner"));assertThrows(SQLException.class,()->migrate(source));
  try(var c=source.getConnection();var s=c.createStatement()){s.execute("INSERT INTO fc_schema_version VALUES(1,2)");}assertThrows(ShopifyOAuth.Rejected.class,()->repository(source,"owner"));
 }
 @Test void repeatedMigrationFailsWithoutDestroyingExistingRecords()throws Exception{
  var source=source();migrate(source);membership(source,"brand","owner");save(repository(source,"owner"),"owner","brand","brand.myshopify.com");assertThrows(SQLException.class,()->migrate(source));assertEquals(1,count(source));assertTrue(repository(source,"owner").read("brand").isPresent());
 }
 static final class DelegatingSource implements DataSource{
  final DataSource delegate;final AtomicBoolean failCommit;final AtomicBoolean failAfterCommit=new AtomicBoolean();volatile Runnable beforeCommit=()->{};DelegatingSource(DataSource source,AtomicBoolean fail){delegate=source;failCommit=fail;}
  public Connection getConnection()throws SQLException{return wrap(delegate.getConnection());}public Connection getConnection(String u,String p)throws SQLException{return wrap(delegate.getConnection(u,p));}
  Connection wrap(Connection actual){return (Connection)Proxy.newProxyInstance(Connection.class.getClassLoader(),new Class<?>[]{Connection.class},(proxy,method,args)->{if(method.getName().equals("commit")){beforeCommit.run();if(failCommit.get())throw new SQLException("synthetic commit failure");}try{Object result=method.invoke(actual,args);if(method.getName().equals("commit")&&failAfterCommit.get())throw new SQLException("synthetic lost acknowledgement");return result;}catch(InvocationTargetException ex){throw ex.getCause();}});}
  public PrintWriter getLogWriter()throws SQLException{return delegate.getLogWriter();}public void setLogWriter(PrintWriter w)throws SQLException{delegate.setLogWriter(w);}public void setLoginTimeout(int n)throws SQLException{delegate.setLoginTimeout(n);}public int getLoginTimeout()throws SQLException{return delegate.getLoginTimeout();}public Logger getParentLogger()throws SQLFeatureNotSupportedException{return delegate.getParentLogger();}public <T>T unwrap(Class<T> type)throws SQLException{return delegate.unwrap(type);}public boolean isWrapperFor(Class<?> type)throws SQLException{return delegate.isWrapperFor(type);}
 }
}
