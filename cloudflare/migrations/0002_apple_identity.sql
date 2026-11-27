ALTER TABLE users ADD COLUMN apple_sub_hash TEXT;
CREATE UNIQUE INDEX users_apple_sub_hash ON users(apple_sub_hash);
