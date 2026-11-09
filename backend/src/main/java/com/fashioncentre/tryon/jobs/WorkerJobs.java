package com.fashioncentre.tryon.jobs;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Trusted worker persistence port, never a public endpoint. Every mutation verifies worker authority,
 * lease token/fence/expiry and job state atomically. False means nothing changed.
 * Claim increments fence/attempt (maximum three), reclaiming only READY or SUBMITTED jobs.
 * Expired SUBMITTING is ambiguous and must terminate without resubmission.
 */
public interface WorkerJobs {
    record Lease(PrivateTryOnJob job, UUID token, long fence, Instant expiresAt, int attempt,
                 Optional<String> providerJobId) {
        @Override public String toString(){return "WorkerLease[fence="+fence+", attempt="+attempt+"]";}
    }
    Optional<Lease> claim();
    /** Commit READY -> SUBMITTING before any provider call. A crash must never permit automatic resend. */
    boolean beginSubmission(Lease lease);
    /** Persist recoverable remote receipt, atomically SUBMITTING -> SUBMITTED. */
    boolean markSubmitted(Lease lease, String providerJobId);
    /** Result must already be private, registered to this owner and governed by storage retention.
     * Cancellation/lease mismatch rejects completion. Unattached result assets still need retention.
     */
    boolean complete(Lease lease, UUID resultReference);
    boolean fail(Lease lease, PrivateTryOnJob.Failure failure);
    /** Only READY (no provider invocation) or SUBMITTED (safe polling) can retry. Never SUBMITTING. */
    boolean retry(Lease lease, Instant nextAttemptAt);
    /** Expire metadata and enqueue eligible private assets atomically, retaining idempotency tombstones. */
    int expire(int limit);
    List<UUID> pendingDeletes(int limit);
    /** Fresh trusted worker/expiry and queued-reference authorization immediately before EACH deletion. */
    boolean authorizeDelete(UUID reference);
    /** Acknowledge only after idempotent storage deletion succeeded; outages preserve the queue. */
    boolean ackDelete(UUID reference);
}
