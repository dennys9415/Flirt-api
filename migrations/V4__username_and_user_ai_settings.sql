-- V4: optional username + bring-your-own-key AI settings (BYOK)
-- Source of truth: flirt-docs/DATABASE_SCHEMA.md

ALTER TABLE users ADD COLUMN username TEXT UNIQUE;

CREATE INDEX idx_users_username ON users(username);

-- One AI configuration per user. The API key is encrypted at rest
-- (AES-256-GCM, key from API_KEY_ENCRYPTION_SECRET) — never stored plaintext.
CREATE TABLE user_ai_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
