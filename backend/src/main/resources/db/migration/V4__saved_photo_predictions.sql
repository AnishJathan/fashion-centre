CREATE TABLE saved_photo_predictions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(128) NOT NULL,
  CONSTRAINT fk_saved_photo_predictions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;