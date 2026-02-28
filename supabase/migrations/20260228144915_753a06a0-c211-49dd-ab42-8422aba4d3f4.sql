
-- Create aggregates_daily table for compressed historical data
CREATE TABLE public.aggregates_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES variants(id) ON DELETE SET NULL,
  day_ts date NOT NULL,
  country text,
  device text,
  browser text,
  os text,
  lang text,
  assigns integer DEFAULT 0,
  redirects_ok integer DEFAULT 0,
  redirects_fail integer DEFAULT 0,
  avg_ttr_ms numeric DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  unique_sessions integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for upserts
CREATE UNIQUE INDEX idx_aggregates_daily_unique ON aggregates_daily(
  project_id, campaign_id, day_ts, 
  COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(country, ''), COALESCE(device, ''), 
  COALESCE(browser, ''), COALESCE(os, ''), COALESCE(lang, '')
);

-- Index for querying
CREATE INDEX idx_aggregates_daily_project_campaign ON aggregates_daily(project_id, campaign_id, day_ts);

-- Enable RLS
ALTER TABLE public.aggregates_daily ENABLE ROW LEVEL SECURITY;

-- RLS: users can view their own project data
CREATE POLICY "Users can view daily aggregates for their projects"
ON public.aggregates_daily FOR SELECT
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = aggregates_daily.project_id AND projects.user_id = auth.uid()
));
