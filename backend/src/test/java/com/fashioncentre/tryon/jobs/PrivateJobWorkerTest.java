package com.fashioncentre.tryon.jobs;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.State.*;

class PrivateJobWorkerTest {
    static final class Time extends Clock {
        Instant now=Instant.parse("2026-10-18T10:00:00Z");
        public Instant instant(){return now;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId ignored){return this;}
        void advance(int seconds){now=now.plusSeconds(seconds);}
    }
    final Time time=new Time();
    final QueuePort port=new QueuePort(time);
    final FakeProvider provider=new FakeProvider();
    final Set<UUID> files=new HashSet<>();
    PrivateJobWorker worker(){return new PrivateJobWorker(port,provider,files::remove,time);}
    final class FakeProvider implements RecoverableProvider {
        int submissions,polls;boolean submitError,pollError,crash;Runnable onPoll;
        Poll response=new Poll(Status.SUCCEEDED,UUID.randomUUID());
        public String submit(PrivateTryOnJob job){
            assertEquals("SUBMITTING",port.phase,"Intent must be durably recorded first");submissions++;
            if(crash)throw new AssertionError("simulated abrupt process death");
            if(submitError)throw new IllegalStateException("provider secret diagnostic");return "provider_durable_123";
        }
        public Poll poll(PrivateTryOnJob job,String id){
            assertEquals("provider_durable_123",id);assertEquals("SUBMITTED",port.phase);polls++;
            if(onPoll!=null)onPoll.run();if(pollError)throw new IllegalStateException("transport private detail");return response;
        }
    }
    /** Models durable port invariants only; this is not a production persistence implementation. */
    static final class QueuePort implements WorkerJobs {
        final Time clock;PrivateTryOnJob job;String phase="READY",receipt;long fence;int attempt;Lease current;
        Instant due;boolean leased,receiptWriteFails,ackFails,authorized=true;
        Runnable beforeBegin;
        final List<UUID> deletions=new ArrayList<>();
        QueuePort(Time clock){this.clock=clock;due=clock.instant();job=new PrivateTryOnJob(UUID.randomUUID(),"owner",UUID.randomUUID(),
                new PrivateTryOnJob.Input(UUID.randomUUID(),List.of(UUID.randomUUID())),QUEUED,0,due,due,null,null);}
        public Optional<Lease> claim(){
            if(job.terminal()||clock.instant().isBefore(due)||(leased&&current.expiresAt().isAfter(clock.instant())))return Optional.empty();
            if(phase.equals("SUBMITTING")||attempt>=3){terminal(FAILED,null,PrivateTryOnJob.Failure.TIMED_OUT);return Optional.empty();}
            job=new PrivateTryOnJob(job.id(),job.owner(),job.idempotencyKey(),job.input(),RUNNING,job.revision()+1,job.createdAt(),clock.instant(),null,null);
            current=new Lease(job,UUID.randomUUID(),++fence,clock.instant().plusSeconds(30),++attempt,Optional.ofNullable(receipt));leased=true;return Optional.of(current);
        }
        boolean valid(Lease lease){return leased&&!job.terminal()&&current.token().equals(lease.token())&&current.fence()==lease.fence()&&lease.expiresAt().isAfter(clock.instant());}
        public boolean beginSubmission(Lease lease){if(beforeBegin!=null)beforeBegin.run();if(!valid(lease)||!phase.equals("READY"))return false;phase="SUBMITTING";return true;}
        public boolean markSubmitted(Lease lease,String id){
            if(receiptWriteFails)throw new IllegalStateException("private DB failure");
            if(!valid(lease)||!phase.equals("SUBMITTING"))return false;receipt=id;phase="SUBMITTED";return true;
        }
        public boolean complete(Lease lease,UUID ref){if(!valid(lease)||!phase.equals("SUBMITTED"))return false;terminal(SUCCEEDED,ref,null);return true;}
        public boolean fail(Lease lease,PrivateTryOnJob.Failure failure){if(!valid(lease))return false;terminal(FAILED,null,failure);return true;}
        public boolean retry(Lease lease,Instant next){if(!valid(lease)||phase.equals("SUBMITTING"))return false;leased=false;due=next;return true;}
        void terminal(PrivateTryOnJob.State state,UUID result,PrivateTryOnJob.Failure failure){job=new PrivateTryOnJob(job.id(),job.owner(),job.idempotencyKey(),job.input(),state,job.revision()+1,job.createdAt(),clock.instant(),result,failure);leased=false;}
        void cancel(){terminal(CANCELLED,null,null);}
        public int expire(int limit){return 0;}
        public List<UUID> pendingDeletes(int limit){return List.copyOf(deletions.subList(0,Math.min(limit,deletions.size())));}
        public boolean authorizeDelete(UUID ref){return authorized&&deletions.contains(ref);}
        public boolean ackDelete(UUID ref){return authorized&&!ackFails&&deletions.remove(ref);}
    }
    @Test void restartedWorkerPollsPersistedReceiptWithoutSubmittingAgain(){
        assertEquals(PrivateJobWorker.Outcome.SUBMITTED,worker().runOne());assertEquals(1,provider.submissions);
        assertEquals(PrivateJobWorker.Outcome.IDLE,worker().runOne());time.advance(2);
        assertEquals(PrivateJobWorker.Outcome.SUCCEEDED,worker().runOne());assertEquals(1,provider.submissions);assertEquals(1,provider.polls);
        assertEquals(provider.response.resultReference(),port.job.resultReference());
    }
    @Test void ambiguousSubmissionExceptionNeverRetries(){
        provider.submitError=true;assertEquals(PrivateJobWorker.Outcome.FAILED,worker().runOne());
        assertEquals(PrivateTryOnJob.Failure.TIMED_OUT,port.job.failure());time.advance(60);
        assertEquals(PrivateJobWorker.Outcome.IDLE,worker().runOne());assertEquals(1,provider.submissions);
    }
    @Test void cancellationBeforeIntentCommitPreventsAnyProviderSubmission(){
        port.beforeBegin=port::cancel;assertEquals(PrivateJobWorker.Outcome.STALE,worker().runOne());
        assertEquals(0,provider.submissions);assertEquals(CANCELLED,port.job.state());
    }
    @Test void finalReadyClaimCannotSubmitWithoutRemainingPollingBudget(){
        port.claim().orElseThrow();time.advance(31); // crash before submission intent
        port.claim().orElseThrow();time.advance(31); // second crash still leaves READY
        assertEquals(PrivateJobWorker.Outcome.FAILED,worker().runOne());
        assertEquals(0,provider.submissions);assertEquals(0,provider.polls);
        assertEquals(FAILED,port.job.state());assertEquals(PrivateTryOnJob.Failure.TIMED_OUT,port.job.failure());
        assertEquals("READY",port.phase);
    }
    @Test void processDeathAfterSubmissionIntentNeverAutomaticallyResubmits(){
        provider.crash=true;assertThrows(AssertionError.class,()->worker().runOne());assertEquals("SUBMITTING",port.phase);
        time.advance(31);assertEquals(PrivateJobWorker.Outcome.IDLE,worker().runOne());assertEquals(FAILED,port.job.state());assertEquals(1,provider.submissions);
    }
    @Test void lostReceiptWriteStaysAmbiguousRatherThanRetryingProvider(){
        port.receiptWriteFails=true;assertEquals(PrivateJobWorker.Outcome.UNAVAILABLE,worker().runOne());assertEquals("SUBMITTING",port.phase);
        time.advance(31);assertEquals(PrivateJobWorker.Outcome.IDLE,worker().runOne());assertEquals(1,provider.submissions);
    }
    @Test void pollingRetriesAreDelayedAndBoundedWithoutResubmission(){
        assertEquals(PrivateJobWorker.Outcome.SUBMITTED,worker().runOne());provider.pollError=true;time.advance(2);
        assertEquals(PrivateJobWorker.Outcome.RETRY_SCHEDULED,worker().runOne());assertEquals(PrivateJobWorker.Outcome.IDLE,worker().runOne());
        time.advance(2);assertEquals(PrivateJobWorker.Outcome.FAILED,worker().runOne());assertEquals(1,provider.submissions);assertEquals(2,provider.polls);
    }
    @Test void cancellationDuringPollWinsAndStaleLeaseCannotComplete(){
        worker().runOne();time.advance(2);provider.onPoll=port::cancel;
        assertEquals(PrivateJobWorker.Outcome.STALE,worker().runOne());assertEquals(CANCELLED,port.job.state());assertNull(port.job.resultReference());
        assertFalse(port.complete(port.current,UUID.randomUUID()));
    }
    @Test void expiredLeaseCannotCompleteAndRecoveryPollsWithFreshFence(){
        worker().runOne();time.advance(2);var old=port.claim().orElseThrow();time.advance(31);
        assertFalse(port.complete(old,UUID.randomUUID()));
        assertEquals(PrivateJobWorker.Outcome.SUCCEEDED,worker().runOne());assertTrue(port.current.fence()>old.fence());assertEquals(1,provider.submissions);
    }
    @Test void deletionIsAcknowledgedOnlyAfterSuccessAndRepeatedDeletionIsSafe(){
        UUID ref=UUID.randomUUID();files.add(ref);port.deletions.add(ref);
        var failing=new PrivateJobWorker(port,provider,id->{throw new IllegalStateException("storage secret");},time);
        assertEquals(new PrivateJobWorker.Deletions(0,1),failing.cleanUp(10));assertTrue(files.contains(ref));assertEquals(List.of(ref),port.deletions);
        port.ackFails=true;assertEquals(new PrivateJobWorker.Deletions(0,1),worker().cleanUp(10));assertFalse(files.contains(ref));assertEquals(List.of(ref),port.deletions);
        port.ackFails=false;assertEquals(new PrivateJobWorker.Deletions(1,0),worker().cleanUp(10));assertTrue(port.deletions.isEmpty());
        assertThrows(IllegalArgumentException.class,()->worker().cleanUp(101));
    }
    @Test void authorityLossDuringDeletionStopsFurtherDestructiveCalls(){
        UUID first=UUID.randomUUID(),second=UUID.randomUUID();port.deletions.addAll(List.of(first,second));
        List<UUID> deleted=new ArrayList<>();
        var worker=new PrivateJobWorker(port,provider,id->{deleted.add(id);port.authorized=false;},time);
        assertEquals(new PrivateJobWorker.Deletions(0,1),worker.cleanUp(10));assertEquals(List.of(first),deleted);
        assertEquals(List.of(first,second),port.deletions);
        assertEquals(new PrivateJobWorker.Deletions(0,1),worker.cleanUp(10));assertEquals(List.of(first),deleted);
    }
}
