-- Add timestamps required by merchant membership operations
ALTER TABLE fc_brand_membership
    ADD COLUMN created_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),
    ADD COLUMN updated_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6);

-- Allow brand registration to use the database timestamp default
ALTER TABLE fc_brand
    MODIFY COLUMN created_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6);