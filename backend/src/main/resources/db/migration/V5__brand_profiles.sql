-- Brand profile
CREATE TABLE fc_brand (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Link merchant membership to brand
ALTER TABLE fc_brand_membership
    ADD CONSTRAINT fk_fc_membership_brand
    FOREIGN KEY (brand_id) REFERENCES fc_brand(id)
    ON DELETE CASCADE;

-- Update merchant schema version
UPDATE fc_schema_version
SET version = 2
WHERE singleton = 1 AND version = 1;