package com.fashioncentre.tryon.jobs;
import org.h2.jdbcx.JdbcDataSource;
import org.h2.tools.RunScript;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.State.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Supplier;
import java.lang.reflect.*;
import java.util.logging.Logger;
import javax.sql.DataSource;
import com.fashioncentre.merchant.*;
import javax.crypto.spec.SecretKeySpec;
class JdbcPrivateJobsTest  {
    @TempDir Path temp;
    final Time time=new Time();
    final UUID session=UUID.randomUUID(),bobSession=UUID.randomUUID(),worker=UUID.randomUUID(),person=UUID.randomUUID(),garment=UUID.randomUUID(),result=UUID.randomUUID();
    JdbcDataSource source;
    JdbcPrivateJobs repo;
    static class Time extends Clock {
        Instant now=Instant.parse("2026-10-18T10:00:00Z");
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }
        public Clock withZone(ZoneId zone) {
            return this;
        }
        public Instant instant() {
            return now;
        }
        void advance(long seconds) {
            now=now.plusSeconds(seconds);
        }
    }
    JdbcDataSource source() {
        var s=new JdbcDataSource();
        s.setURL("jdbc:h2:file:"+temp.resolve("private").toString().replace('\\','/')+";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0;LOCK_TIMEOUT=5000");
        return s;
    }
    void migration(String name)throws Exception {
        try(var c=source.getConnection();
        var reader=new InputStreamReader(Objects.requireNonNull(getClass().getResourceAsStream("/db/migration/"+name)),StandardCharsets.UTF_8)) {
            RunScript.execute(c,reader);
        }
    }
    void sql(String statement,Object...args)throws Exception {
        try(var c=source.getConnection();
        var q=c.prepareStatement(statement)) {
            for(int i=0;
            i<args.length;
            i++)q.setObject(i+1,args[i]);
            q.executeUpdate();
        }
    }
    void ref(UUID ref,String owner,long lifetime)throws Exception {
        sql("INSERT INTO fc_private_reference VALUES(?,?,?,TRUE)",ref,owner,time.millis()+lifetime*1000);
    }
    JdbcPrivateJobs repository(DataSource s,UUID ownerSession) {
        return new JdbcPrivateJobs(s,()->Optional.of(ownerSession),()->Optional.of(worker),time);
    }
    @BeforeEach void setup()throws Exception {
        source=source();
        migration("V1__merchant_connections.sql");
        migration("V2__private_jobs.sql");
        sql("INSERT INTO fc_private_subject VALUES('alice',TRUE),('bob',TRUE)");
        sql("INSERT INTO fc_private_session VALUES(?,'alice',?,TRUE),(?,'bob',?,TRUE)",session,time.millis()+864000000,bobSession,time.millis()+864000000);
        sql("INSERT INTO fc_private_worker VALUES(?,?,TRUE)",worker,time.millis()+864000000);
        ref(person,"alice",604800);
        ref(garment,"alice",604800);
        ref(result,"alice",604800);
        repo=repository(source,session);
    }
    PrivateTryOnJob candidate(UUID key) {
        return new PrivateTryOnJob(UUID.randomUUID(),"alice",key,new PrivateTryOnJob.Input(person,List.of(garment)),QUEUED,0,time.instant(),time.instant(),null,null);
    }
    PrivateTryOnJob create() {
        return repo.createIfAbsent(candidate(UUID.randomUUID()),()-> {
        }
        );
    }
    PrivateTryOnJob next(PrivateTryOnJob old,PrivateTryOnJob.State state,UUID result) {
        return new PrivateTryOnJob(old.id(),old.owner(),old.idempotencyKey(),old.input(),state,old.revision()+1,old.createdAt(),time.instant(),result,null);
    }
    @Test void fileRestartKeepsTenantScopedIdempotencyAndCas()throws Exception {
        var first=create();
        var reopened=repository(source(),session);
        assertEquals(first,reopened.find("alice",first.id()).orElseThrow());
        assertEquals(first,reopened.createIfAbsent(candidate(first.idempotencyKey()),()-> {
        }
        ));
        assertThrows(PrivateJobs.Rejected.class,()->repository(source,bobSession).find("alice",first.id()));
        assertThrows(PrivateJobs.Rejected.class,()->repo.find("bob",first.id()));
        assertTrue(reopened.compareAndSet("alice",first.id(),0,next(first,RUNNING,null),()-> {
        }
        ));
        assertFalse(reopened.compareAndSet("alice",first.id(),0,next(first,RUNNING,null),()-> {
        }
        ));
    }
    @Test void idempotentReturnRechecksRetentionImmediatelyBeforeCommit() {
        var first=create();
        var queries=new AtomicInteger();
        var delayed=repository(new HookSource(source,()-> {
            if(queries.incrementAndGet()==3)time.advance(86400);
        },"SELECT active,expires_at FROM fc_private_reference"),session);
        var rejected=assertThrows(PrivateJobs.Rejected.class,()->delayed.createIfAbsent(candidate(first.idempotencyKey()),()-> {}));
        assertEquals("JOB_UNAVAILABLE",rejected.getMessage());
        assertTrue(repository(source(),session).find("alice",first.id()).isEmpty());
    }
    @Test void concurrentIdempotencyReservationReturnsOneJob()throws Exception {
        UUID key=UUID.randomUUID();
        var pool=Executors.newFixedThreadPool(2);
        var start=new CountDownLatch(1);
        try {
            var a=pool.submit(()-> {
                start.await();
                return repo.createIfAbsent(candidate(key),()-> {
                }
                );
            }
            );
            var b=pool.submit(()-> {
                start.await();
                return repository(source(),session).createIfAbsent(candidate(key),()-> {
                }
                );
            }
            );
            start.countDown();
            assertEquals(a.get(15,TimeUnit.SECONDS).id(),b.get(15,TimeUnit.SECONDS).id());
        }
        finally {
            pool.shutdownNow();
        }
    }
    @Test void concurrentWorkersClaimOnceAndStaleFenceCannotSubmit()throws Exception {
        create();
        UUID secondWorker=UUID.randomUUID();
        sql("INSERT INTO fc_private_worker VALUES(?,?,TRUE)",secondWorker,time.millis()+864000000);
        var other=new JdbcPrivateJobs(source(),()->Optional.of(session),()->Optional.of(secondWorker),time);
        var pool=Executors.newFixedThreadPool(2);
        var gate=new CountDownLatch(1);
        try {
            var a=pool.submit(()-> {
                gate.await();
                return repo.claim();
            }
            );
            var b=pool.submit(()-> {
                gate.await();
                return other.claim();
            }
            );
            gate.countDown();
            var one=a.get(15,TimeUnit.SECONDS);
            var two=b.get(15,TimeUnit.SECONDS);
            assertNotEquals(one.isPresent(),two.isPresent());
            var lease=one.orElseGet(two::orElseThrow);
            time.advance(61);
            var recovered=other.claim().orElseThrow();
            assertTrue(recovered.fence()>lease.fence());
            assertNotEquals(lease.token(),recovered.token());
            assertFalse(repo.beginSubmission(lease));
            assertTrue(other.beginSubmission(recovered));
        }
        finally {
            pool.shutdownNow();
        }
    }
    @Test void ambiguousSubmissionNeverAutomaticallyResubmits()throws Exception {
        var job=create();
        var lease=repo.claim().orElseThrow();
        assertTrue(repo.beginSubmission(lease));
        time.advance(61);
        assertTrue(repository(source(),session).claim().isEmpty());
        assertEquals(FAILED,repo.find("alice",job.id()).orElseThrow().state());
        assertFalse(repo.markSubmitted(lease,"late_receipt"));
    }
    @Test void knownProviderReceiptSurvivesRestartAndOwnerCannotBypassWorkerFence()throws Exception {
        create();
        var lease=repo.claim().orElseThrow();
        assertTrue(repo.beginSubmission(lease));
        assertTrue(repo.markSubmitted(lease,"opaque_provider_id"));
        assertTrue(repo.retry(lease,time.instant().plusSeconds(2)));
        var snapshot=repo.find("alice",lease.job().id()).orElseThrow();
        assertFalse(repo.compareAndSet("alice",snapshot.id(),snapshot.revision(),next(snapshot,SUCCEEDED,result),()-> {
        }
        ));
        time.advance(2);
        var recovered=repository(source(),session).claim().orElseThrow();
        assertEquals(Optional.of("opaque_provider_id"),recovered.providerJobId());
        assertFalse(repo.beginSubmission(recovered));
        assertTrue(repo.complete(recovered,result));
        assertEquals(SUCCEEDED,repo.find("alice",snapshot.id()).orElseThrow().state());
    }
    @Test void cancellationCommitsBeforeLateCompletionAndCannotBeOverwritten()throws Exception {
        create();
        var lease=repo.claim().orElseThrow();
        repo.beginSubmission(lease);
        repo.markSubmitted(lease,"prediction");
        var current=repo.find("alice",lease.job().id()).orElseThrow();
        assertTrue(repo.compareAndSet("alice",current.id(),current.revision(),next(current,CANCELLED,null),()-> {
        }
        ));
        assertFalse(repo.complete(lease,result));
        assertEquals(CANCELLED,repository(source(),session).find("alice",current.id()).orElseThrow().state());
    }
    @Test void retriesAreBoundedAndBackoffEnforced()throws Exception {
        var job=create();
        for(int attempt=1;
        attempt<=3;
        attempt++) {
            var lease=repo.claim().orElseThrow();
            assertEquals(attempt,lease.attempt());
            assertTrue(repo.retry(lease,time.instant().plusSeconds(2)));
            assertTrue(repo.claim().isEmpty());
            time.advance(2);
        }
        assertEquals(FAILED,repo.find("alice",job.id()).orElseThrow().state());
    }
    @Test void authorityExpiryAndForeignRefsDenyCreateEvenWithNoOpJavaGuard()throws Exception {
        var foreign=UUID.randomUUID();
        ref(foreign,"bob",100);
        var invalid=new PrivateTryOnJob(UUID.randomUUID(),"alice",UUID.randomUUID(),new PrivateTryOnJob.Input(foreign,List.of(garment)),QUEUED,0,time.instant(),time.instant(),null,null);
        assertThrows(PrivateJobs.Rejected.class,()->repo.createIfAbsent(invalid,()-> {
        }
        ));
        sql("UPDATE fc_private_session SET active=FALSE WHERE session_id=?",session);
        assertThrows(PrivateJobs.Rejected.class,()->create());
        sql("UPDATE fc_private_worker SET active=FALSE WHERE session_id=?",worker);
        assertThrows(PrivateJobs.Rejected.class,()->repo.claim());
    }
    @Test void revokedHeadCannotStarveHealthyJobAndExpiredRefsCanBeDeleted()throws Exception {
        var bad=create();
        sql("UPDATE fc_private_reference SET expires_at=? WHERE reference_id=?",time.millis()-1,person);
        time.advance(1); // Ensure the invalid head is older; UUID ordering must not decide the test.
        UUID healthyPerson=UUID.randomUUID();
        ref(healthyPerson,"alice",1000);
        var input=new PrivateTryOnJob.Input(healthyPerson,List.of(garment));
        var good=new PrivateTryOnJob(UUID.randomUUID(),"alice",UUID.randomUUID(),input,QUEUED,0,time.instant(),time.instant(),null,null);
        repo.createIfAbsent(good,()-> {
        }
        );
        assertEquals(good.id(),repo.claim().orElseThrow().job().id());
        assertEquals(FAILED,repo.find("alice",bad.id()).orElseThrow().state());
        repo.revokeReference("alice",person);
        repo.revokeReference("alice",person);
        assertTrue(repo.pendingDeletes(20).contains(person));
        assertTrue(repo.authorizeDelete(person));
        assertTrue(repo.ackDelete(person));
        assertFalse(repo.authorizeDelete(person));
    }
    @Test void thirtyTwoLiveLeasesDoNotStarveNextQueuedJob()throws Exception {
        Set<UUID> leased=new HashSet<>();
        for(int i=0;
        i<32;
        i++) {
            create();
            leased.add(repo.claim().orElseThrow().job().id());
        }
        var last=create();
        assertEquals(last.id(),repo.claim().orElseThrow().job().id());
        assertFalse(leased.contains(last.id()));
    }
    @Test void retentionKeepsSharedLiveReferencesAndIdempotencyTombstones()throws Exception {
        var old=create();
        time.advance(3600);
        var newer=create();
        time.advance(82800);
        assertEquals(1,repo.expire(20));
        assertTrue(repo.find("alice",old.id()).isEmpty());
        assertTrue(repo.find("alice",newer.id()).isPresent());
        assertFalse(repo.pendingDeletes(20).contains(person));
        assertThrows(PrivateJobs.Rejected.class,()->repo.createIfAbsent(candidate(old.idempotencyKey()),()-> {
        }
        ));
        time.advance(3600);
        assertEquals(1,repo.expire(20));
        assertTrue(repo.pendingDeletes(20).containsAll(List.of(person,garment)));
        assertTrue(repo.find("alice",newer.id()).isEmpty());
    }
    @Test void expiredOrphanResultIsQueuedForPrivateDeletion()throws Exception {
        UUID orphan=UUID.randomUUID();
        ref(orphan,"alice",1);
        time.advance(2);
        repo.expire(20);
        assertTrue(repo.pendingDeletes(20).contains(orphan));
        assertTrue(repo.authorizeDelete(orphan));
        sql("UPDATE fc_private_worker SET active=FALSE WHERE session_id=?",worker);
        assertThrows(PrivateJobs.Rejected.class,()->repo.authorizeDelete(orphan));
    }
    @Test void v2PreservesMerchantRepositoryAndUnsupportedVersionsFailClosed()throws Exception {
        sql("INSERT INTO fc_brand_membership VALUES('brand','alice',TRUE)");
        var merchant=new JdbcConnections(source,()->Optional.of(new JdbcConnections.Actor("alice",time.instant().plusSeconds(60))),time);
        new EncryptedConnections(new SecretKeySpec(new byte[32],"AES"),merchant).save("alice","brand","brand.myshopify.com",new ShopifyOAuth.Grant("synthetic-token",Set.of("read_products")));
        assertTrue(merchant.read("brand").isPresent());
        sql("UPDATE fc_schema_version SET version=3");
        assertThrows(PrivateJobs.Rejected.class,()->repository(source,session));
        assertThrows(ShopifyOAuth.Rejected.class,()->merchant.read("brand"));
    }
    @Test void referenceExpiryAfterInsertBeforeCommitRollsBack()throws Exception {
        var wrapped=new HookSource(source,()->time.advance(604801),"INSERT INTO fc_private_job");
        var guarded=repository(wrapped,session);
        var candidate=candidate(UUID.randomUUID());
        assertThrows(PrivateJobs.Rejected.class,()->guarded.createIfAbsent(candidate,()-> {
        }
        ));
        try(var c=source.getConnection();
        var q=c.createStatement();
        var r=q.executeQuery("SELECT COUNT(*) FROM fc_private_job")) {
            r.next();
            assertEquals(0,r.getInt(1));
        }
    }
    @Test void actualWorkerRestartsFromDurableReceiptAndDeletionOutagePreservesQueue()throws Exception {
        var job=create();
        var submits=new AtomicInteger();
        var polls=new AtomicInteger();
        RecoverableProvider provider=new RecoverableProvider() {
            public String submit(PrivateTryOnJob j) {
                submits.incrementAndGet();
                return "durable_receipt";
            }
            public Poll poll(PrivateTryOnJob j,String receipt) {
                assertEquals("durable_receipt",receipt);
                polls.incrementAndGet();
                return new Poll(Status.SUCCEEDED,result);
            }
        }
        ;
        var first=new PrivateJobWorker(repo,provider,ref-> {
        }
        ,time);
        assertEquals(PrivateJobWorker.Outcome.SUBMITTED,first.runOne());
        time.advance(2);
        var restartedRepository=repository(source(),session);
        var restarted=new PrivateJobWorker(restartedRepository,provider,ref-> {
            throw new IllegalStateException("synthetic storage outage");
        }
        ,time);
        assertEquals(PrivateJobWorker.Outcome.SUCCEEDED,restarted.runOne());
        assertEquals(1,submits.get());
        assertEquals(1,polls.get());
        assertEquals(SUCCEEDED,restartedRepository.find("alice",job.id()).orElseThrow().state());
        time.advance(86400);
        assertTrue(restarted.cleanUp(20).remainingFailures()>0);
        assertEquals(3,repository(source(),session).pendingDeletes(20).size());
        Set<UUID> deleted=new HashSet<>();
        var healthy=new PrivateJobWorker(repository(source(),session),provider,deleted::add,time);
        assertEquals(3,healthy.cleanUp(20).acknowledged());
        assertEquals(Set.of(person,garment,result),deleted);
        assertTrue(repository(source(),session).pendingDeletes(20).isEmpty());
    }
    @Test void actualWorkerDoesNotResubmitAmbiguousCrashAfterIntent()throws Exception {
        var job=create();
        var lease=repo.claim().orElseThrow();
        assertTrue(repo.beginSubmission(lease));
        time.advance(61);
        var calls=new AtomicInteger();
        RecoverableProvider provider=new RecoverableProvider() {
            public String submit(PrivateTryOnJob j) {
                calls.incrementAndGet();
                return "duplicate";
            }
            public Poll poll(PrivateTryOnJob j,String receipt) {
                calls.incrementAndGet();
                return new Poll(Status.PENDING,null);
            }
        }
        ;
        assertEquals(PrivateJobWorker.Outcome.IDLE,new PrivateJobWorker(repository(source(),session),provider,ref-> {
        }
        ,time).runOne());
        assertEquals(0,calls.get());
        assertEquals(FAILED,repo.find("alice",job.id()).orElseThrow().state());
    }
    @Test void actualWorkerPollLosesToConcurrentOwnerCancellation()throws Exception {
        var job=create();
        var entered=new CountDownLatch(1);
        var release=new CountDownLatch(1);
        RecoverableProvider provider=new RecoverableProvider() {
            public String submit(PrivateTryOnJob j) {
                return "receipt";
            }
            public Poll poll(PrivateTryOnJob j,String receipt) {
                entered.countDown();
                try {
                    if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("barrier expired");
                }
                catch(InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                }
                return new Poll(Status.SUCCEEDED,result);
            }
        }
        ;
        var workerObject=new PrivateJobWorker(repo,provider,ref-> {
        }
        ,time);
        assertEquals(PrivateJobWorker.Outcome.SUBMITTED,workerObject.runOne());
        time.advance(2);
        var pool=Executors.newSingleThreadExecutor();
        try {
            var work=pool.submit(workerObject::runOne);
            assertTrue(entered.await(5,TimeUnit.SECONDS));
            var current=repo.find("alice",job.id()).orElseThrow();
            assertTrue(repo.compareAndSet("alice",job.id(),current.revision(),next(current,CANCELLED,null),()-> {
            }
            ));
            release.countDown();
            assertEquals(PrivateJobWorker.Outcome.STALE,work.get(10,TimeUnit.SECONDS));
            assertEquals(CANCELLED,repository(source(),session).find("alice",job.id()).orElseThrow().state());
            sql("UPDATE fc_private_reference SET expires_at=? WHERE reference_id=?",time.millis()+1000,result);
            time.advance(2);
            repo.expire(20);
            assertTrue(repo.pendingDeletes(20).contains(result));
        }
        finally {
            release.countDown();
            pool.shutdownNow();
        }
    }
    @Test void clockRollbackCannotCorruptRetryOrReferenceCancellationTimestamps() {
        var job=create();
        var lease=repo.claim().orElseThrow();
        time.advance(-1);
        assertTrue(repo.retry(lease,time.instant().plusSeconds(2)));
        var retried=repository(source(),session).find("alice",job.id()).orElseThrow();
        assertEquals(job.createdAt(),retried.updatedAt());
        repo.revokeReference("alice",person);
        var cancelled=repository(source(),session).find("alice",job.id()).orElseThrow();
        assertEquals(CANCELLED,cancelled.state());
        assertEquals(job.createdAt(),cancelled.updatedAt());
    }
    @Test void identicalIdempotencyKeyIsIndependentAcrossOwners()throws Exception {
        UUID key=UUID.randomUUID(),bobPerson=UUID.randomUUID(),bobGarment=UUID.randomUUID();
        ref(bobPerson,"bob",1000);
        ref(bobGarment,"bob",1000);
        var alice=repo.createIfAbsent(candidate(key),()-> {
        }
        );
        var input=new PrivateTryOnJob.Input(bobPerson,List.of(bobGarment));
        var bobCandidate=new PrivateTryOnJob(UUID.randomUUID(),"bob",key,input,QUEUED,0,time.instant(),time.instant(),null,null);
        var bobRepository=repository(source,bobSession);
        var bob=bobRepository.createIfAbsent(bobCandidate,()-> {
        }
        );
        assertNotEquals(alice.id(),bob.id());
        assertEquals(bob,bobRepository.find("bob",bob.id()).orElseThrow());
        assertTrue(bobRepository.find("bob",alice.id()).isEmpty());
    }
    @Test void leaseExpiringAfterReceiptWriteBeforeCommitRollsBackReceipt()throws Exception {
        create();
        var lease=repo.claim().orElseThrow();
        repo.beginSubmission(lease);
        var wrapped=new HookSource(source,()->time.advance(61),"UPDATE fc_private_job SET phase='SUBMITTED'");
        assertThrows(PrivateJobs.Rejected.class,()->repository(wrapped,session).markSubmitted(lease,"late_receipt"));
        assertTrue(repo.claim().isEmpty());
        assertEquals(FAILED,repo.find("alice",lease.job().id()).orElseThrow().state());
    }
    @Test void abruptJvmHaltAfterSyntheticProviderAcceptanceNeverResubmits()throws Exception {
        var job=create();
        String java=Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").toLowerCase(Locale.ROOT).startsWith("windows")?"java.exe":"java").toString();
        var process=new ProcessBuilder(java,"-cp",System.getProperty("java.class.path"),CrashSubmitter.class.getName(),source.getURL(),session.toString(),worker.toString(),time.instant().toString()).redirectErrorStream(true).start();
        try {
            assertTrue(process.waitFor(20,TimeUnit.SECONDS));
            String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
            assertEquals(0,process.exitValue(),output);
            assertTrue(output.contains("SYNTHETIC_ACCEPTED_ONCE"),output);
        }
        finally {
            if(process.isAlive())process.destroyForcibly();
        }
        time.advance(61);
        var calls=new AtomicInteger();
        RecoverableProvider provider=new RecoverableProvider() {
            public String submit(PrivateTryOnJob j) {
                calls.incrementAndGet();
                return "duplicate";
            }
            public Poll poll(PrivateTryOnJob j,String receipt) {
                calls.incrementAndGet();
                return new Poll(Status.PENDING,null);
            }
        }
        ;
        assertEquals(PrivateJobWorker.Outcome.IDLE,new PrivateJobWorker(repository(source(),session),provider,ref-> {
        }
        ,time).runOne());
        assertEquals(0,calls.get());
        assertEquals(FAILED,repo.find("alice",job.id()).orElseThrow().state());
    }
    @Test void finalReadyClaimCannotSpendWithoutPollingBudget() throws Exception {
        var job=create();
        repo.claim().orElseThrow();
        time.advance(61);
        repo.claim().orElseThrow();
        time.advance(61);
        var submits=new AtomicInteger();
        RecoverableProvider provider=new RecoverableProvider() {
            public String submit(PrivateTryOnJob snapshot) {
                submits.incrementAndGet();
                return "must_not_submit";
            }
            public Poll poll(PrivateTryOnJob snapshot,String receipt) {
                fail("No receipt exists to poll");
                return null;
            }
        };
        assertEquals(PrivateJobWorker.Outcome.FAILED,new PrivateJobWorker(repository(source(),session),provider,ref->{},time).runOne());
        assertEquals(0,submits.get());
        assertEquals(FAILED,repo.find("alice",job.id()).orElseThrow().state());
    }
    public static class CrashSubmitter {
        public static void main(String[] args)throws Exception {
            var source=new JdbcDataSource();
            source.setURL(args[0]);
            Connection keeper=source.getConnection();
            var repo=new JdbcPrivateJobs(source,()->Optional.of(UUID.fromString(args[1])),()->Optional.of(UUID.fromString(args[2])),Clock.fixed(Instant.parse(args[3]),ZoneOffset.UTC));
            var lease=repo.claim().orElseThrow();
            if(!repo.beginSubmission(lease))throw new IllegalStateException("Intent missing");
            RecoverableProvider synthetic=new RecoverableProvider() {
                public String submit(PrivateTryOnJob j) {
                    System.out.println("SYNTHETIC_ACCEPTED_ONCE");
                    return "synthetic_receipt";
                }
                public Poll poll(PrivateTryOnJob j,String receipt) {
                    throw new UnsupportedOperationException();
                }
            }
            ;
            synthetic.submit(lease.job());
            if(keeper.isClosed())throw new IllegalStateException();
            System.out.flush();
            Runtime.getRuntime().halt(0);
        }
    }
    static final class HookSource implements DataSource {
        final DataSource source;
        final Runnable hook;
        final String prefix;
        HookSource(DataSource s,Runnable h,String p) {
            source=s;
            hook=h;
            prefix=p;
        }
        Connection wrap(Connection c) {
            return (Connection)Proxy.newProxyInstance(Connection.class.getClassLoader(),new Class<?>[] {
                Connection.class
            }
            ,(p,m,a)-> {
                try {
                    Object value=m.invoke(c,a);
                    if(m.getName().equals("prepareStatement")&&((String)a[0]).startsWith(prefix)) {
                        var statement=(PreparedStatement)value;
                        return Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(),new Class<?>[] {
                            PreparedStatement.class
                        }
                        ,(p2,m2,a2)-> {
                            try {
                                Object v=m2.invoke(statement,a2);
                                if(m2.getName().equals("executeUpdate")||m2.getName().equals("executeQuery"))hook.run();
                                return v;
                            }
                            catch(InvocationTargetException e) {
                                throw e.getCause();
                            }
                        }
                        );
                    }
                    return value;
                }
                catch(InvocationTargetException e) {
                    throw e.getCause();
                }
            }
            );
        }
        public Connection getConnection()throws SQLException {
            return wrap(source.getConnection());
        }
        public Connection getConnection(String u,String p)throws SQLException {
            return wrap(source.getConnection(u,p));
        }
        public PrintWriter getLogWriter()throws SQLException {
            return source.getLogWriter();
        }
        public void setLogWriter(PrintWriter w)throws SQLException {
            source.setLogWriter(w);
        }
        public void setLoginTimeout(int t)throws SQLException {
            source.setLoginTimeout(t);
        }
        public int getLoginTimeout()throws SQLException {
            return source.getLoginTimeout();
        }
        public Logger getParentLogger()throws SQLFeatureNotSupportedException {
            return source.getParentLogger();
        }
        public <T>T unwrap(Class<T> c)throws SQLException {
            return source.unwrap(c);
        }
        public boolean isWrapperFor(Class<?> c)throws SQLException {
            return source.isWrapperFor(c);
        }
    }
}
