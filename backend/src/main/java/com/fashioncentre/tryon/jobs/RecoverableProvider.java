package com.fashioncentre.tryon.jobs;

import java.util.UUID;

/** Future recoverable adapter port, currently implemented ONLY by test fakes.
 * Receipts must be the provider's durable identity, not PrunaTryOnProvider's in-memory local UUID.
 * Implementations require bounded timeouts, private input resolution, output validation and storage.
 * No transport, URL resolver, credentials or production implementation exists here.
 */
public interface RecoverableProvider {
    enum Status { PENDING, SUCCEEDED, FAILED }
    record Poll(Status status, UUID resultReference) {
        public Poll {
            if(status==null || (status==Status.SUCCEEDED)!=(resultReference!=null))
                throw new IllegalArgumentException("INVALID_PROVIDER_STATUS");
        }
        @Override public String toString(){return "ProviderPoll[status="+status+"]";}
    }
    String submit(PrivateTryOnJob job);
    /** A success reference is already validated, private, owner-scoped and registered for retention.
     * It never represents a provider URL. Delivery still needs separate authorization.
     */
    Poll poll(PrivateTryOnJob job, String durableProviderId);
}
