
-- Add campaign_id column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Create index for efficient querying by campaign
CREATE INDEX idx_sessions_campaign_id ON public.sessions(campaign_id);

-- Create composite index for campaign + time range queries
CREATE INDEX idx_sessions_campaign_started ON public.sessions(campaign_id, started_at);
