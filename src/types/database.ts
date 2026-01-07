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

export type BotAction = 'flag_only' | 'soft_block' | 'redirect_honeypot' | 'block';

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
  // Bot protection settings
  bot_action?: BotAction;
  bot_threshold?: number;
  honeypot_url?: string | null;
  bot_whitelist_ips?: string[];
  bot_whitelist_uas?: string[];
  bot_challenge_enabled?: boolean;
  bot_soft_block_delay_ms?: number;
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

export interface Session {
  id: string;
  project_id: string;
  visitor_key_hash: string;
  session_key: string;
  started_at: string;
  last_activity_at: string;
  page_views: number;
  entry_page: string | null;
  exit_page: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  is_bounced: boolean;
  // Bot detection
  bot_score?: number;
  bot_signals?: BotSignals;
  is_bot_suspected?: boolean;
}

export interface BotSignals {
  webdriver?: boolean;
  noPlugins?: boolean;
  knownBotUA?: boolean;
  suspiciousUA?: boolean;
  rateLimitExceeded?: boolean;
  missingHeaders?: boolean;
  datacenterIP?: boolean;
  automationProps?: boolean;
}

export interface BotReviewItem {
  id: string;
  session_id: string | null;
  campaign_id: string | null;
  project_id: string;
  visitor_key_hash: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  bot_score: number | null;
  bot_signals: BotSignals | null;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
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
  session_id: string | null;
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
  unique_visitors: number;
  unique_sessions: number;
}

export interface CampaignWithDetails extends Campaign {
  variants?: Variant[];
  rules?: CampaignRule;
  project?: Project;
}

export interface GeoBreakdownItem {
  name: string;
  country?: string;
  sessions: number;
  visitors: number;
}

export interface ISPBreakdownItem {
  isp: string;
  sessions: number;
  isMobile: boolean;
}

export interface AnalyticsData {
  totalAssigns: number;
  totalRedirectsOk: number;
  totalRedirectsFail: number;
  avgTimeToRedirect: number;
  uniqueVisitors: number;
  uniqueSessions: number;
  redirectSuccessRate: number;
  byVariant: Record<string, { 
    assigns: number; 
    redirectsOk: number; 
    redirectsFail: number;
    uniqueVisitors: number;
  }>;
  byCountry: Record<string, number>;
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
  byOS: Record<string, number>;
  byLang: Record<string, number>;
  byUtmSource: Record<string, { sessions: number; uniqueVisitors: number }>;
  byUtmMedium: Record<string, { sessions: number; uniqueVisitors: number }>;
  byUtmCampaign: Record<string, { sessions: number; uniqueVisitors: number }>;
  byReferrer: Record<string, { sessions: number; uniqueVisitors: number }>;
  timeSeries: { ts: string; assigns: number; redirectsOk: number; uniqueVisitors?: number }[];
  // Geographic deep dive
  byCity: GeoBreakdownItem[];
  byRegion: GeoBreakdownItem[];
  byISP: ISPBreakdownItem[];
  networkType: { mobile: number; fixed: number };
  proxyUsage: { proxy: number; direct: number };
  // Time of day analysis
  byHour: Record<number, number>; // hour (0-23) -> session count
}
