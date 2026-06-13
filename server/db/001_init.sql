-- SplitTest schema (Postgres 16, standalone — no Supabase auth/RLS)
-- All access control enforced at API layer via JWT user_id.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== ENUMS ==========
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('assign', 'redirect_ok', 'redirect_fail', 'goal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== USERS (replaces auth.users + profiles) ==========
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  verify_token TEXT,
  reset_token TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token) WHERE verify_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- compatibility view for old code referencing `profiles`
CREATE OR REPLACE VIEW profiles AS
  SELECT id, id AS user_id, email, full_name, avatar_url, created_at, updated_at FROM users;

-- ========== PROJECTS ==========
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  primary_domain TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  publishable_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  data_retention_days INTEGER DEFAULT 14,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(publishable_token);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ========== CAMPAIGNS ==========
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status campaign_status DEFAULT 'draft' NOT NULL,
  sticky_enabled BOOLEAN DEFAULT TRUE,
  respect_dnt BOOLEAN DEFAULT TRUE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  priority INTEGER DEFAULT 0,
  -- Bot protection (from migration 20260107052916)
  bot_action TEXT DEFAULT 'flag_only',
  bot_threshold INTEGER DEFAULT 70,
  honeypot_url TEXT,
  bot_whitelist_ips TEXT[] DEFAULT '{}',
  bot_whitelist_uas TEXT[] DEFAULT '{}',
  bot_challenge_enabled BOOLEAN DEFAULT FALSE,
  bot_soft_block_delay_ms INTEGER DEFAULT 3000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- ========== CAMPAIGN RULES ==========
CREATE TABLE IF NOT EXISTS campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL UNIQUE,
  country_in TEXT[] DEFAULT '{}',
  device_in TEXT[] DEFAULT '{}',
  browser_in TEXT[] DEFAULT '{}',
  os_in TEXT[] DEFAULT '{}',
  lang_in TEXT[] DEFAULT '{}',
  include_paths TEXT[] DEFAULT '{}',
  url_match_mode TEXT DEFAULT 'path_prefix',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== VARIANTS ==========
CREATE TABLE IF NOT EXISTS variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  weight INTEGER DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  is_control BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variants_campaign ON variants(campaign_id);

-- ========== VISITORS ==========
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  visitor_key_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, visitor_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_visitors_project_hash ON visitors(project_id, visitor_key_hash);

