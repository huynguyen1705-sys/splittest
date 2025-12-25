-- Add unique constraint for aggregates_minute upsert
ALTER TABLE public.aggregates_minute 
ADD CONSTRAINT aggregates_minute_unique_key 
UNIQUE (project_id, campaign_id, minute_ts, variant_id, country, device, browser, os, lang);

-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;