CREATE TABLE IF NOT EXISTS provider_sign_ins (
  state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  provider VARCHAR(10) NOT NULL,
  browser_hash VARCHAR(64),
  challenge VARCHAR(64),
  shop VARCHAR(80),
  return_to VARCHAR(255),
  grant_hash VARCHAR(64) UNIQUE,
  subject VARCHAR(255),
  first_name VARCHAR(80),
  identity_expires DATETIME(6),
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_provider_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merchant_sign_in_sessions (
  token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  shop VARCHAR(80) NOT NULL,
  shopify_user_id VARCHAR(32) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_merchant_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_sign_ins (
  state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  provider VARCHAR(10) NOT NULL,
  browser_hash VARCHAR(64),
  shop VARCHAR(80),
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_web_sign_ins_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS social_identities (
  provider VARCHAR(10) NOT NULL,
  subject_hash VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (provider, subject_hash),
  CONSTRAINT fk_social_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;