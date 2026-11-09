package com.fashioncentre.tryon;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TryOnTest {
    static class Time extends Clock {
        Instant now=Instant.parse("2026-10-18T00:00:00Z");
        public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId z){return this;}
        public Instant instant(){return now;} void advance(int seconds){now=now.plusSeconds(seconds);}
    }
    record Call(String method,String path,Map<String,String> headers,Map<String,Object> body,Duration timeout) {}
    static class Fake implements PrunaTryOnProvider.Transport {
        List<Call> calls=new ArrayList<>(); Queue<PrunaTryOnProvider.Response> responses=new ArrayDeque<>();
        void reply(int code,String json) throws Exception { responses.add(new PrunaTryOnProvider.Response(code,new ObjectMapper().readTree(json))); }
        public PrunaTryOnProvider.Response exchange(String m,String p,Map<String,String> h,Map<String,Object> b,Duration t) {
            calls.add(new Call(m,p,h,b,t)); return responses.remove();
        }
    }
    final Fake fake=new Fake(); final Time time=new Time();
    final PrunaTryOnProvider adapter=new PrunaTryOnProvider(fake,time,Set.of("images.example.invalid"));
    TryOnProvider.Request request(){return new TryOnProvider.Request(URI.create("https://images.example.invalid/person.jpg"),List.of(URI.create("https://images.example.invalid/garment.jpg")));}
    TryOnProvider.Job submit() throws Exception { fake.reply(201,"{\"id\":\"pred_test_1\",\"model\":\"p-image-try-on\",\"get_url\":\"https://attacker.invalid/\"}"); return adapter.submit(request()); }
    @Test void productionIsDisabledAndEmpty() throws Exception {
        assertEquals("TRY_ON_DISABLED",assertThrows(PrunaTryOnProvider.Failure.class,()->new PrunaTryOnProvider().submit(request())).code());
        var mvc=MockMvcBuilders.standaloneSetup(new TryOnController()).build();
        mvc.perform(get("/api/try-on/status")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.results").isEmpty());
        mvc.perform(post("/api/try-on/jobs").contentType("application/json").content("{}"))
            .andExpect(status().isNotImplemented()).andExpect(jsonPath("$.code").value("TRY_ON_DISABLED"));
    }
    @Test void matchesAsyncContractAndNeverFollowsGetUrl() throws Exception {
        var job=submit(); var call=fake.calls.get(0);
        assertEquals("POST",call.method()); assertEquals("/v1/predictions",call.path());
        assertEquals("p-image-try-on",call.headers().get("Model")); assertFalse(call.headers().containsKey("apikey"));
        assertEquals(Duration.ofSeconds(10),call.timeout());
        assertEquals(Map.of("person_image",request().personImage().toString(),"garment_images",List.of(request().garmentImages().get(0).toString()),"output_format","jpg"),call.body().get("input"));
        adapter.poll(job.id()); assertEquals(1,fake.calls.size());
        time.advance(2); fake.reply(200,"{\"status\":\"processing\"}"); assertEquals(TryOnProvider.Status.PROCESSING,adapter.poll(job.id()).status());
        assertEquals("/v1/predictions/status/pred_test_1",fake.calls.get(1).path());
        time.advance(2); fake.reply(200,"{\"status\":\"succeeded\",\"generation_url\":\"https://api.pruna.ai/v1/predictions/delivery/test/output.jpg\"}");
        var done=adapter.poll(job.id()); assertEquals(TryOnProvider.Status.SUCCEEDED,done.status()); assertNotNull(done.result());
        assertEquals(done,adapter.poll(job.id())); assertEquals(3,fake.calls.size());
        assertFalse(request().toString().contains("person.jpg")); assertFalse(done.toString().contains("output.jpg"));
    }
    @Test void validatesReferencesBeforeTransport() {
        for(String url:List.of("http://images.example.invalid/a.jpg","https://127.0.0.1/a.jpg","https://images.example.invalid.evil/a.jpg","https://images.example.invalid:443/a.jpg","https://images.example.invalid/a.jpg?secret=x","https://images.example.invalid/a/../b.jpg")) {
            assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(new TryOnProvider.Request(URI.create(url),request().garmentImages())));
        }
        assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(new TryOnProvider.Request(request().personImage(),Collections.nCopies(7,request().personImage()))));
        assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.poll("forged")); assertTrue(fake.calls.isEmpty());
    }
    @Test void boundedPollingAndDeadline() throws Exception {
        var job=submit();
        for(int i=0;i<30;i++){time.advance(2);fake.reply(200,"{\"status\":\"starting\"}");adapter.poll(job.id());}
        assertEquals(TryOnProvider.Status.TIMED_OUT,adapter.poll(job.id()).status()); assertEquals(31,fake.calls.size());
        var another=submit(); time.advance(120); assertEquals(TryOnProvider.Status.TIMED_OUT,adapter.poll(another.id()).status()); assertEquals(32,fake.calls.size());
    }
    @Test void sanitizesErrorsAndThrottlesRetries() throws Exception {
        var job=submit(); time.advance(2);fake.reply(429,"{\"error\":\"sensitive URL\"}");
        var error=assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.poll(job.id()));assertEquals("PROVIDER_RATE_LIMITED",error.getMessage());
        adapter.poll(job.id());assertEquals(2,fake.calls.size());
        time.advance(2);fake.reply(200,"{\"status\":\"failed\",\"error\":\"private image\"}");assertEquals(TryOnProvider.Status.FAILED,adapter.poll(job.id()).status());
    }
    @Test void rejectsUnsafeResultAndMalformedStatus() throws Exception {
        var job=submit(); time.advance(2);fake.reply(200,"{\"status\":\"succeeded\",\"generation_url\":\"https://evil.invalid/output.jpg\"}");
        assertEquals("INVALID_PROVIDER_RESULT",assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.poll(job.id())).code());
        time.advance(2);fake.reply(200,"{\"status\":\"unknown\"}");assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.poll(job.id()));
        assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(request())); // missing response sanitized
    }
    @Test void responseDeadlineAndAuthErrors() throws Exception {
        var slow=new PrunaTryOnProvider((m,p,h,b,t)->{time.advance(10);return null;},time,Set.of("images.example.invalid"));
        assertEquals("PROVIDER_TIMEOUT",assertThrows(PrunaTryOnProvider.Failure.class,()->slow.submit(request())).code());
        fake.reply(401,"{}");assertEquals("PROVIDER_AUTH_FAILED",assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(request())).code());
        fake.reply(503,"{}");assertEquals("PROVIDER_UNAVAILABLE",assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(request())).code());
        fake.reply(201,"{\"id\":\"../../escape\",\"model\":\"p-image-try-on\"}");assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(request()));
    }
    @Test void abandonedJobsExpireAndReleaseCapacity() throws Exception {
        var first=submit();for(int i=1;i<128;i++)submit();
        assertEquals("JOB_CAPACITY_REACHED",assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.submit(request())).code());
        time.advance(420);assertEquals("UNKNOWN_JOB",assertThrows(PrunaTryOnProvider.Failure.class,()->adapter.poll(first.id())).code());
        assertEquals(TryOnProvider.Status.QUEUED,submit().status());
    }
}
