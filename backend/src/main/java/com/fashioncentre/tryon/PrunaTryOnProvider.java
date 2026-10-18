package com.fashioncentre.tryon;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.time.*;
import java.util.*;

/** Disabled production boundary. No HTTP client, key lookup, upload or Spring bean exists. */
public final class PrunaTryOnProvider implements TryOnProvider {
    public static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration LIFETIME = Duration.ofMinutes(2), INTERVAL = Duration.ofSeconds(2);
    private static final int MAX_POLLS = 30, MAX_JOBS = 128;
    public record Response(int status, JsonNode body) {
        @Override public String toString() { return "ProviderResponse[" + status + ", body redacted]"; }
    }
    /** A future transport must enforce timeout and inject the apikey header server-side.
     * It must never follow redirects, log payloads or automatically retry submission. */
    public interface Transport {
        Response exchange(String method, String path, Map<String,String> headers, Map<String,Object> body, Duration timeout);
    }
    public static final class Failure extends RuntimeException {
        private final String code;
        Failure(String code) { super(code); this.code = code; }
        public String code() { return code; }
    }
    private static final class State {
        final String providerId; final Instant deadline; int polls; Job job;
        State(String providerId, Instant deadline, Job job) { this.providerId=providerId; this.deadline=deadline; this.job=job; }
    }
    private final Transport transport;
    private final Clock clock;
    private final Set<String> imageHosts;
    private final Map<String,State> jobs = new HashMap<>();
    public PrunaTryOnProvider() { transport=null; clock=Clock.systemUTC(); imageHosts=Set.of(); }
    // Package-private solely for contract tests. There is deliberately no live enablement flag.
    PrunaTryOnProvider(Transport transport, Clock clock, Set<String> imageHosts) {
        this.transport=Objects.requireNonNull(transport); this.clock=Objects.requireNonNull(clock);
        this.imageHosts=Set.copyOf(imageHosts);
    }
    private void enabled() { if (transport == null) throw new Failure("TRY_ON_DISABLED"); }
    private void image(URI uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost()==null || !imageHosts.contains(uri.getHost())
                || uri.getPort()!=-1 || uri.getUserInfo()!=null || uri.getFragment()!=null
                || uri.getQuery()!=null || uri.getPath().isBlank() || !uri.normalize().equals(uri))
            throw new Failure("INVALID_IMAGE_REFERENCE");
    }
    private Response call(String method, String path, Map<String,Object> body) {
        Instant start=clock.instant();
        Response response;
        try { response=transport.exchange(method,path,Map.of("Content-Type","application/json","Model","p-image-try-on"),body,REQUEST_TIMEOUT); }
        catch (RuntimeException ignored) { throw new Failure("PROVIDER_UNAVAILABLE"); }
        if (!clock.instant().isBefore(start.plus(REQUEST_TIMEOUT))) throw new Failure("PROVIDER_TIMEOUT");
        if (response==null) throw new Failure("INVALID_PROVIDER_RESPONSE");
        if (response.status()==429) throw new Failure("PROVIDER_RATE_LIMITED");
        if (response.status()==401 || response.status()==403) throw new Failure("PROVIDER_AUTH_FAILED");
        if (response.status()<200 || response.status()>299) throw new Failure("PROVIDER_UNAVAILABLE");
        if (response.body()==null || !response.body().isObject()) throw new Failure("INVALID_PROVIDER_RESPONSE");
        return response;
    }
    @Override public synchronized Job submit(Request request) {
        enabled();
        if (request==null || request.garmentImages().isEmpty() || request.garmentImages().size()>6) throw new Failure("INVALID_GARMENT_COUNT");
        image(request.personImage()); request.garmentImages().forEach(this::image);
        if (jobs.size()>=MAX_JOBS) throw new Failure("JOB_CAPACITY_REACHED");
        JsonNode body=call("POST","/v1/predictions",Map.of("input",Map.of(
                "person_image",request.personImage().toString(),
                "garment_images",request.garmentImages().stream().map(URI::toString).toList(),
                "output_format","jpg"))).body();
        String providerId=body.path("id").asText("");
        if (!providerId.matches("[A-Za-z0-9_-]{1,128}") || !body.path("model").asText("").equals("p-image-try-on"))
            throw new Failure("INVALID_PROVIDER_RESPONSE");
        // Ignore untrusted get_url. Construct the fixed status path ourselves.
        Instant now=clock.instant(); String id=UUID.randomUUID().toString();
        Job job=new Job(id,Status.QUEUED,now.plus(INTERVAL),null);
        jobs.put(id,new State(providerId,now.plus(LIFETIME),job)); return job;
    }
    @Override public synchronized Job poll(String jobId) {
        enabled(); State state=jobs.get(jobId);
        if (state==null) throw new Failure("UNKNOWN_JOB");
        if (state.job.status()!=Status.QUEUED && state.job.status()!=Status.PROCESSING) return state.job;
        Instant now=clock.instant();
        if (!now.isBefore(state.deadline) || state.polls>=MAX_POLLS) return finish(state,Status.TIMED_OUT,null);
        if (now.isBefore(state.job.nextPollAt())) return state.job;
        state.polls++;
        state.job=new Job(jobId,state.job.status(),now.plus(INTERVAL),null);
        JsonNode body=call("GET","/v1/predictions/status/"+state.providerId,Map.of()).body();
        if (!clock.instant().isBefore(state.deadline)) return finish(state,Status.TIMED_OUT,null);
        switch(body.path("status").asText("")) {
            case "starting", "processing":
                state.job=new Job(jobId,Status.PROCESSING,clock.instant().plus(INTERVAL),null); return state.job;
            case "failed": return finish(state,Status.FAILED,null);
            case "canceled": return finish(state,Status.CANCELED,null);
            case "succeeded":
                URI result;
                try { result=URI.create(body.path("generation_url").asText("")); }
                catch(IllegalArgumentException ignored) { throw new Failure("INVALID_PROVIDER_RESULT"); }
                if (!"https".equals(result.getScheme()) || !"api.pruna.ai".equals(result.getHost())
                    || result.getPort()!=-1 || result.getUserInfo()!=null || result.getQuery()!=null || result.getFragment()!=null
                    || !result.normalize().equals(result) || !result.getPath().startsWith("/v1/predictions/delivery/")
                    || !result.getPath().matches("/v1/predictions/delivery/[A-Za-z0-9_/-]+\\.(jpg|jpeg|png|webp)"))
                    throw new Failure("INVALID_PROVIDER_RESULT");
                return finish(state,Status.SUCCEEDED,result);
            default: throw new Failure("INVALID_PROVIDER_RESPONSE");
        }
    }
    private Job finish(State state,Status status,URI result) { return state.job=new Job(state.job.id(),status,null,result); }
}
