ALTER TABLE users MODIFY phone_number VARCHAR(20) NULL;

CREATE TABLE auth_identities (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uk_provider_subject (provider, subject),
  CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

