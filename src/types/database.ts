export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type EventType = 'assign' | 'redirect_ok' | 'redirect_fail' | 'goal';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  primary_domain: string;
  timezone: string;
  publishable_token: string;
  data_retention_days: number;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  project_id: string;
  name: string;
  status: CampaignStatus;
  sticky_enabled: boolean;
  respect_dnt: boolean;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignRule {
  id: string;
  campaign_id: string;
  country_in: string[];
  device_in: string[];
  browser_in: string[];
  os_in: string[];
  lang_in: string[];
  include_paths: string[];
  created_at: string;
}

export interface Variant {
  id: string;
  campaign_id: string;
  name: string;
  destination_url: string;
  weight: number;
  is_control: boolean;
  created_at: string;
}

export interface Visitor {
  id: string;
  project_id: string;
  visitor_key_hash: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface Assignment {
  id: string;
  campaign_id: string;
  visitor_id: string;
  variant_id: string;
  assigned_at: string;
}

export interface EventRaw {
  id: string;
  project_id: string;
  campaign_id: string | null;
  variant_id: string | null;
  event_type: EventType;
  ts: string;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  lang: string | null;
  time_to_redirect_ms: number | null;
  error_message: string | null;
  visitor_key_hash: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  path: string | null;
  referrer: string | null;
  meta_json: Record<string, unknown>;
}

export interface AggregateMinute {
  id: string;
  project_id: string;
  campaign_id: string;
  variant_id: string | null;
  minute_ts: string;
  assigns: number;
  redirects_ok: number;
  redirects_fail: number;
  avg_ttr_ms: number;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  lang: string | null;
}

export interface CampaignWithDetails extends Campaign {
  variants?: Variant[];
  rules?: CampaignRule;
  project?: Project;
}

export interface AnalyticsData {
  totalAssigns: number;
  totalRedirectsOk: number;
  totalRedirectsFail: number;
  avgTimeToRedirect: number;
  byVariant: Record<string, { assigns: number; redirectsOk: number; redirectsFail: number }>;
  byCountry: Record<string, number>;
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
  byOS: Record<string, number>;
  byLang: Record<string, number>;
  timeSeries: { ts: string; assigns: number; redirectsOk: number }[];
}
