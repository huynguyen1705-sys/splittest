-- Add geo columns to events_raw
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS isp text;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS is_mobile boolean DEFAULT false;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS is_proxy boolean DEFAULT false;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS lon numeric;

-- Add geo columns to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS isp text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_mobile boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_proxy boolean DEFAULT false;

-- Add geo columns to aggregates_minute for aggregation
ALTER TABLE aggregates_minute ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE aggregates_minute ADD COLUMN IF NOT EXISTS region text;

-- Create geo_cache table for IP caching (24h TTL)
CREATE TABLE IF NOT EXISTS geo_cache (
  ip_hash text PRIMARY KEY,
  country text,
  region text,
  city text,
  district text,
  zip text,
  isp text,
  is_mobile boolean DEFAULT false,
  is_proxy boolean DEFAULT false,
  lat numeric,
  lon numeric,
  cached_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '24 hours')
);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_geo_cache_expires ON geo_cache(expires_at);

-- RLS for geo_cache (service role only - edge functions)
ALTER TABLE geo_cache ENABLE ROW LEVEL SECURITY;

-- No public policies - only service role can access geo_cache