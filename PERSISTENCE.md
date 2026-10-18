# Transactional storage foundations

These increments add concrete JDBC repositories for encrypted Shopify connections and private try-on job metadata, plus worker/provider/storage coordination. They are deliberately unwired: no repository/worker Spring bean, runtime datasource, migration-on-startup, login, database console or production encryption key is created. The merchant controller remains disconnected and generation remains disabled.

## Connection storage

`backend/src/main/java/com/fashioncentre/merchant/JdbcConnections.java` implements `EncryptedConnections.Repository` using the standard Java `DataSource`/JDBC interfaces. It requires a server-provided trusted authentication supplier and clock. Missing, expired, malformed or changed subjects fail closed. Request-body owner IDs and browser headers are not authentication.

All save, encrypted-read and local membership-revocation operations:

1. Validate the current trusted subject and supported schema version.
2. Begin a database transaction and lock the brand membership row with `SELECT ... FOR UPDATE`.
3. Check active membership and subject identity after acquiring the lock.
4. Execute prepared SQL with owner/brand predicates; check authentication again before commit.
5. Commit before returning, or roll back on failure.

Database constraints enforce one connection per brand, globally unique shop binding, matching brand/owner membership, and bounded ciphertext/nonce fields. A conflicting installation cannot overwrite an existing connection, including a retry after an ambiguous commit acknowledgement. All SQL failures are mapped to bounded application errors without raw SQL/credential diagnostics.

`EncryptedConnections` encrypts the token using AES-GCM before repository access. Its versioned authenticated metadata includes owner, brand, shop and granted scopes. The repository returns ciphertext only. Owner/brand/shop/scope metadata are not encrypted by this layer. No runtime decryption service or key rotation is implemented; tests decrypt only synthetic tokens using test-only keys.

`revokeMembership` atomically deletes the local connection and disables that membership. It does not call Shopify to revoke a remote token, grant membership, transfer a brand or reactivate an account. Logical row deletion is not secure erasure of old database pages/backups; a real deployment still needs retention, backup and key-lifecycle policies.

## Explicit schema and deployment contract

The one-time bootstrap migration is `backend/src/main/resources/db/migration/V1__merchant_connections.sql`. It creates membership, connection and schema-version tables, then writes version 1 only after all DDL succeeds. `V2__private_jobs.sql` adds private-job metadata after V1 and advances the marker to 2. The merchant repository accepts versions 1 and 2; the private-job repository requires 2. Applying either requires a separately authorized administrative migration process. Constructors validate the marker and never create, repair, drop or provision anything.

H2 is the only tested SQL dialect. H2 DDL commits implicitly, so migrations must be serialized externally and an interrupted bootstrap inspected before recovery. Repeated migration fails without dropping existing records. Missing/partial/unsupported schema is rejected. These are explicit ordered SQL migrations, not a general migration runner.

H2 2.5.252 is a test-scope Maven dependency (approximately 2.7 MB); it is not packaged in the runnable app. Tests use temporary file databases with `WRITE_DELAY=0`, `DB_CLOSE_ON_EXIT=FALSE` and a bounded lock timeout. No database file or persistent credential is installed/configured for the app. Production datasource credentials, connection pooling, TLS, access control, synchronous commit policy and migration operations remain deployment work. A different database requires ported migration SQL and rerunning the transaction/concurrency suite against its actual driver; JDBC compatibility alone is not evidence of equivalent behavior.

## Durability and isolation evidence

The integration suite uses actual H2 file databases, not mocked persistence. It exercises:

- Fresh datasource/repository reopen, authenticated decryption of synthetic data, and absence of the synthetic plaintext token in database files.
- Separate child JVM commit followed by `Runtime.halt`, then fresh-process recovery/reopen.
- Competing owners/brands claiming the same shop; exactly one binding succeeds.
- Wrong-owner read/revoke/save, existing-brand rebind and expired/revoked authentication rejection.
- Membership revocation versus queued save/read under row locking.
- Uncommitted ciphertext isolation, rollback after actual mutations, and reopened state verification.
- Lost commit acknowledgement: the durable binding remains and retry cannot overwrite it.
- Missing, partial, repeated and unsupported migrations without destructive auto-repair.

These tests demonstrate the configured local database behavior. They do not prove power-loss behavior on every filesystem, production backup recovery, multi-node performance or another database's isolation guarantees.

Run from `backend` after dependencies are present:

```powershell
mvn '-Dmaven.repo.local=.m2' -o -B test
```

## Private try-on jobs and worker boundary