-- ========== ASSIGNMENTS ==========
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES variants(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_campaign_visitor ON assignments(campaign_id, visitor_id);

-- ========== EVENTS RAW (partitioned by day for fast cleanup) ==========
CREATE TABLE IF NOT EXISTS events_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  campaign_id UUID,
  variant_id UUID,
  event_type event_type NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT,
  region TEXT,
  city TEXT,
  district TEXT,
  zip TEXT,
  isp TEXT,
  is_mobile BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  lat NUMERIC,
  lon NUMERIC,
  device TEXT,
  browser TEXT,
  os TEXT,
  lang TEXT,
  time_to_redirect_ms INTEGER,
  error_message TEXT,
  visitor_key_hash TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  path TEXT,
  referrer TEXT,
  session_id TEXT,
  meta_json JSONB DEFAULT '{}',
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- Default partition (catch-all for events outside known ranges)
CREATE TABLE IF NOT EXISTS events_raw_default PARTITION OF events_raw DEFAULT;

CREATE INDEX IF NOT EXISTS idx_events_raw_project_ts ON events_raw(project_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_campaign_ts ON events_raw(campaign_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_session_dedup
  ON events_raw (campaign_id, visitor_key_hash, session_id, event_type)
  WHERE event_type = 'assign';

-- Helper function: create daily partition for events_raw
CREATE OR REPLACE FUNCTION create_events_partition(target_date DATE)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_ts TEXT;
  end_ts TEXT;
BEGIN
  partition_name := 'events_raw_' || to_char(target_date, 'YYYYMMDD');
  start_ts := target_date::TEXT;
  end_ts := (target_date + INTERVAL '1 day')::DATE::TEXT;
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF events_raw FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_ts, end_ts
  );
END;
$$ LANGUAGE plpgsql;

-- Create partitions for today, tomorrow, day after
SELECT create_events_partition(CURRENT_DATE);
SELECT create_events_partition(CURRENT_DATE + 1);
SELECT create_events_partition(CURRENT_DATE + 2);

-- ========== AGGREGATES MINUTE ==========
CREATE TABLE IF NOT EXISTS aggregates_minute (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES variants(id) ON DELETE CASCADE,
  minute_ts TIMESTAMPTZ NOT NULL,
  assigns INTEGER DEFAULT 0,
  redirects_ok INTEGER DEFAULT 0,
  redirects_fail INTEGER DEFAULT 0,
  avg_ttr_ms NUMERIC DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  lang TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregates_minute_unique
  ON aggregates_minute(project_id, campaign_id, minute_ts,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(country, ''), COALESCE(device, ''),
    COALESCE(browser, ''), COALESCE(os, ''), COALESCE(lang, ''));

CREATE INDEX IF NOT EXISTS idx_aggregates_campaign_minute ON aggregates_minute(campaign_id, minute_ts DESC);

-- ========== AGGREGATES DAILY (kept forever for trends) ==========
CREATE TABLE IF NOT EXISTS aggregates_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES variants(id) ON DELETE SET NULL,
  day_ts DATE NOT NULL,
  country TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  lang TEXT,
  assigns INTEGER DEFAULT 0,
  redirects_ok INTEGER DEFAULT 0,
  redirects_fail INTEGER DEFAULT 0,
  avg_ttr_ms NUMERIC DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregates_daily_unique ON aggregates_daily(
  project_id, campaign_id, day_ts,
  COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(country, ''), COALESCE(device, ''),
  COALESCE(browser, ''), COALESCE(os, ''), COALESCE(lang, '')
);

CREATE INDEX IF NOT EXISTS idx_aggregates_daily_project_campaign ON aggregates_daily(project_id, campaign_id, day_ts);

-- ========== SESSIONS ==========
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  visitor_key_hash TEXT NOT NULL,
  session_key TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  page_views INT DEFAULT 1,
  entry_page TEXT,
  exit_page TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  isp TEXT,
  is_mobile BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  gclid TEXT,
  fbclid TEXT,
  is_bounced BOOLEAN DEFAULT TRUE,
  bot_score INTEGER DEFAULT 0,
  bot_signals JSONB DEFAULT '{}',
  is_bot_suspected BOOLEAN DEFAULT FALSE,
  UNIQUE(project_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_visitor ON sessions(project_id, visitor_key_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(project_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id ON sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_started ON sessions(campaign_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_bot_score ON sessions(bot_score);
CREATE INDEX IF NOT EXISTS idx_sessions_is_bot ON sessions(is_bot_suspected);

-- ========== BOT REVIEW QUEUE ==========
CREATE TABLE IF NOT EXISTS bot_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_key_hash TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  bot_score INTEGER,
  bot_signals JSONB DEFAULT '{}',
  review_status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_review_status ON bot_review_queue(review_status);
CREATE INDEX IF NOT EXISTS idx_bot_review_project ON bot_review_queue(project_id);
CREATE INDEX IF NOT EXISTS idx_bot_review_campaign ON bot_review_queue(campaign_id);

-- ========== GEO CACHE ==========
CREATE TABLE IF NOT EXISTS geo_cache (
  ip_hash TEXT PRIMARY KEY,
  country TEXT,
  region TEXT,
  city TEXT,
  district TEXT,
  zip TEXT,
  isp TEXT,
  is_mobile BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  lat NUMERIC,
  lon NUMERIC,
  cached_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_geo_cache_expires ON geo_cache(expires_at);

-- ========== AUDIT LOGS ==========
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id, created_at DESC);

-- ========== TRIGGERS ==========
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
