-- V2: email/password auth and opt-in history (v0.3)
-- Source of truth: flirt-docs/DATABASE_SCHEMA.md

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN history_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_users_email ON users(email);
