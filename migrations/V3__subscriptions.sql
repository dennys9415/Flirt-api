-- V3: subscriptions (v0.4)
-- Source of truth: flirt-docs/DATABASE_SCHEMA.md

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  store TEXT NOT NULL DEFAULT 'app_store',
  original_transaction_id TEXT UNIQUE NOT NULL,
  product_id TEXT NOT NULL,
  -- 'storekit_test' (local dev) | 'sandbox' | 'production'
  environment TEXT NOT NULL DEFAULT 'storekit_test',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
