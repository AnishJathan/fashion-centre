ALTER TABLE users MODIFY phone_number VARCHAR(20) NULL;
ALTER TABLE users ADD google_subject_hash VARCHAR(64) NULL;
CREATE UNIQUE INDEX uk_users_google ON users (google_subject_hash);

CREATE TABLE provider_sign_ins (
  state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  provider VARCHAR(10) NOT NULL,
  browser_hash VARCHAR(64),
  challenge VARCHAR(64),
  shop VARCHAR(80),
  grant_hash VARCHAR(64) UNIQUE,
  subject VARCHAR(255),
  first_name VARCHAR(80),
  identity_expires DATETIME(6),
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_provider_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE merchant_sign_in_sessions (
  token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  shop VARCHAR(80) NOT NULL,
  shopify_user_id VARCHAR(32) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_merchant_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
