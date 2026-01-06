-- Phase 2: Add session tracking support

-- Add session_id column to events_raw for deduplication
ALTER TABLE events_raw ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Create index for session-based deduplication queries
CREATE INDEX IF NOT EXISTS idx_events_raw_session_dedup 
  ON events_raw (campaign_id, visitor_key_hash, session_id, event_type) 
  WHERE event_type = 'assign';

-- Create sessions table for tracking user sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_key_hash TEXT NOT NULL,
  session_key TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  page_views INT DEFAULT 1,
  entry_page TEXT,
  exit_page TEXT,
  country TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  gclid TEXT,
  fbclid TEXT,
  is_bounced BOOLEAN DEFAULT TRUE,
  UNIQUE(project_id, session_key)
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_project_visitor 
  ON sessions(project_id, visitor_key_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at 
  ON sessions(project_id, started_at);

-- Add unique metrics columns to aggregates_minute
ALTER TABLE aggregates_minute 
  ADD COLUMN IF NOT EXISTS unique_visitors INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_sessions INT DEFAULT 0;

-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS policy for sessions - users can view sessions for their projects
CREATE POLICY "Users can view sessions for their projects"
  ON sessions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = sessions.project_id 
    AND projects.user_id = auth.uid()
  ));