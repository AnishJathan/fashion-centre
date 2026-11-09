package com.fashioncentre.shopify;
import com.sun.net.httpserver.HttpServer;
import java.net.*;import java.net.http.*;import java.nio.ByteBuffer;import java.time.Duration;import java.util.List;import java.util.concurrent.*;
import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;
class BoundedResponseTest {
 @Test void rejectsOversizeAcrossChunksAndCancelsPublisher(){
  boolean[] canceled={false};var subscriber=new BoundedResponse.Subscriber(4);
  subscriber.onSubscribe(new Flow.Subscription(){public void request(long n){}public void cancel(){canceled[0]=true;}});
  subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1,2,3})));subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{4,5})));
  assertTrue(canceled[0]);assertThrows(CompletionException.class,()->subscriber.getBody().toCompletableFuture().join());
 }
 @Test void exactLimitBodyCompletes(){var subscriber=new BoundedResponse.Subscriber(2);subscriber.onSubscribe(new Flow.Subscription(){public void request(long n){}public void cancel(){fail("Must not cancel valid body");}});subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1,2})));subscriber.onComplete();assertArrayEquals(new byte[]{1,2},subscriber.getBody().toCompletableFuture().join());}
 @Test void deadlineCoversStalledBodyAfterHeaders()throws Exception{
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var release=new CountDownLatch(1);var headers=new CountDownLatch(1);
  server.createContext("/warm",exchange->{exchange.sendResponseHeaders(200,-1);exchange.close();});
  server.createContext("/slow",exchange->{try{exchange.sendResponseHeaders(200,0);exchange.getResponseBody().write('x');exchange.getResponseBody().flush();headers.countDown();release.await(30,TimeUnit.SECONDS);}catch(InterruptedException ex){Thread.currentThread().interrupt();}finally{exchange.close();}});server.start();
  try{String origin="http://127.0.0.1:"+server.getAddress().getPort();var client=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
   // Warm the client/server before the body test so class-loading and startup do not consume its deadline.
   assertEquals(200,BoundedResponse.send(client,HttpRequest.newBuilder(URI.create(origin+"/warm")).build(),Duration.ofSeconds(10),1024).statusCode());
   var request=HttpRequest.newBuilder(URI.create(origin+"/slow")).build();assertThrows(HttpTimeoutException.class,()->BoundedResponse.send(client,request,Duration.ofSeconds(3),1024));assertEquals(0,headers.getCount(),"Headers and one byte must arrive before body deadline");}
  finally{release.countDown();server.stop(0);}
 }
}
