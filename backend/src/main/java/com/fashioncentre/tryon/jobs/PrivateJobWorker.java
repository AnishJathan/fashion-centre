package com.fashioncentre.tryon.jobs;

import java.time.Clock;
import java.time.Duration;
import java.util.Objects;
import java.util.UUID;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.Failure.*;

/** Explicitly constructed only. No Spring bean, scheduler, runtime routes or live adapters.
 * Conservative budget: three claims TOTAL, including initial submission, leaves at most two poll claims.
 */
public final class PrivateJobWorker {
    public interface PrivateStorage {
        /** Trusted opaque reference only. Must be idempotent, bounded, and succeed when already absent.
         * A future adapter must independently enforce trusted worker authority/expiry and the deletion
         * candidate's authorization at execution; this call's UUID is not a deletion capability.
         */
        void delete(UUID reference);
    }
    public enum Outcome { IDLE, SUBMITTED, RETRY_SCHEDULED, SUCCEEDED, FAILED, STALE, UNAVAILABLE }
    public record Deletions(int acknowledged, int remainingFailures) {}
    private final WorkerJobs jobs;
    private final RecoverableProvider provider;
    private final PrivateStorage storage;
    private final Clock clock;
    private static final Duration POLL_DELAY=Duration.ofSeconds(2);
    public PrivateJobWorker(WorkerJobs jobs,RecoverableProvider provider,PrivateStorage storage,Clock clock){
        this.jobs=Objects.requireNonNull(jobs);this.provider=Objects.requireNonNull(provider);
        this.storage=Objects.requireNonNull(storage);this.clock=Objects.requireNonNull(clock);
    }
    public Outcome runOne(){
        try {
            var optional=jobs.claim();if(optional.isEmpty())return Outcome.IDLE;
            var lease=optional.get();
            if(lease.job()==null||lease.job().terminal()||lease.token()==null||lease.expiresAt()==null
                    ||!lease.expiresAt().isAfter(clock.instant())||lease.attempt()<1||lease.attempt()>3
                    ||lease.fence()<1||lease.providerJobId()==null)return Outcome.STALE;
            if(lease.providerJobId().isEmpty())return submit(lease);
            String receipt=lease.providerJobId().get();
            if(!validReceipt(receipt))return fail(lease,PROCESSING_FAILED);
            RecoverableProvider.Poll poll;
            try {poll=provider.poll(lease.job(),receipt);}
            catch(RuntimeException e){return retry(lease);}
            if(poll==null)return fail(lease,PROCESSING_FAILED);
            return switch(poll.status()){
                case PENDING -> retry(lease);
                case FAILED -> fail(lease,PROVIDER_REJECTED);
                case SUCCEEDED -> jobs.complete(lease,poll.resultReference())?Outcome.SUCCEEDED:Outcome.STALE;
            };
        }catch(RuntimeException e){return Outcome.UNAVAILABLE;}
    }
    private Outcome submit(WorkerJobs.Lease lease){
        // A recovered READY claim may have used the budget before any remote request.
        // Never create a billable job when no subsequent claim remains to observe its result.
        if(lease.attempt()>=3)return fail(lease,TIMED_OUT);
        if(!jobs.beginSubmission(lease))return Outcome.STALE;
        if(!lease.expiresAt().isAfter(clock.instant()))return Outcome.STALE;
        String receipt;
        try {receipt=provider.submit(lease.job());}
        // An exception may mean the remote side accepted the request. Never retry submission.
        catch(RuntimeException e){return fail(lease,TIMED_OUT);}
        if(!validReceipt(receipt))return fail(lease,TIMED_OUT);
        // Failure or crash here leaves durable SUBMITTING: recovery must not invoke submit again.
        if(!jobs.markSubmitted(lease,receipt))return Outcome.STALE;
        // Receipt is durable now: releasing this lease for polling is safe, unlike resending submission.
        return jobs.retry(lease,clock.instant().plus(POLL_DELAY))?Outcome.SUBMITTED:Outcome.STALE;
    }
    private static boolean validReceipt(String receipt){return receipt!=null&&receipt.matches("[A-Za-z0-9_-]{1,128}");}
    private Outcome retry(WorkerJobs.Lease lease){
        if(lease.attempt()>=3)return fail(lease,TIMED_OUT);
        return jobs.retry(lease,clock.instant().plus(POLL_DELAY))?Outcome.RETRY_SCHEDULED:Outcome.STALE;
    }
    private Outcome fail(WorkerJobs.Lease lease,PrivateTryOnJob.Failure failure){
        return jobs.fail(lease,failure)?Outcome.FAILED:Outcome.STALE;
    }
    public Deletions cleanUp(int limit){
        if(limit<1||limit>100)throw new IllegalArgumentException("INVALID_BATCH_LIMIT");
        int acknowledged=0,failed=0;
        try {
            jobs.expire(limit);
            var pending=jobs.pendingDeletes(limit);
            if(pending.size()>limit)return new Deletions(0,1);
            for(UUID reference:pending){
                if(reference==null){failed++;continue;}
                if(!jobs.authorizeDelete(reference)){failed++;break;}
                try {storage.delete(reference);if(jobs.ackDelete(reference))acknowledged++;else {failed++;break;}}
                catch(RuntimeException e){failed++;}
            }
        }catch(RuntimeException e){failed++;}
        return new Deletions(acknowledged,failed);
    }
}