The separate `tryon/jobs` package defines immutable owner-scoped job snapshots and legal queued/running/succeeded/failed/cancelled transitions. Inputs/results use opaque UUID references, never image bytes or public delivery URLs. Idempotency is scoped by owner and key; conflicting input cannot overwrite an existing reservation. Revision compare-and-set prevents late completion overwriting cancellation, and terminal jobs are immutable.

`JdbcPrivateJobs` implements the owner repository and the separate `WorkerJobs` port using the same JDBC transaction model. V2 adds durable jobs, owner/session and worker authority, private-reference metadata, leases, submission phases and a deletion queue. Authority rows are provisioned only by test fixtures in this repository. There is no runtime login or public session-creation endpoint. A session UUID supplied by an HTTP client is not a verified identity; the repository requires a trusted server authentication adapter before runtime use.

`PrivateJobWorker` is explicitly constructed with a recoverable provider and private-storage port. There is no background scheduler or Spring worker bean. The provider port accepts opaque references and returns a durable provider receipt; polling can resume using that receipt after reopening the repository. The existing `PrunaTryOnProvider` protocol experiment keeps an in-memory ID map and is **not** the recoverable provider implementation. No live implementation of the new provider or storage port is included.

Before submission, the repository commits `SUBMITTING`. A failed or interrupted submission is ambiguous: it may already have been accepted remotely. Recovery must not automatically submit it again. Once a provider receipt is persisted as `SUBMITTED`, recovery can poll it. Leases carry a token, monotonically increasing fence and expiry; late completion must fail after cancellation or a newer lease. Retries are bounded and only apply before submission or to polling an existing receipt. This conservative design does not claim exactly-once remote execution or remote cancellation.

The current development bounds are a 60-second lease, three claims total per job (submission plus at most two polling claims), a two-second polling delay and a one-day job visibility window. These are deliberately small testable limits, not an approved production processing or privacy policy. A real provider may need a separately bounded polling budget. No implicit retry of a paid submission is permitted by the worker.

Retention and deletion operate on metadata and opaque private-reference IDs. Revoking delivery permission and queueing an object for deletion happen in a transaction; the worker acknowledges a queued deletion only after the injected storage adapter succeeds. Storage deletion must be idempotent so a crash between deletion and acknowledgement is safe to retry. Tombstones preserve idempotency reservations. Logical database deletion does not erase backups or revoke a copy already held by a remote provider.

Expired jobs are hidden and cannot start or complete. Their database rows remain as tombstones, including opaque reference/receipt metadata; this implementation does not physically purge or minimize those rows. A production retention policy needs metadata compaction and backup lifecycle work in addition to actual object deletion. References shared with a younger visible job are preserved until no visible job needs them, unless the reference itself expires or the owner revokes it. Expired orphan references are queued independently, including results that lost a race with cancellation.

All database records, provider responses, storage operations and session authorities used in tests are synthetic. No actual photo is uploaded or persisted by these classes. Production private-object registration, authenticated delivery, result materialization, verified identity/session lifecycle, provider transport, queue scheduling, operational limits and billing remain separate implementation work.

## Fail-closed runtime configuration

The application still returns `enabled: false`, empty results and empty configured adapters at `/api/try-on/status`. Job submission returns HTTP 501 without binding a photo or job request. Responses are marked `Cache-Control: no-store`; multipart upload parsing is disabled in application configuration.

`fashion-centre.try-on.enabled` defaults to false. Setting it to true fails application startup with a bounded missing-adapters error; it cannot activate the test provider or synthetic identities. No secret value is read by this guard. Adding credentials alone is insufficient to enable generation. The JDBC/worker classes and SQL are packaged for further integration, but no migration, datasource, private session, object store or worker starts automatically.

## Next concrete code work

- Choose and wire a deployment datasource/driver and migration runner; implement administrative membership provisioning without trusting browser identity fields.
- Implement verified identity/session adapters and end-to-end endpoint authorization before connecting the repository to runtime OAuth.
- Add token decryption/key-version lookup, rotation/reinstallation, remote revocation and webhook lifecycle handling.
- Wire verified private-session authority, a production database and private object storage; implement authenticated upload/result/delete endpoints and result materialization before enabling worker scheduling.
- Implement a recoverable provider transport with bounded network operations, cost controls and remote reconciliation/deletion policy. Ambiguous submissions require reconciliation rather than automatic resubmission.
- Add production backup/restore, observability and load checks for the selected database.

None of those are accomplished merely by supplying credentials. External setup and approval requirements remain in [READINESS.md](READINESS.md).

The test database choice and transaction configuration are based on the [official H2 project](https://h2database.com/html/main.html) and [H2 features documentation](https://h2database.com/html/features.html).
