-- Add url_match_mode column to campaign_rules
ALTER TABLE public.campaign_rules 
  ADD COLUMN IF NOT EXISTS url_match_mode TEXT DEFAULT 'path_prefix';

-- Add comment for documentation
COMMENT ON COLUMN public.campaign_rules.url_match_mode IS 'URL matching mode: exact_path (exact path match), path_prefix (path starts with pattern), full_url_prefix (full URL including query params starts with pattern)';