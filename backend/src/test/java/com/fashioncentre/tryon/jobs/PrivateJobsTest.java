package com.fashioncentre.tryon.jobs;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.State.*;

class PrivateJobsTest {
    final Instant now = Instant.parse("2026-10-18T09:00:00Z");
    final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    final AtomicReference<Optional<PrivateJobs.Actor>> actor = new AtomicReference<>(Optional.of(new PrivateJobs.Actor("alice", now.plusSeconds(60))));
    final Memory repository = new Memory();
    final Map<UUID,String> references = new HashMap<>();
    final PrivateJobs jobs = new PrivateJobs(repository, actor::get, (owner, ref) -> owner.equals(references.get(ref)), clock);
    UUID reference(String owner) { UUID id=UUID.randomUUID(); references.put(id,owner); return id; }
    PrivateTryOnJob.Input input(String owner) { return new PrivateTryOnJob.Input(reference(owner),List.of(reference(owner))); }
    PrivateTryOnJob create() { return jobs.create(UUID.randomUUID(),input("alice")); }
    void rejected(String code, org.junit.jupiter.api.function.Executable operation) {
        assertEquals(code,assertThrows(PrivateJobs.Rejected.class,operation).getMessage());
    }
    /** Test double only. A future durable adapter must pass the same atomic/tenant invariants. */
    static final class Memory implements PrivateJobRepository {
        final Map<UUID,PrivateTryOnJob> rows=new HashMap<>();
        Runnable beforeCas;
        Runnable afterFind;
        Runnable beforeCreate;
        boolean broken;
        int calls;
        public synchronized PrivateTryOnJob createIfAbsent(PrivateTryOnJob candidate, Runnable guard) {
            calls++;
            if(broken)throw new IllegalStateException("private database connection secret");
            if(beforeCreate!=null){Runnable callback=beforeCreate;beforeCreate=null;callback.run();}
            guard.run();
            for (PrivateTryOnJob row:rows.values())
                if(row.owner().equals(candidate.owner())&&row.idempotencyKey().equals(candidate.idempotencyKey()))return row;
            if(rows.containsKey(candidate.id()))throw new IllegalStateException("DUPLICATE_ID");
            rows.put(candidate.id(),candidate);return candidate;
        }
        public synchronized Optional<PrivateTryOnJob> find(String owner,UUID id) {
            calls++;
            if(broken)throw new IllegalStateException("private database connection secret");
            var result=Optional.ofNullable(rows.get(id)).filter(row->owner.equals(row.owner()));
            if(afterFind!=null){Runnable callback=afterFind;afterFind=null;callback.run();}
            return result;
        }
        public synchronized boolean compareAndSet(String owner,UUID id,long revision,PrivateTryOnJob next,Runnable guard) {
            calls++;
            if(broken)throw new IllegalStateException("private database connection secret");
            if(beforeCas!=null){Runnable race=beforeCas;beforeCas=null;race.run();}
            guard.run();
            PrivateTryOnJob old=rows.get(id);
            if(old==null||!owner.equals(old.owner())||old.revision()!=revision||old.terminal())return false;
            if(!next.id().equals(id)||!next.owner().equals(owner)||next.revision()!=revision+1
                    ||!next.idempotencyKey().equals(old.idempotencyKey())||!next.input().equals(old.input())
                    ||!next.createdAt().equals(old.createdAt())||next.updatedAt().isBefore(old.updatedAt()))return false;
            boolean legal=(old.state()==QUEUED&&(next.state()==RUNNING||next.state()==CANCELLED))
                    ||(old.state()==RUNNING&&(next.state()==SUCCEEDED||next.state()==FAILED||next.state()==CANCELLED));
            if(!legal)return false;
            rows.put(id,next);return true;
        }
    }
    @Test void missingExpiredMalformedOrFailingAuthenticationCannotAccessRepository() {
        var request=input("alice");UUID key=UUID.randomUUID();
        for(Optional<PrivateJobs.Actor> subject:List.of(Optional.<PrivateJobs.Actor>empty(),
                Optional.of(new PrivateJobs.Actor("alice",now)),Optional.of(new PrivateJobs.Actor("alice",now.minusSeconds(1))),
                Optional.of(new PrivateJobs.Actor("https://invalid",now.plusSeconds(1))))) {
            actor.set(subject);rejected("AUTHENTICATION_REQUIRED",()->jobs.create(key,request));
            rejected("AUTHENTICATION_REQUIRED",()->jobs.read(key));
        }
        var unavailable=new PrivateJobs(repository,()->{throw new IllegalStateException("private diagnostic");},(o,r)->true,clock);
        rejected("AUTHENTICATION_REQUIRED",()->unavailable.read(key));assertEquals(0,repository.calls);
    }
    @Test void keysAreScopedToOwnersAndConflictingPayloadNeverOverwrites() {
        UUID key=UUID.randomUUID();var request=input("alice");var first=jobs.create(key,request);
        assertEquals(first,jobs.create(key,request));
        rejected("IDEMPOTENCY_CONFLICT",()->jobs.create(key,input("alice")));
        actor.set(Optional.of(new PrivateJobs.Actor("bob",now.plusSeconds(60))));
        rejected("JOB_UNAVAILABLE",()->jobs.read(first.id()));
        rejected("JOB_UNAVAILABLE",()->jobs.cancel(first.id(),0));
        rejected("REFERENCE_UNAVAILABLE",()->jobs.create(UUID.randomUUID(),request));
        var second=jobs.create(key,input("bob"));assertNotEquals(first.id(),second.id());assertEquals(2,repository.rows.size());
    }
    @Test void legalTransitionsAndTerminalImmutability() {
        var queued=create();UUID result=reference("alice");
        rejected("INVALID_TRANSITION",()->jobs.succeed(queued.id(),0,result));
        rejected("INVALID_TRANSITION",()->jobs.fail(queued.id(),0,PrivateTryOnJob.Failure.PROCESSING_FAILED));
        var running=jobs.start(queued.id(),0);assertEquals(1,running.revision());
        rejected("INVALID_TRANSITION",()->jobs.start(running.id(),1));
        rejected("REFERENCE_UNAVAILABLE",()->jobs.succeed(running.id(),1,reference("bob")));
        var succeeded=jobs.succeed(running.id(),1,result);assertEquals(SUCCEEDED,succeeded.state());assertEquals(result,succeeded.resultReference());
        rejected("INVALID_TRANSITION",()->jobs.cancel(succeeded.id(),2));
        rejected("INVALID_TRANSITION",()->jobs.succeed(succeeded.id(),2,result));
        assertEquals(succeeded,jobs.create(succeeded.idempotencyKey(),succeeded.input()));
        var failed=jobs.start(create().id(),0);failed=jobs.fail(failed.id(),1,PrivateTryOnJob.Failure.TIMED_OUT);
        assertEquals(FAILED,failed.state());assertNull(failed.resultReference());assertEquals(PrivateTryOnJob.Failure.TIMED_OUT,failed.failure());
        var cancelled=jobs.cancel(create().id(),0);assertEquals(CANCELLED,cancelled.state());
        rejected("INVALID_TRANSITION",()->jobs.start(cancelled.id(),1));
    }
    @Test void cancellationWinsAgainstLateCompletionUsingAtomicRevisionCheck() {
        var running=jobs.start(create().id(),0);UUID result=reference("alice");
        repository.beforeCas=()->jobs.cancel(running.id(),running.revision());
        rejected("REVISION_CONFLICT",()->jobs.succeed(running.id(),running.revision(),result));
        var finalJob=jobs.read(running.id());assertEquals(CANCELLED,finalJob.state());assertNull(finalJob.resultReference());
        assertEquals(2,finalJob.revision());rejected("REVISION_CONFLICT",()->jobs.cancel(finalJob.id(),1));
    }
    @Test void concurrentSameOwnerCreationHasOneIdempotencyReservation() throws Exception {
        UUID key=UUID.randomUUID();var request=input("alice");var executor=Executors.newFixedThreadPool(4);
        try {
            var tasks=new ArrayList<Callable<UUID>>();for(int i=0;i<16;i++)tasks.add(()->jobs.create(key,request).id());
            var ids=new HashSet<UUID>();for(var future:executor.invokeAll(tasks))ids.add(future.get());
            assertEquals(1,ids.size());assertEquals(1,repository.rows.size());
        } finally {executor.shutdownNow();}
    }
    @Test void inputsAreImmutableOpaqueAndDiagnosticsDoNotExposeReferences() {
        var original=new ArrayList<>(List.of(reference("alice")));var request=new PrivateTryOnJob.Input(reference("alice"),original);
        original.clear();assertEquals(1,request.garmentReferences().size());
        assertThrows(UnsupportedOperationException.class,()->request.garmentReferences().clear());
        assertThrows(IllegalArgumentException.class,()->new PrivateTryOnJob.Input(reference("alice"),List.of()));
        UUID repeated=UUID.randomUUID();assertThrows(IllegalArgumentException.class,()->new PrivateTryOnJob.Input(repeated,List.of(repeated,repeated)));
        var job=jobs.create(UUID.randomUUID(),request);
        assertFalse(job.toString().contains(job.owner()));assertFalse(job.toString().contains(request.personReference().toString()));
        assertFalse(request.toString().contains(request.personReference().toString()));
    }
    @Test void failingReferenceAuthorityFailsClosedBeforeCreatingJob() {
        var service=new PrivateJobs(repository,actor::get,(o,r)->{throw new IllegalStateException("secret storage detail");},clock);
        rejected("REFERENCE_UNAVAILABLE",()->service.create(UUID.randomUUID(),input("alice")));
        assertEquals(0,repository.calls);
    }
    @Test void revocationOrIdentityChangeDuringReferenceChecksPreventsCreation() {
        var request=input("alice");
        for(var changed:List.of(Optional.<PrivateJobs.Actor>empty(),Optional.of(new PrivateJobs.Actor("alice",now)),
                Optional.of(new PrivateJobs.Actor("bob",now.plusSeconds(60))))) {
            actor.set(Optional.of(new PrivateJobs.Actor("alice",now.plusSeconds(60))));
            var service=new PrivateJobs(repository,actor::get,(o,r)->{actor.set(changed);return true;},clock);
            rejected("AUTHENTICATION_REQUIRED",()->service.create(UUID.randomUUID(),request));
        }
        assertTrue(repository.rows.isEmpty());assertEquals(0,repository.calls);
    }
    @Test void authorityChangesDuringRepositoryFindCannotMutateOrReadTheJob() {
        var job=create();repository.afterFind=()->actor.set(Optional.empty());
        rejected("AUTHENTICATION_REQUIRED",()->jobs.start(job.id(),0));assertEquals(job,repository.rows.get(job.id()));
        actor.set(Optional.of(new PrivateJobs.Actor("alice",now.plusSeconds(60))));
        repository.afterFind=()->actor.set(Optional.empty());rejected("AUTHENTICATION_REQUIRED",()->jobs.read(job.id()));
    }
    @Test void transactionGuardsRecheckActorAndReferencesImmediatelyBeforeWrites() {
        var request=input("alice");repository.beforeCreate=()->references.remove(request.personReference());
        rejected("REFERENCE_UNAVAILABLE",()->jobs.create(UUID.randomUUID(),request));assertTrue(repository.rows.isEmpty());
        var job=jobs.start(create().id(),0);UUID result=reference("alice");
        repository.beforeCas=()->references.remove(result);
        rejected("REFERENCE_UNAVAILABLE",()->jobs.succeed(job.id(),job.revision(),result));assertEquals(job,repository.rows.get(job.id()));
        repository.beforeCas=()->actor.set(Optional.empty());
        rejected("AUTHENTICATION_REQUIRED",()->jobs.cancel(job.id(),job.revision()));assertEquals(job,repository.rows.get(job.id()));
    }
    @Test void storageExceptionsNeverExposeDiagnostics() {
        var job=create();repository.broken=true;
        rejected("PERSISTENCE_UNAVAILABLE",()->jobs.read(job.id()));
        rejected("PERSISTENCE_UNAVAILABLE",()->jobs.create(UUID.randomUUID(),input("alice")));
        repository.broken=false;repository.beforeCas=()->{throw new IllegalStateException("private database connection secret");};
        rejected("PERSISTENCE_UNAVAILABLE",()->jobs.start(job.id(),0));assertEquals(job,repository.rows.get(job.id()));
        repository.beforeCas=()->{throw new PrivateJobs.Rejected(null);};
        rejected("PERSISTENCE_UNAVAILABLE",()->jobs.start(job.id(),0));assertEquals(job,repository.rows.get(job.id()));
    }
    @Test void revokedInputsBlockProcessingButNeverBlockOwnerCancellation() {
        var job=create();references.remove(job.input().personReference());
        rejected("REFERENCE_UNAVAILABLE",()->jobs.start(job.id(),0));
        assertEquals(CANCELLED,jobs.cancel(job.id(),0).state());
        var running=jobs.start(create().id(),0);UUID result=reference("alice");
        references.remove(running.input().garmentReferences().get(0));
        rejected("REFERENCE_UNAVAILABLE",()->jobs.succeed(running.id(),1,result));
        assertEquals(CANCELLED,jobs.cancel(running.id(),1).state());
    }
    @Test void exhaustedRevisionsFailWithBoundedDomainErrorWithoutMutation() {
        var job=create();var exhausted=new PrivateTryOnJob(job.id(),job.owner(),job.idempotencyKey(),job.input(),
                RUNNING,Long.MAX_VALUE,job.createdAt(),job.updatedAt(),null,null);
        repository.rows.put(job.id(),exhausted);
        rejected("REVISION_EXHAUSTED",()->jobs.cancel(job.id(),Long.MAX_VALUE));
        assertEquals(exhausted,repository.rows.get(job.id()));
    }
}
