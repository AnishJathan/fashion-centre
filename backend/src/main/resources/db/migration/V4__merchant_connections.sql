
-- Merchant brand ownership
CREATE TABLE fc_brand_membership (
    brand_id VARCHAR(100) NOT NULL PRIMARY KEY,
    owner_id VARCHAR(36) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_fc_brand_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE KEY uk_fc_brand_owner (brand_id, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Schema version used by JdbcConnections
CREATE TABLE fc_schema_version (
    singleton INT NOT NULL PRIMARY KEY,
    version INT NOT NULL,
    CONSTRAINT chk_fc_schema_singleton CHECK (singleton = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO fc_schema_version (singleton, version)
VALUES (1, 1);


-- Encrypted Shopify merchant connections
CREATE TABLE fc_merchant_connection (
    brand_id VARCHAR(100) NOT NULL PRIMARY KEY,
    owner_id VARCHAR(36) NOT NULL,
    shop VARCHAR(255) NOT NULL,
    scopes VARCHAR(4096) NOT NULL,
    aad_version INT NOT NULL DEFAULT 1,
    nonce VARBINARY(12) NOT NULL,
    ciphertext MEDIUMBLOB NOT NULL,

    CONSTRAINT fk_fc_connection_membership
        FOREIGN KEY (brand_id, owner_id)
        REFERENCES fc_brand_membership (brand_id, owner_id)
        ON DELETE CASCADE,

    UNIQUE KEY uk_fc_merchant_shop (shop)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
