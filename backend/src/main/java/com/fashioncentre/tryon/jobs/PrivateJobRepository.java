package com.fashioncentre.tryon.jobs;

import java.util.Optional;
import java.util.UUID;

/** Persistence port only: no production adapter or Spring wiring exists.
 * Implementations must be durable, enforce tenant predicates, and perform each mutation atomically.
 * Idempotency reservations must remain for the lifetime of the job; deletion/reuse is a separate policy.
 * Both mutations must invoke authorizationGuard inside their transaction immediately before writing.
 * A future durable adapter MUST additionally revalidate authentication and reference permissions against
 * transactionally consistent authority records/revisions. A Java callback alone cannot make an external
 * authority check atomic with a database commit. If that guarantee is unavailable, fail closed.
 */
public interface PrivateJobRepository {
    /** Atomically reserve unique (owner, idempotencyKey), returning the inserted or existing snapshot.
     * Never overwrite an existing job, including terminal jobs. Also enforce unique job IDs.
     */
    PrivateTryOnJob createIfAbsent(PrivateTryOnJob candidate, Runnable authorizationGuard);
    Optional<PrivateTryOnJob> find(String owner, UUID jobId);
    /** Atomically update WHERE owner, job ID, revision AND nonterminal state match.
     * Require revision+1, unchanged owner/ID/idempotency key/input/creation time and a legal transition.
     * False means no mutation. Never upsert, change a terminal row, or drop the owner predicate.
     */
    boolean compareAndSet(String owner, UUID jobId, long expectedRevision, PrivateTryOnJob replacement,
                          Runnable authorizationGuard);
}
