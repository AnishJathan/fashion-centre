-- Explicit serialized H2 migration after V1. No runtime provisioning or login.
-- DDL commits implicitly. A failed migration requires inspection, not drop/recreate.
UPDATE fc_schema_version SET version=CASE WHEN version=1 THEN 1 ELSE NULL END WHERE singleton=1;
CREATE TABLE fc_private_subject (owner_id VARCHAR(128) PRIMARY KEY, active BOOLEAN NOT NULL);
CREATE TABLE fc_private_session (session_id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES fc_private_subject(owner_id), expires_at BIGINT NOT NULL, active BOOLEAN NOT NULL);
CREATE TABLE fc_private_worker (session_id UUID PRIMARY KEY, expires_at BIGINT NOT NULL, active BOOLEAN NOT NULL);
CREATE TABLE fc_private_reference (reference_id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES fc_private_subject(owner_id), expires_at BIGINT NOT NULL, active BOOLEAN NOT NULL);
CREATE TABLE fc_private_job (
 job_id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES fc_private_subject(owner_id), idempotency_key UUID NOT NULL,
 person_ref UUID NOT NULL, garment_refs VARCHAR(255) NOT NULL, state VARCHAR(16) NOT NULL CHECK(state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
 revision BIGINT NOT NULL CHECK(revision >= 0), created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 result_ref UUID, failure VARCHAR(32), deleted BOOLEAN NOT NULL DEFAULT FALSE, retain_until BIGINT NOT NULL,
 phase VARCHAR(16) NOT NULL DEFAULT 'READY' CHECK(phase IN ('READY','SUBMITTING','SUBMITTED')),
 provider_id VARCHAR(128), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 fence BIGINT NOT NULL DEFAULT 0 CHECK(fence >= 0), lease_token UUID, lease_until BIGINT, next_attempt_at BIGINT NOT NULL,
 UNIQUE(owner_id,idempotency_key),
 CHECK((state='SUCCEEDED' AND result_ref IS NOT NULL) OR (state<>'SUCCEEDED' AND result_ref IS NULL)),
 CHECK((state='FAILED' AND failure IS NOT NULL) OR (state<>'FAILED' AND failure IS NULL)),
 CHECK((phase='SUBMITTED' AND provider_id IS NOT NULL) OR (phase<>'SUBMITTED' AND provider_id IS NULL))
);
CREATE INDEX fc_private_job_ready ON fc_private_job(deleted,state,next_attempt_at,lease_until);
CREATE TABLE fc_private_delete (reference_id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL, queued_at BIGINT NOT NULL);
UPDATE fc_schema_version SET version=2 WHERE singleton=1 AND version=1;
