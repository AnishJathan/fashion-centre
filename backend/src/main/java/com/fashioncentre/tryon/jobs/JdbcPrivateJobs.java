package com.fashioncentre.tryon.jobs;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import javax.sql.DataSource;
import static com.fashioncentre.tryon.jobs.PrivateTryOnJob.State.*;
/** Unwired JDBC metadata store. Trusted suppliers identify authenticated server sessions only.
 * Subject, session and private-reference authority is checked under database locks in every transaction.
 * No constructor creates schema, users, sessions, references, credentials or image data. H2 verified only.
 */
public final class JdbcPrivateJobs implements PrivateJobRepository,WorkerJobs  {
    private final DataSource source;
    private final Supplier<Optional<UUID>> ownerSession,workerSession;
    private final Clock clock;
    private final Map<Connection,List<Work<Void>>> beforeCommit=Collections.synchronizedMap(new IdentityHashMap<>());
    private static final long RETENTION=Duration.ofDays(1).toMillis(),LEASE=Duration.ofSeconds(60).toMillis();
    private static final Set<String> SAFE_ERRORS=Set.of("AUTHENTICATION_REQUIRED","REFERENCE_UNAVAILABLE","JOB_UNAVAILABLE","IDEMPOTENCY_CONFLICT","INVALID_JOB","PERSISTENCE_UNAVAILABLE","SCHEMA_UNSUPPORTED");
    public JdbcPrivateJobs(DataSource source,Supplier<Optional<UUID>> trustedOwnerSession,Supplier<Optional<UUID>> trustedWorkerSession,Clock clock) {
        this.source=Objects.requireNonNull(source);
        ownerSession=Objects.requireNonNull(trustedOwnerSession);
        workerSession=Objects.requireNonNull(trustedWorkerSession);
        this.clock=Objects.requireNonNull(clock);
        try(var c=source.getConnection()) {
            schema(c);
        }
        catch(SQLException|RuntimeException e) {
            throw reject("SCHEMA_UNSUPPORTED");
        }
    }
    private static PrivateJobs.Rejected reject(String code) {
        return new PrivateJobs.Rejected(code);
    }
    private static PreparedStatement query(Connection c,String sql)throws SQLException {
        var q=c.prepareStatement(sql);
        q.setQueryTimeout(5);
        return q;
    }
    private static void schema(Connection c)throws SQLException {
        try(var q=query(c,"SELECT singleton,version FROM fc_schema_version");
        var r=q.executeQuery()) {
            if(!r.next()||r.getInt(1)!=1||r.getInt(2)!=2||r.next())throw reject("SCHEMA_UNSUPPORTED");
        }
    }
    private UUID session(boolean worker) {
        try {
            return (worker?workerSession:ownerSession).get().orElseThrow();
        }
        catch(RuntimeException e) {
            throw reject("AUTHENTICATION_REQUIRED");
        }
    }
    private void authorize(Connection c,String owner,boolean worker,UUID expected)throws SQLException {
        if(!expected.equals(session(worker)))throw reject("AUTHENTICATION_REQUIRED");
        String sql=worker?"SELECT active,expires_at FROM fc_private_worker WHERE session_id=? FOR UPDATE":"SELECT active,expires_at FROM fc_private_session WHERE session_id=? AND owner_id=? FOR UPDATE";
        try(var q=query(c,sql)) {
            q.setObject(1,expected);
            if(!worker)q.setString(2,owner);
            try(var r=q.executeQuery()) {
                if(!r.next()||!r.getBoolean(1)||r.getLong(2)<=clock.millis())throw reject("AUTHENTICATION_REQUIRED");
            }
        }
    }
    @FunctionalInterface private interface Work<T> {
        T run(Connection connection)throws SQLException;
    }
    private <T>T tx(String owner,boolean worker,Work<T> work) {
        return tx(owner,worker,true,work);
    }
    private <T>T tx(String owner,boolean worker,boolean requireActive,Work<T> work) {
        if(owner==null||!owner.matches("[A-Za-z0-9_-]{1,128}"))throw reject("AUTHENTICATION_REQUIRED");
        UUID session=session(worker);
        try(var c=source.getConnection()) {
            c.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            c.setAutoCommit(false);
            try {
                schema(c);
                try(var q=query(c,"SELECT active FROM fc_private_subject WHERE owner_id=? FOR UPDATE")) {
                    q.setString(1,owner);
                    try(var r=q.executeQuery()) {
                        if(!r.next()||(requireActive&&!r.getBoolean(1)))throw reject("AUTHENTICATION_REQUIRED");
                    }
                }
                authorize(c,owner,worker,session);
                beforeCommit.put(c,new ArrayList<>());
                T result=work.run(c);
                for(var check:beforeCommit.get(c))check.run(c);
                authorize(c,owner,worker,session);
                c.commit();
                return result;
            }
            catch(SQLException|RuntimeException e) {
                try {
                    c.rollback();
                }
                catch(SQLException ignored) {
                }
                throw e;
            }
            finally {
                beforeCommit.remove(c);
            }
        }
        catch(PrivateJobs.Rejected e) {
            if(SAFE_ERRORS.contains(e.getMessage()==null?"":e.getMessage()))throw e;
            throw reject("PERSISTENCE_UNAVAILABLE");
        }
        catch(SQLException|RuntimeException e) {
            throw reject("PERSISTENCE_UNAVAILABLE");
        }
    }
    private void references(Connection c,String owner,PrivateTryOnJob.Input input,UUID result)throws SQLException {
        var ids=new TreeSet<UUID>();
        ids.add(input.personReference());
        ids.addAll(input.garmentReferences());
        if(result!=null)ids.add(result);
        for(UUID id:ids)reference(c,owner,id);
    }
    private void reference(Connection c,String owner,UUID id)throws SQLException {
        referenceNow(c,owner,id);
        beforeCommit.get(c).add(connection-> {
            referenceNow(connection,owner,id);
            return null;
        }
        );
    }
    private void referenceNow(Connection c,String owner,UUID id)throws SQLException {
        try(var q=query(c,"SELECT active,expires_at FROM fc_private_reference WHERE reference_id=? AND owner_id=? FOR UPDATE")) {
            q.setObject(1,id);
            q.setString(2,owner);
            try(var r=q.executeQuery()) {
                if(!r.next()||!r.getBoolean(1)||r.getLong(2)<=clock.millis())throw reject("REFERENCE_UNAVAILABLE");
            }
        }
    }
    private record Row(PrivateTryOnJob job,boolean deleted,long retainUntil,String phase,String provider,int attempts,long fence,UUID token,Long leaseUntil,long nextAttempt) {
    }
    private static Row row(ResultSet r)throws SQLException {
        String[] refs=r.getString("garment_refs").split(",",-1);
        var input=new PrivateTryOnJob.Input(r.getObject("person_ref",UUID.class),Arrays.stream(refs).map(UUID::fromString).toList());
        String failure=r.getString("failure");
        var job=new PrivateTryOnJob(r.getObject("job_id",UUID.class),r.getString("owner_id"),r.getObject("idempotency_key",UUID.class),input,PrivateTryOnJob.State.valueOf(r.getString("state")),r.getLong("revision"),Instant.ofEpochMilli(r.getLong("created_at")),Instant.ofEpochMilli(r.getLong("updated_at")),r.getObject("result_ref",UUID.class),failure==null?null:PrivateTryOnJob.Failure.valueOf(failure));
        return new Row(job,r.getBoolean("deleted"),r.getLong("retain_until"),r.getString("phase"),r.getString("provider_id"),r.getInt("attempts"),r.getLong("fence"),r.getObject("lease_token",UUID.class),(Long)r.getObject("lease_until"),r.getLong("next_attempt_at"));
    }
    private Row load(Connection c,String owner,UUID id)throws SQLException {
        try(var q=query(c,"SELECT * FROM fc_private_job WHERE owner_id=? AND job_id=? FOR UPDATE")) {
            q.setString(1,owner);
            q.setObject(2,id);
            try(var r=q.executeQuery()) {
                return r.next()?row(r):null;
            }
        }
    }
    private boolean visible(Row row) {
        return row!=null&&!row.deleted()&&row.retainUntil()>clock.millis();
    }
    @Override public PrivateTryOnJob createIfAbsent(PrivateTryOnJob candidate,Runnable guard) {
        if(candidate==null||guard==null||candidate.state()!=QUEUED||candidate.revision()!=0)throw reject("INVALID_JOB");
        return tx(candidate.owner(),false,c-> {
            guard.run();
            references(c,candidate.owner(),candidate.input(),null);
            try(var q=query(c,"SELECT * FROM fc_private_job WHERE owner_id=? AND idempotency_key=? FOR UPDATE")) {
                q.setString(1,candidate.owner());
                q.setObject(2,candidate.idempotencyKey());
                try(var r=q.executeQuery()) {
                    if(r.next()) {
                        Row existing=row(r);
                        if(!visible(existing))throw reject("JOB_UNAVAILABLE");
                        if(!existing.job().input().equals(candidate.input()))throw reject("IDEMPOTENCY_CONFLICT");
                        beforeCommit.get(c).add(connection-> {
                            if(!visible(existing))throw reject("JOB_UNAVAILABLE");
                            return null;
                        });
                        return existing.job();
                    }
                }
            }
            long now=clock.millis();
            if(candidate.createdAt().toEpochMilli()>now||!candidate.createdAt().equals(candidate.updatedAt()))throw reject("INVALID_JOB");
            try(var q=query(c,"INSERT INTO fc_private_job(job_id,owner_id,idempotency_key,person_ref,garment_refs,state,revision,created_at,updated_at,retain_until,next_attempt_at) VALUES(?,?,?,?,?,'QUEUED',0,?,?,?,?)")) {
                q.setObject(1,candidate.id());
                q.setString(2,candidate.owner());
                q.setObject(3,candidate.idempotencyKey());
                q.setObject(4,candidate.input().personReference());
                q.setString(5,String.join(",",candidate.input().garmentReferences().stream().map(UUID::toString).toList()));
                q.setLong(6,candidate.createdAt().toEpochMilli());
                q.setLong(7,candidate.updatedAt().toEpochMilli());
                q.setLong(8,Math.addExact(now,RETENTION));
                q.setLong(9,now);
                q.executeUpdate();
            }
            beforeCommit.get(c).add(connection-> {
                if(clock.millis()>=now+RETENTION)throw reject("JOB_UNAVAILABLE");
                return null;
            }
            );
            return candidate;
        }
        );
    }
    @Override public Optional<PrivateTryOnJob> find(String owner,UUID id) {
        return tx(owner,false,c-> {
            Row row=load(c,owner,id);
            if(!visible(row))return Optional.empty();
            beforeCommit.get(c).add(connection-> {
                if(!visible(row))throw reject("JOB_UNAVAILABLE");
                return null;
            }
            );
            return Optional.of(row.job());
        }
        );
    }
    private static boolean replacement(PrivateTryOnJob old,PrivateTryOnJob next,long revision) {
        if(next==null||old.terminal()||old.revision()!=revision||revision==Long.MAX_VALUE||next.revision()!=revision+1||!old.id().equals(next.id())||!old.owner().equals(next.owner())||!old.idempotencyKey().equals(next.idempotencyKey())||!old.input().equals(next.input())||!old.createdAt().equals(next.createdAt())||next.updatedAt().isBefore(old.updatedAt()))return false;
        return next.state()==CANCELLED||(old.state()==QUEUED&&next.state()==RUNNING)||(old.state()==RUNNING&&(next.state()==SUCCEEDED||next.state()==FAILED));
    }
    private void write(Connection c,PrivateTryOnJob value)throws SQLException {
        try(var q=query(c,"UPDATE fc_private_job SET state=?,revision=?,updated_at=?,result_ref=?,failure=?,lease_token=NULL,lease_until=NULL WHERE owner_id=? AND job_id=?")) {
            q.setString(1,value.state().name());
            q.setLong(2,value.revision());
            q.setLong(3,value.updatedAt().toEpochMilli());
            q.setObject(4,value.resultReference());
            q.setString(5,value.failure()==null?null:value.failure().name());
            q.setString(6,value.owner());
            q.setObject(7,value.id());
            q.executeUpdate();
        }
    }
    @Override public boolean compareAndSet(String owner,UUID id,long revision,PrivateTryOnJob value,Runnable guard) {
        if(guard==null)throw reject("INVALID_JOB");
        return tx(owner,false,c-> {
            Row row=load(c,owner,id);
            if(!visible(row)||!replacement(row.job(),value,revision))return false;
            // Worker-owned jobs can only be cancelled through the owner domain port.
            if(row.fence()>0&&value.state()!=CANCELLED)return false;
            guard.run();
            if(value.state()==RUNNING||value.state()==SUCCEEDED)references(c,owner,value.input(),value.resultReference());
            beforeCommit.get(c).add(connection-> {
                if(!visible(row))throw reject("JOB_UNAVAILABLE");
                return null;
            }
            );
            write(c,value);
            return true;
        }
        );
    }
    public void revokeReference(String owner,UUID reference) {
        tx(owner,false,c-> {
            try(var q=query(c,"SELECT reference_id FROM fc_private_reference WHERE owner_id=? AND reference_id=? FOR UPDATE")) {
                q.setString(1,owner);
                q.setObject(2,reference);
                try(var r=q.executeQuery()) {
                    if(!r.next())throw reject("REFERENCE_UNAVAILABLE");
                }
            }
            queueDelete(c,owner,reference);
            cancelReferenceJobs(c,owner,reference);
            return null;
        }
        );
    }
    private void cancelReferenceJobs(Connection c,String owner,UUID reference)throws SQLException {
        try(var q=query(c,"UPDATE fc_private_job SET state='CANCELLED',revision=CASE WHEN revision<9223372036854775807 THEN revision+1 ELSE revision END,updated_at=CASE WHEN updated_at>? THEN updated_at ELSE ? END,lease_token=NULL,lease_until=NULL WHERE owner_id=? AND state IN ('QUEUED','RUNNING') AND (person_ref=? OR garment_refs LIKE ?)")) {
            long now=clock.millis();
            q.setLong(1,now);
            q.setLong(2,now);
            q.setString(3,owner);
            q.setObject(4,reference);
            q.setString(5,"%"+reference+"%");
            q.executeUpdate();
        }
    }
    private void queueDelete(Connection c,String owner,UUID reference)throws SQLException {
        try(var q=query(c,"UPDATE fc_private_reference SET active=FALSE WHERE owner_id=? AND reference_id=?")) {
            q.setString(1,owner);
            q.setObject(2,reference);
            q.executeUpdate();
        }
        try(var q=query(c,"SELECT reference_id FROM fc_private_delete WHERE reference_id=?")) {
            q.setObject(1,reference);
            try(var r=q.executeQuery()) {
                if(r.next())return;
            }
        }
        try(var q=query(c,"INSERT INTO fc_private_delete(reference_id,owner_id,queued_at) VALUES(?,?,?)")) {
            q.setObject(1,reference);
            q.setString(2,owner);
            q.setLong(3,clock.millis());
            q.executeUpdate();
        }
    }
    private record Candidate(String owner,UUID id) {
    }
    private List<Candidate> candidates(String sql,int limit,long time) {
        if(limit<1||limit>100)throw reject("INVALID_JOB");
        UUID worker=session(true);
        try(var c=source.getConnection()) {
            c.setAutoCommit(false);
            try {
                schema(c);
                authorize(c,"",true,worker);
                List<Candidate> result=new ArrayList<>();
                try(var q=query(c,sql)) {
                    for(int i=1;
                    i<=q.getParameterMetaData().getParameterCount();
                    i++)q.setLong(i,time);
                    q.setMaxRows(limit);
                    try(var r=q.executeQuery()) {
                        while(r.next())result.add(new Candidate(r.getString(1),r.getObject(2,UUID.class)));
                    }
                }
                authorize(c,"",true,worker);
                c.commit();
                return result;
            }
            catch(SQLException|RuntimeException e) {
                try {
                    c.rollback();
                }
                catch(SQLException ignored) {
                }
                throw e;
            }
        }
        catch(PrivateJobs.Rejected e) {
            if(SAFE_ERRORS.contains(e.getMessage()==null?"":e.getMessage()))throw e;
            throw reject("PERSISTENCE_UNAVAILABLE");
        }
        catch(SQLException|RuntimeException e) {
            throw reject("PERSISTENCE_UNAVAILABLE");
        }
    }
    private PrivateTryOnJob changed(PrivateTryOnJob old,PrivateTryOnJob.State state,UUID result,PrivateTryOnJob.Failure failure) {
        return new PrivateTryOnJob(old.id(),old.owner(),old.idempotencyKey(),old.input(),state,Math.addExact(old.revision(),1),old.createdAt(),Instant.ofEpochMilli(Math.max(clock.millis(),old.updatedAt().toEpochMilli())),result,failure);
    }
    @Override public Optional<Lease> claim() {
        for(var candidate:candidates("SELECT j.owner_id,j.job_id FROM fc_private_job j JOIN fc_private_subject s ON j.owner_id=s.owner_id WHERE s.active=TRUE AND j.deleted=FALSE AND j.state IN ('QUEUED','RUNNING') AND j.next_attempt_at<=? AND (j.lease_until IS NULL OR j.lease_until<=?) AND j.retain_until>? ORDER BY j.next_attempt_at,j.job_id",32,clock.millis())) {
            Optional<Lease> result=tx(candidate.owner(),true,c-> {
                Row row=load(c,candidate.owner(),candidate.id());
                long now=clock.millis();
                if(!visible(row)||row.job().terminal()||row.nextAttempt()>now||(row.leaseUntil()!=null&&row.leaseUntil()>now))return Optional.empty();
                if(row.phase().equals("SUBMITTING")||row.attempts()>=3||row.fence()==Long.MAX_VALUE||row.job().revision()==Long.MAX_VALUE) {
                    if(row.job().revision()!=Long.MAX_VALUE)write(c,changed(row.job(),FAILED,null,PrivateTryOnJob.Failure.TIMED_OUT));
                    return Optional.empty();
                }
                try {
                    references(c,row.job().owner(),row.job().input(),null);
                }
                catch(PrivateJobs.Rejected e) {
                    if(!"REFERENCE_UNAVAILABLE".equals(e.getMessage()))throw e;
                    beforeCommit.get(c).clear();
                    write(c,changed(row.job(),FAILED,null,PrivateTryOnJob.Failure.PROCESSING_FAILED));
                    return Optional.empty();
                }
                var job=changed(row.job(),RUNNING,null,null);
                UUID token=UUID.randomUUID();
                long fence=row.fence()+1,until=Math.addExact(now,LEASE);
                int attempt=row.attempts()+1;
                write(c,job);
                beforeCommit.get(c).add(connection-> {
                    if(clock.millis()>=until||clock.millis()>=row.retainUntil())throw reject("JOB_UNAVAILABLE");
                    return null;
                }
                );
                try(var q=query(c,"UPDATE fc_private_job SET lease_token=?,lease_until=?,fence=?,attempts=? WHERE owner_id=? AND job_id=?")) {
                    q.setObject(1,token);
                    q.setLong(2,until);
                    q.setLong(3,fence);
                    q.setInt(4,attempt);
                    q.setString(5,job.owner());
                    q.setObject(6,job.id());
                    q.executeUpdate();
                }
                return Optional.of(new Lease(job,token,fence,Instant.ofEpochMilli(until),attempt,Optional.ofNullable(row.provider())));
            }
            );
            if(result.isPresent())return result;
        }
        return Optional.empty();
    }
    private boolean held(Row row,Lease lease) {
        return visible(row)&&!row.job().terminal()&&row.job().state()==RUNNING&&row.job().id().equals(lease.job().id())&&row.job().owner().equals(lease.job().owner())&&Objects.equals(row.token(),lease.token())&&row.fence()==lease.fence()&&row.leaseUntil()!=null&&row.leaseUntil()>clock.millis();
    }
    @FunctionalInterface private interface LeaseWork {
        boolean run(Connection c,Row row)throws SQLException;
    }
    private boolean lease(Lease lease,LeaseWork work) {
        if(lease==null||lease.job()==null)return false;
        return tx(lease.job().owner(),true,c-> {
            Row row=load(c,lease.job().owner(),lease.job().id());
            if(!held(row,lease))return false;
            references(c,row.job().owner(),row.job().input(),null);
            boolean result=work.run(c,row);
            beforeCommit.get(c).add(connection-> {
                if(!held(row,lease))throw reject("JOB_UNAVAILABLE");
                return null;
            }
            );
            return result;
        }
        );
    }
    @Override public boolean beginSubmission(Lease lease) {
        return lease(lease,(c,row)-> {
            if(!row.phase().equals("READY"))return false;
            try(var q=query(c,"UPDATE fc_private_job SET phase='SUBMITTING' WHERE owner_id=? AND job_id=?")) {
                q.setString(1,row.job().owner());
                q.setObject(2,row.job().id());
                q.executeUpdate();
            }
            return true;
        }
        );
    }
    @Override public boolean markSubmitted(Lease lease,String providerId) {
        if(providerId==null||!providerId.matches("[A-Za-z0-9_-]{1,128}"))throw reject("INVALID_JOB");
        return lease(lease,(c,row)-> {
            if(!row.phase().equals("SUBMITTING"))return false;
            try(var q=query(c,"UPDATE fc_private_job SET phase='SUBMITTED',provider_id=? WHERE owner_id=? AND job_id=?")) {
                q.setString(1,providerId);
                q.setString(2,row.job().owner());
                q.setObject(3,row.job().id());
                q.executeUpdate();
            }
            return true;
        }
        );
    }
    @Override public boolean complete(Lease lease,UUID result) {
        return lease(lease,(c,row)-> {
            if(!row.phase().equals("SUBMITTED")||result==null)return false;
            reference(c,row.job().owner(),result);
            write(c,changed(row.job(),SUCCEEDED,result,null));
            return true;
        }
        );
    }
    @Override public boolean fail(Lease lease,PrivateTryOnJob.Failure failure) {
        if(failure==null)throw reject("INVALID_JOB");
        return lease(lease,(c,row)-> {
            write(c,changed(row.job(),FAILED,null,failure));
            return true;
        }
        );
    }
    @Override public boolean retry(Lease lease,Instant nextAttemptAt) {
        if(nextAttemptAt==null)throw reject("INVALID_JOB");
        return lease(lease,(c,row)-> {
            long next=nextAttemptAt.toEpochMilli(),now=clock.millis();
            if(row.phase().equals("SUBMITTING")||next<=now||next>now+Duration.ofMinutes(5).toMillis())return false;
            if(row.attempts()>=3) {
                write(c,changed(row.job(),FAILED,null,PrivateTryOnJob.Failure.TIMED_OUT));
                return true;
            }
            try(var q=query(c,"UPDATE fc_private_job SET next_attempt_at=?,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE owner_id=? AND job_id=?")) {
                q.setLong(1,next);
                q.setLong(2,Math.max(now,row.job().updatedAt().toEpochMilli()));
                q.setString(3,row.job().owner());
                q.setObject(4,row.job().id());
                q.executeUpdate();
            }
            return true;
        }
        );
    }
    @Override public int expire(int limit) {
        int count=0;
        for(var candidate:candidates("SELECT owner_id,job_id FROM fc_private_job WHERE deleted=FALSE AND retain_until<=? ORDER BY retain_until,job_id",limit,clock.millis())) {
            if(tx(candidate.owner(),true,false,c-> {
                Row row=load(c,candidate.owner(),candidate.id());
                if(row==null||row.deleted()||row.retainUntil()>clock.millis())return false;
                var refs=new TreeSet<UUID>();
                refs.add(row.job().input().personReference());
                refs.addAll(row.job().input().garmentReferences());
                if(row.job().resultReference()!=null)refs.add(row.job().resultReference());
                for(UUID ref:refs)if(!usedByLiveJob(c,row.job().owner(),ref))queueDelete(c,row.job().owner(),ref);
                try(var q=query(c,"UPDATE fc_private_job SET deleted=TRUE,lease_token=NULL,lease_until=NULL WHERE owner_id=? AND job_id=?")) {
                    q.setString(1,candidate.owner());
                    q.setObject(2,candidate.id());
                    q.executeUpdate();
                }
                return true;
            }
            ))count++;
        }
        // Reference TTL independently collects orphan results and expires authority even if a job reused it.
        for(var candidate:candidates("SELECT owner_id,reference_id FROM fc_private_reference WHERE active=TRUE AND expires_at<=? ORDER BY expires_at,reference_id",limit,clock.millis()))tx(candidate.owner(),true,false,c-> {
            queueDelete(c,candidate.owner(),candidate.id());
            cancelReferenceJobs(c,candidate.owner(),candidate.id());
            return null;
        }
        );
        return count;
    }
    private boolean usedByLiveJob(Connection c,String owner,UUID ref)throws SQLException {
        try(var q=query(c,"SELECT job_id FROM fc_private_job WHERE owner_id=? AND deleted=FALSE AND retain_until>? AND (person_ref=? OR result_ref=? OR garment_refs LIKE ?)")) {
            q.setString(1,owner);
            q.setLong(2,clock.millis());
            q.setObject(3,ref);
            q.setObject(4,ref);
            q.setString(5,"%"+ref+"%");
            try(var r=q.executeQuery()) {
                return r.next();
            }
        }
    }
    @Override public List<UUID> pendingDeletes(int limit) {
        return candidates("SELECT owner_id,reference_id FROM fc_private_delete WHERE queued_at<=? ORDER BY queued_at,reference_id",limit,clock.millis()).stream().map(Candidate::id).toList();
    }
    @Override public boolean authorizeDelete(UUID reference) {
        if(reference==null)return false;
        for(var candidate:candidates("SELECT owner_id,reference_id FROM fc_private_delete WHERE queued_at<=? ORDER BY queued_at,reference_id",100,clock.millis()))if(candidate.id().equals(reference))return tx(candidate.owner(),true,false,c-> {
            try(var q=query(c,"SELECT d.reference_id FROM fc_private_delete d JOIN fc_private_reference r ON d.reference_id=r.reference_id AND d.owner_id=r.owner_id WHERE d.reference_id=? AND d.owner_id=? AND r.active=FALSE")) {
                q.setObject(1,reference);
                q.setString(2,candidate.owner());
                try(var rows=q.executeQuery()) {
                    return rows.next();
                }
            }
        }
        );
        return false;
    }
    @Override public boolean ackDelete(UUID reference) {
        if(reference==null)return false;
        List<Candidate> rows=candidates("SELECT owner_id,reference_id FROM fc_private_delete WHERE queued_at<=? ORDER BY queued_at,reference_id",100,clock.millis());
        for(var candidate:rows)if(candidate.id().equals(reference))return tx(candidate.owner(),true,false,c-> {
            try(var q=query(c,"DELETE FROM fc_private_delete WHERE reference_id=? AND owner_id=?")) {
                q.setObject(1,reference);
                q.setString(2,candidate.owner());
                return q.executeUpdate()==1;
            }
        }
        );
        return false;
    }
}
