-- Create enums for status and types
CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE public.device_type AS ENUM ('mobile', 'tablet', 'desktop');
CREATE TYPE public.event_type AS ENUM ('assign', 'redirect_ok', 'redirect_fail', 'goal');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create projects table (multi-tenant)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  primary_domain TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  publishable_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  data_retention_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status campaign_status DEFAULT 'draft' NOT NULL,
  sticky_enabled BOOLEAN DEFAULT true,
  respect_dnt BOOLEAN DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create campaign targeting rules
CREATE TABLE public.campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL UNIQUE,
  country_in TEXT[] DEFAULT '{}',
  device_in TEXT[] DEFAULT '{}',
  browser_in TEXT[] DEFAULT '{}',
  os_in TEXT[] DEFAULT '{}',
  lang_in TEXT[] DEFAULT '{}',
  include_paths TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create variants table
CREATE TABLE public.variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  weight INTEGER DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  is_control BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create visitors table (stores hashed visitor keys only)
CREATE TABLE public.visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  visitor_key_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, visitor_key_hash)
);

-- Create assignments table for sticky bucketing
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  visitor_id UUID REFERENCES public.visitors(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.variants(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, visitor_id)
);

-- Create raw events table (high volume)
CREATE TABLE public.events_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.variants(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT,
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
  meta_json JSONB DEFAULT '{}'
);

-- Create aggregates table for efficient analytics
CREATE TABLE public.aggregates_minute (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.variants(id) ON DELETE CASCADE,
  minute_ts TIMESTAMPTZ NOT NULL,
  assigns INTEGER DEFAULT 0,
  redirects_ok INTEGER DEFAULT 0,
  redirects_fail INTEGER DEFAULT 0,
  avg_ttr_ms NUMERIC DEFAULT 0,
  country TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  lang TEXT,
  UNIQUE(campaign_id, variant_id, minute_ts, country, device, browser, os, lang)
);

-- Create audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_events_raw_ts ON public.events_raw(ts DESC);
CREATE INDEX idx_events_raw_project_ts ON public.events_raw(project_id, ts DESC);
CREATE INDEX idx_events_raw_campaign_ts ON public.events_raw(campaign_id, ts DESC);
CREATE INDEX idx_aggregates_campaign_minute ON public.aggregates_minute(campaign_id, minute_ts DESC);
CREATE INDEX idx_projects_token ON public.projects(publishable_token);
CREATE INDEX idx_campaigns_project ON public.campaigns(project_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_visitors_project_hash ON public.visitors(project_id, visitor_key_hash);
CREATE INDEX idx_assignments_campaign_visitor ON public.assignments(campaign_id, visitor_id);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregates_minute ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Projects policies
CREATE POLICY "Users can view their own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Campaigns policies (through project ownership)
CREATE POLICY "Users can view campaigns in their projects" ON public.campaigns FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = campaigns.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create campaigns in their projects" ON public.campaigns FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update campaigns in their projects" ON public.campaigns FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = campaigns.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete campaigns in their projects" ON public.campaigns FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = campaigns.project_id AND projects.user_id = auth.uid()));

-- Campaign rules policies
CREATE POLICY "Users can view rules for their campaigns" ON public.campaign_rules FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = campaign_rules.campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can create rules for their campaigns" ON public.campaign_rules FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update rules for their campaigns" ON public.campaign_rules FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = campaign_rules.campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can delete rules for their campaigns" ON public.campaign_rules FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = campaign_rules.campaign_id AND p.user_id = auth.uid()));

-- Variants policies
CREATE POLICY "Users can view variants for their campaigns" ON public.variants FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = variants.campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can create variants for their campaigns" ON public.variants FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update variants for their campaigns" ON public.variants FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = variants.campaign_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can delete variants for their campaigns" ON public.variants FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = variants.campaign_id AND p.user_id = auth.uid()));

-- Visitors policies
CREATE POLICY "Users can view visitors for their projects" ON public.visitors FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = visitors.project_id AND projects.user_id = auth.uid()));

-- Assignments policies
CREATE POLICY "Users can view assignments for their campaigns" ON public.assignments FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.campaigns c JOIN public.projects p ON c.project_id = p.id WHERE c.id = assignments.campaign_id AND p.user_id = auth.uid()));

-- Events policies (users can view events for their projects)
CREATE POLICY "Users can view events for their projects" ON public.events_raw FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = events_raw.project_id AND projects.user_id = auth.uid()));

-- Aggregates policies
CREATE POLICY "Users can view aggregates for their projects" ON public.aggregates_minute FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = aggregates_minute.project_id AND projects.user_id = auth.uid()));

-- Audit logs policies
CREATE POLICY "Users can view audit logs for their projects" ON public.audit_logs FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = audit_logs.project_id AND projects.user_id = auth.uid()));

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for events
ALTER PUBLICATION supabase_realtime ADD TABLE public.events_raw;