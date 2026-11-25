CREATE TABLE IF NOT EXISTS provider_sign_ins (
    state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    provider VARCHAR(10) NOT NULL,
    browser_hash VARCHAR(64),
    challenge VARCHAR(64),
    shop VARCHAR(80),
    grant_hash VARCHAR(64) UNIQUE,
    subject VARCHAR(255),
    first_name VARCHAR(80),
    identity_expires TIMESTAMP(6),
    expires_at TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_provider_expiry
    ON provider_sign_ins (expires_at);

CREATE TABLE IF NOT EXISTS merchant_sign_in_sessions (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    shop VARCHAR(80) NOT NULL,
    shopify_user_id VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_merchant_session_expiry
    ON merchant_sign_in_sessions (expires_at);
CREATE TABLE IF NOT EXISTS fc_schema_version (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fc_brand_membership (
    brand_id VARCHAR(256) PRIMARY KEY,
    owner_id VARCHAR(256) NOT NULL,
    active BOOLEAN NOT NULL,
    UNIQUE (brand_id, owner_id)
);

CREATE TABLE IF NOT EXISTS fc_merchant_connection (
    brand_id VARCHAR(256) PRIMARY KEY,
    owner_id VARCHAR(256) NOT NULL,
    shop VARCHAR(80) NOT NULL UNIQUE,
    scopes VARCHAR(4096) NOT NULL,
    aad_version INTEGER NOT NULL CHECK (aad_version = 1),
    nonce VARBINARY(12) NOT NULL CHECK (OCTET_LENGTH(nonce) = 12),
    ciphertext VARBINARY(65536) NOT NULL CHECK (OCTET_LENGTH(ciphertext) >= 17),
    FOREIGN KEY (brand_id, owner_id)
        REFERENCES fc_brand_membership (brand_id, owner_id)
);

MERGE INTO fc_schema_version (singleton, version)
KEY (singleton)
VALUES (1, 1);
