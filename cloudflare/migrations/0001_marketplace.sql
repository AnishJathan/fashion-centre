CREATE TABLE users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, phone TEXT UNIQUE, first_name TEXT NOT NULL DEFAULT '', photo_key TEXT);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE flows (hash TEXT PRIMARY KEY, provider TEXT NOT NULL, binding TEXT NOT NULL, shop TEXT, challenge TEXT, expires INTEGER NOT NULL);
CREATE TABLE grants (hash TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL, challenge TEXT NOT NULL, expires INTEGER NOT NULL, session_expires INTEGER NOT NULL);
CREATE TABLE stores (shop TEXT PRIMARY KEY, name TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);
CREATE TABLE codes (phone TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL, sent INTEGER NOT NULL, window_start INTEGER NOT NULL, sends INTEGER NOT NULL);
CREATE TABLE predictions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider_id TEXT NOT NULL);
