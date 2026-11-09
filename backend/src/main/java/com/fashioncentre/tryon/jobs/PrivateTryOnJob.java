package com.fashioncentre.tryon.jobs;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Private domain snapshot. References are opaque IDs, never delivery URLs or image bytes. */
public record PrivateTryOnJob(UUID id, String owner, UUID idempotencyKey, Input input,
                              State state, long revision, Instant createdAt, Instant updatedAt,
                              UUID resultReference, Failure failure) {
    public enum State { QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED }
    public enum Failure { PROVIDER_REJECTED, PROCESSING_FAILED, TIMED_OUT }
    public record Input(UUID personReference, List<UUID> garmentReferences) {
        public Input {
            Objects.requireNonNull(personReference);
            garmentReferences = List.copyOf(garmentReferences);
            if (garmentReferences.isEmpty() || garmentReferences.size() > 6
                    || garmentReferences.stream().distinct().count() != garmentReferences.size())
                throw new IllegalArgumentException("INVALID_REFERENCES");
        }
        @Override public String toString() { return "Input[references redacted]"; }
    }
    public PrivateTryOnJob {
        Objects.requireNonNull(id); Objects.requireNonNull(idempotencyKey); Objects.requireNonNull(input);
        Objects.requireNonNull(state); Objects.requireNonNull(createdAt); Objects.requireNonNull(updatedAt);
        if (owner == null || !owner.matches("[A-Za-z0-9_-]{1,128}") || revision < 0
                || updatedAt.isBefore(createdAt)
                || (state == State.SUCCEEDED) != (resultReference != null)
                || (state == State.FAILED) != (failure != null))
            throw new IllegalArgumentException("INVALID_JOB");
    }
    public boolean terminal() { return state == State.SUCCEEDED || state == State.FAILED || state == State.CANCELLED; }
    @Override public String toString() { return "PrivateTryOnJob[state=" + state + ", revision=" + revision + "]"; }
}
