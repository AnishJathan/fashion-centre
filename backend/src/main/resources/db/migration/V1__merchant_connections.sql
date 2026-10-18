-- Explicit administrator migration; never run by runtime startup.
-- H2 is the only tested dialect. Serialize migration execution externally.
-- H2 DDL commits implicitly: a failed/interrupted migration requires inspection;
-- do not retry by dropping tables. The final marker is written only after all DDL.
CREATE TABLE fc_schema_version (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL);
CREATE TABLE fc_brand_membership (
 brand_id VARCHAR(256) PRIMARY KEY,
 owner_id VARCHAR(256) NOT NULL,
 active BOOLEAN NOT NULL,
 UNIQUE (brand_id, owner_id)
);
CREATE TABLE fc_merchant_connection (
 brand_id VARCHAR(256) PRIMARY KEY,
 owner_id VARCHAR(256) NOT NULL,
 shop VARCHAR(80) NOT NULL UNIQUE,
 scopes VARCHAR(4096) NOT NULL,
 aad_version INTEGER NOT NULL CHECK (aad_version = 1),
 nonce VARBINARY(12) NOT NULL CHECK (OCTET_LENGTH(nonce) = 12),
 ciphertext VARBINARY(65536) NOT NULL CHECK (OCTET_LENGTH(ciphertext) >= 17),
 FOREIGN KEY (brand_id, owner_id) REFERENCES fc_brand_membership (brand_id, owner_id)
);
INSERT INTO fc_schema_version(singleton, version) VALUES (1, 1);
