-- Add bot detection columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bot_score integer DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bot_signals jsonb DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_bot_suspected boolean DEFAULT false;

-- Add bot protection settings to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_action text DEFAULT 'flag_only';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_threshold integer DEFAULT 70;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS honeypot_url text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_whitelist_ips text[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_whitelist_uas text[] DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_challenge_enabled boolean DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_soft_block_delay_ms integer DEFAULT 3000;

-- Create bot_review_queue table for reviewing flagged sessions
CREATE TABLE IF NOT EXISTS bot_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_key_hash text,
  ip_hash text,
  user_agent text,
  bot_score integer,
  bot_signals jsonb DEFAULT '{}',
  review_status text DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on bot_review_queue
ALTER TABLE bot_review_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for bot_review_queue
CREATE POLICY "Users can view bot reviews for their projects"
ON bot_review_queue FOR SELECT
USING (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = bot_review_queue.project_id
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update bot reviews for their projects"
ON bot_review_queue FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = bot_review_queue.project_id
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete bot reviews for their projects"
ON bot_review_queue FOR DELETE
USING (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = bot_review_queue.project_id
  AND projects.user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_bot_score ON sessions(bot_score);
CREATE INDEX IF NOT EXISTS idx_sessions_is_bot ON sessions(is_bot_suspected);
CREATE INDEX IF NOT EXISTS idx_bot_review_status ON bot_review_queue(review_status);
CREATE INDEX IF NOT EXISTS idx_bot_review_project ON bot_review_queue(project_id);
CREATE INDEX IF NOT EXISTS idx_bot_review_campaign ON bot_review_queue(campaign_id);