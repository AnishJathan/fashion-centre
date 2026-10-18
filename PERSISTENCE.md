# Transactional storage foundations

This increment adds a concrete JDBC repository for encrypted Shopify connection records and brand ownership. It is deliberately unwired: no Spring bean, runtime datasource, migration-on-startup, login, HTTP endpoint, database console or production encryption key is created. The existing merchant controller remains disconnected.

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

The one-time bootstrap migration is `backend/src/main/resources/db/migration/V1__merchant_connections.sql`. It creates membership, connection and schema-version tables, then writes version 1 only after all DDL succeeds. Applying it requires a separately authorized administrative migration process. The repository constructor validates the marker and never creates, repairs, drops or provisions anything.

H2 is the only tested SQL dialect. H2 DDL commits implicitly, so migrations must be serialized externally and an interrupted bootstrap inspected before recovery. Repeated migration fails without dropping existing records. Missing/partial/unsupported schema is rejected. This is explicit V1 bootstrap SQL, not a general migration runner.

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

## Private try-on job interfaces

The separate `tryon/jobs` package defines immutable owner-scoped job snapshots and legal queued/running/succeeded/failed/cancelled transitions. Inputs/results use opaque UUID references, never image bytes or public delivery URLs. Idempotency is scoped by owner and key; conflicting input cannot overwrite an existing reservation. Revision compare-and-set prevents late completion overwriting cancellation, and terminal jobs are immutable.

The job repository remains an interface. Its tests use an isolated in-memory adapter solely to verify contracts. Future durable implementations must atomically enforce owner, idempotency, revision, state, authentication and private-reference authorization. There is no runtime job persistence, upload, worker, retry scheduler, billing, private-object adapter or generation endpoint. Completion is owner-scoped in this unwired domain; a real worker needs a separate authenticated capability model.

## Next concrete code work

- Choose and wire a deployment datasource/driver and migration runner; implement administrative membership provisioning without trusting browser identity fields.
- Implement verified identity/session adapters and end-to-end endpoint authorization before connecting the repository to runtime OAuth.
- Add token decryption/key-version lookup, rotation/reinstallation, remote revocation and webhook lifecycle handling.
- Implement a durable private-job adapter with the transaction contracts above, then private storage, worker capabilities and retention/deletion.
- Add production backup/restore, observability and load checks for the selected database.

None of those are accomplished merely by supplying credentials. External setup and approval requirements remain in [READINESS.md](READINESS.md).

The test database choice and transaction configuration are based on the [official H2 project](https://h2database.com/html/main.html) and [H2 features documentation](https://h2database.com/html/features.html).
