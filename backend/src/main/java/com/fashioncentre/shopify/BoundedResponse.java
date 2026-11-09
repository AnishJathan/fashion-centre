package com.fashioncentre.shopify;

import java.io.ByteArrayOutputStream;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;

/** Enforces byte and elapsed-time limits through the final body byte, not just response headers. */
final class BoundedResponse {
 static HttpResponse<byte[]> send(HttpClient client,HttpRequest request,Duration deadline,int maxBytes)throws Exception{
  var pending=client.sendAsync(request,info->new Subscriber(maxBytes));
  try{return pending.get(deadline.toMillis(),TimeUnit.MILLISECONDS);}
  catch(InterruptedException ex){pending.cancel(true);Thread.currentThread().interrupt();throw ex;}
  catch(TimeoutException ex){pending.cancel(true);throw new HttpTimeoutException("Catalogue response timed out");}
 }
 static final class Subscriber implements HttpResponse.BodySubscriber<byte[]> {
  private final int limit;private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
  private final CompletableFuture<byte[]> result=new CompletableFuture<>();private Flow.Subscription subscription;
  Subscriber(int limit){if(limit<1)throw new IllegalArgumentException("Invalid response limit");this.limit=limit;}
  public CompletionStage<byte[]> getBody(){return result;}
  public void onSubscribe(Flow.Subscription value){if(subscription!=null){value.cancel();return;}subscription=value;value.request(1);}
  public void onNext(List<ByteBuffer> chunks){
   if(result.isDone())return;
   for(var chunk:chunks){if(chunk.remaining()>limit-bytes.size()){subscription.cancel();result.completeExceptionally(new StorefrontAdapter.ContractException("Response exceeds preview limit"));return;}byte[] part=new byte[chunk.remaining()];chunk.get(part);bytes.writeBytes(part);}
   subscription.request(1);
  }
  public void onError(Throwable error){result.completeExceptionally(error);}
  public void onComplete(){result.complete(bytes.toByteArray());}
 }
}
