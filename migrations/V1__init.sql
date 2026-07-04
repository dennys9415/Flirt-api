-- V1: initial schema for Flirt v0.1
-- Source of truth: flirt-docs/DATABASE_SCHEMA.md

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  personality JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_identifier TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_device_identifier ON devices(device_identifier);

CREATE TABLE reply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tone TEXT NOT NULL,
  intent TEXT NOT NULL,
  -- Retained only when the user opts into history (v0.3+)
  input_message TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reply_requests_device_id ON reply_requests(device_id);
CREATE INDEX idx_reply_requests_created_at ON reply_requests(created_at);

CREATE TABLE reply_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES reply_requests(id) ON DELETE CASCADE,
  -- Retained only when the user opts into history (v0.3+)
  text TEXT,
  style TEXT,
  position INT NOT NULL
);

CREATE INDEX idx_reply_suggestions_request_id ON reply_suggestions(request_id);

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_device_id ON usage_events(device_id);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at);
