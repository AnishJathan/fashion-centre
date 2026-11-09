package com.fashioncentre.tryon;

import java.net.URI;
import java.time.Instant;
import java.util.List;

/** Server-side port; never return provider credentials or delivery URLs directly to browsers. */
public interface TryOnProvider {
    enum Status { QUEUED, PROCESSING, SUCCEEDED, FAILED, CANCELED, TIMED_OUT }
    record Request(URI personImage, List<URI> garmentImages) {
        public Request { garmentImages = garmentImages == null ? List.of() : List.copyOf(garmentImages); }
        @Override public String toString() { return "TryOnRequest[images redacted]"; }
    }
    record Job(String id, Status status, Instant nextPollAt, URI result) {
        @Override public String toString() { return "TryOnJob[" + status + ", result redacted]"; }
    }
    Job submit(Request request);
    Job poll(String jobId);
}
