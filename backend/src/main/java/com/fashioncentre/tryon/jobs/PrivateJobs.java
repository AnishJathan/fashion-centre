package com.fashioncentre.tryon.jobs;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.State.*;

/** Unwired owner-scoped domain operations. No upload, provider call, or public HTTP endpoint.
 * Actor supplier MUST come from a verified server authentication context, never request body/header IDs.
 * ReferenceAccess MUST check private storage ownership; opaque identifiers alone confer no permission.
 * Completion is currently owner-scoped too; a future worker needs its own authenticated capability design.
 * Returned references are not capabilities: future private asset delivery must independently authorize access.
 */
public final class PrivateJobs {
    public record Actor(String subject, Instant expiresAt) {
        @Override public String toString() { return "Actor[redacted]"; }
    }
    public interface ReferenceAccess { boolean belongsTo(String owner, UUID reference); }
    public static final class Rejected extends RuntimeException {
        public Rejected(String code) { super(code); }
    }
    private final PrivateJobRepository repository;
    private final Supplier<Optional<Actor>> authenticatedActor;
    private final ReferenceAccess references;
    private final Clock clock;
    public PrivateJobs(PrivateJobRepository repository, Supplier<Optional<Actor>> authenticatedActor,
                       ReferenceAccess references, Clock clock) {
        this.repository = Objects.requireNonNull(repository);
        this.authenticatedActor = Objects.requireNonNull(authenticatedActor);
        this.references = Objects.requireNonNull(references);
        this.clock = Objects.requireNonNull(clock);
    }
    private String owner() {
        try {
            Actor actor = authenticatedActor.get().orElseThrow();
            if (actor.subject() == null || !actor.subject().matches("[A-Za-z0-9_-]{1,128}")
                    || actor.expiresAt() == null || !actor.expiresAt().isAfter(clock.instant()))
                throw new IllegalStateException();
            return actor.subject();
        } catch (RuntimeException e) { throw new Rejected("AUTHENTICATION_REQUIRED"); }
    }
    private void checkReference(String owner, UUID reference) {
        boolean allowed;
        try { allowed = reference != null && references.belongsTo(owner, reference); }
        catch (RuntimeException e) { allowed = false; }
        if (!allowed) throw new Rejected("REFERENCE_UNAVAILABLE");
    }
    private void requireOwner(String expected) {
        if (!expected.equals(owner())) throw new Rejected("AUTHENTICATION_REQUIRED");
    }
    private void authorizeInput(String owner, PrivateTryOnJob.Input input) {
        requireOwner(owner);
        checkReference(owner, input.personReference());
        requireOwner(owner);
        for (UUID ref : input.garmentReferences()) {
            checkReference(owner, ref);
            requireOwner(owner);
        }
    }
    private <T> T persist(Supplier<T> operation) {
        try { return operation.get(); }
        catch (Rejected e) {
            if ("AUTHENTICATION_REQUIRED".equals(e.getMessage()) || "REFERENCE_UNAVAILABLE".equals(e.getMessage())) throw e;
            throw new Rejected("PERSISTENCE_UNAVAILABLE");
        }
        catch (RuntimeException e) { throw new Rejected("PERSISTENCE_UNAVAILABLE"); }
    }
    public PrivateTryOnJob create(UUID idempotencyKey, PrivateTryOnJob.Input input) {
        String owner = owner();
        if (idempotencyKey == null || input == null) throw new Rejected("INVALID_INPUT");
        authorizeInput(owner, input);
        Instant now = clock.instant();
        PrivateTryOnJob candidate = new PrivateTryOnJob(UUID.randomUUID(), owner, idempotencyKey, input,
                QUEUED, 0, now, now, null, null);
        requireOwner(owner);
        PrivateTryOnJob stored = persist(() -> repository.createIfAbsent(candidate, () -> authorizeInput(owner, input)));
        requireOwner(owner);
        if (stored == null || !owner.equals(stored.owner()) || !idempotencyKey.equals(stored.idempotencyKey()))
            throw new Rejected("PERSISTENCE_INVARIANT_FAILED");
        if (!input.equals(stored.input())) throw new Rejected("IDEMPOTENCY_CONFLICT");
        return stored;
    }
    public PrivateTryOnJob read(UUID id) { return find(owner(), id); }
    private PrivateTryOnJob find(String owner, UUID id) {
        if (id == null) throw new Rejected("JOB_UNAVAILABLE");
        Optional<PrivateTryOnJob> stored = persist(() -> repository.find(owner, id));
        requireOwner(owner);
        if (stored == null) throw new Rejected("PERSISTENCE_UNAVAILABLE");
        PrivateTryOnJob job = stored.orElseThrow(() -> new Rejected("JOB_UNAVAILABLE"));
        if (!owner.equals(job.owner()) || !id.equals(job.id())) throw new Rejected("JOB_UNAVAILABLE");
        return job;
    }
    public PrivateTryOnJob start(UUID id, long revision) { return transition(id, revision, RUNNING, null, null); }
    public PrivateTryOnJob succeed(UUID id, long revision, UUID result) { return transition(id, revision, SUCCEEDED, result, null); }
    public PrivateTryOnJob fail(UUID id, long revision, PrivateTryOnJob.Failure failure) { return transition(id, revision, FAILED, null, failure); }
    public PrivateTryOnJob cancel(UUID id, long revision) { return transition(id, revision, CANCELLED, null, null); }
    private PrivateTryOnJob transition(UUID id, long revision, PrivateTryOnJob.State next, UUID result,
                                       PrivateTryOnJob.Failure failure) {
        String owner = owner();
        PrivateTryOnJob previous = find(owner, id);
        if (previous.revision() != revision) throw new Rejected("REVISION_CONFLICT");
        if (previous.terminal() || (next == RUNNING && previous.state() != QUEUED)
                || ((next == SUCCEEDED || next == FAILED) && previous.state() != RUNNING))
            throw new Rejected("INVALID_TRANSITION");
        if (next == RUNNING || next == SUCCEEDED) authorizeInput(owner, previous.input());
        if (next == SUCCEEDED) { checkReference(owner, result); requireOwner(owner); }
        if (next == FAILED && failure == null) throw new Rejected("INVALID_INPUT");
        if (revision == Long.MAX_VALUE) throw new Rejected("REVISION_EXHAUSTED");
        Instant now = clock.instant();
        if (now.isBefore(previous.updatedAt())) now = previous.updatedAt();
        PrivateTryOnJob replacement = new PrivateTryOnJob(id, owner, previous.idempotencyKey(), previous.input(),
                next, Math.addExact(revision, 1), previous.createdAt(), now, result, failure);
        requireOwner(owner);
        if (!persist(() -> repository.compareAndSet(owner, id, revision, replacement, () -> {
            requireOwner(owner);
            if (next == RUNNING || next == SUCCEEDED) authorizeInput(owner, previous.input());
            if (next == SUCCEEDED) { checkReference(owner, result); requireOwner(owner); }
        }))) throw new Rejected("REVISION_CONFLICT");
        requireOwner(owner);
        return replacement;
    }
}
