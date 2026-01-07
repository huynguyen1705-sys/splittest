import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ UTILITY FUNCTIONS ============

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  const device = /mobile/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop';
  
  let browser = 'other';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'chrome';
  else if (/firefox/i.test(ua)) browser = 'firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'safari';
  else if (/edg/i.test(ua)) browser = 'edge';
  else if (/opera|opr/i.test(ua)) browser = 'opera';
  
  let os = 'other';
  if (/windows/i.test(ua)) os = 'windows';
  else if (/mac/i.test(ua)) os = 'macos';
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = 'linux';
  else if (/android/i.test(ua)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  
  return { device, browser, os };
}

function selectVariant(variants: Array<{ id: string; weight: number }>): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const variant of variants) {
    random -= variant.weight;
    if (random <= 0) return variant.id;
  }
  
  return variants[0].id;
}

function normalizePath(path: string): string {
  if (!path) return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

// ============ BOT DETECTION ============

interface BotSignals {
  webdriver: boolean;
  noPlugins: boolean;
  knownBotUA: boolean;
  suspiciousUA: boolean;
  rateLimitExceeded: boolean;
  missingHeaders: boolean;
  datacenterIP: boolean;
  automationProps: boolean;
}

interface BotDetectionResult {
  score: number;
  signals: BotSignals;
  isSuspected: boolean;
}

const KNOWN_BOT_PATTERNS = [
  'bot', 'crawler', 'spider', 'headless', 'phantom', 'selenium', 'puppeteer',
  'playwright', 'webdriver', 'chrome-lighthouse', 'googlebot', 'bingbot',
  'yandexbot', 'baiduspider', 'duckduckbot', 'slurp', 'ia_archiver',
  'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp', 'telegrambot',
  'applebot', 'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'rogerbot'
];

const SUSPICIOUS_UA_PATTERNS = [
  /^mozilla\/5\.0$/i,  // Too generic
  /^$/,                 // Empty
  /^curl\//i,
  /^wget\//i,
  /^python-requests/i,
  /^axios\//i,
  /^node-fetch/i,
  /^go-http-client/i,
  /^java\//i,
];

function detectBot(
  userAgent: string,
  headers: Headers,
  clientSignals?: string
): BotDetectionResult {
  const signals: BotSignals = {
    webdriver: false,
    noPlugins: false,
    knownBotUA: false,
    suspiciousUA: false,
    rateLimitExceeded: false,
    missingHeaders: false,
    datacenterIP: false,
    automationProps: false,
  };

  const ua = userAgent.toLowerCase();

  // Check known bot patterns
  for (const pattern of KNOWN_BOT_PATTERNS) {
    if (ua.includes(pattern)) {
      signals.knownBotUA = true;
      break;
    }
  }

  // Check suspicious UA patterns
  for (const pattern of SUSPICIOUS_UA_PATTERNS) {
    if (pattern.test(userAgent)) {
      signals.suspiciousUA = true;
      break;
    }
  }

  // Check for missing headers (bots often don't send all headers)
  const acceptLang = headers.get('accept-language');
  const acceptEnc = headers.get('accept-encoding');
  const accept = headers.get('accept');
  
  if (!acceptLang || !acceptEnc || !accept) {
    signals.missingHeaders = true;
  }

  // Parse client-side bot signals (base64 encoded JSON)
  if (clientSignals) {
    try {
      const decoded = atob(clientSignals);
      const parsed = JSON.parse(decoded);
      
      if (parsed.wd === true) signals.webdriver = true;
      if (parsed.pl === 0) signals.noPlugins = true;
      if (parsed.ap === true) signals.automationProps = true;
    } catch {
      // Invalid client signals, ignore
    }
  }

  // Calculate bot score
  let score = 0;
  if (signals.webdriver) score += 40;
  if (signals.noPlugins) score += 15;
  if (signals.knownBotUA) score += 50;
  if (signals.suspiciousUA) score += 20;
  if (signals.rateLimitExceeded) score += 30;
  if (signals.missingHeaders) score += 10;
  if (signals.datacenterIP) score += 20;
  if (signals.automationProps) score += 25;

  score = Math.min(score, 100);

  return {
    score,
    signals,
    isSuspected: score >= 70,
  };
}

function isWhitelisted(
  ip: string,
  userAgent: string,
  whitelistIps: string[] = [],
  whitelistUas: string[] = []
): boolean {
  // Check IP whitelist
  if (whitelistIps.includes(ip)) {
    console.log(`IP ${ip} is whitelisted`);
    return true;
  }

  // Check UA whitelist (pattern matching)
  const uaLower = userAgent.toLowerCase();
  for (const pattern of whitelistUas) {
    if (pattern && uaLower.includes(pattern.toLowerCase())) {
      console.log(`UA matches whitelist pattern: ${pattern}`);
      return true;
    }
  }

  return false;
}

interface BotActionResult {
  action: 'allow' | 'allow_flagged' | 'soft_block' | 'honeypot' | 'block';
  reason: string;
  delay?: number;
  url?: string;
}

function decideBotAction(
  botScore: number,
  botThreshold: number,
  botAction: string,
  honeypotUrl?: string | null,
  softBlockDelay?: number
): BotActionResult {
  // Below threshold - allow normally
  if (botScore < botThreshold) {
    return { action: 'allow', reason: 'below_threshold' };
  }

  // Above threshold - check campaign settings
  switch (botAction) {
    case 'flag_only':
      return { action: 'allow_flagged', reason: 'flagged_only' };
    
    case 'soft_block':
      return { action: 'soft_block', reason: 'soft_blocked', delay: softBlockDelay || 3000 };
    
    case 'redirect_honeypot':
      if (honeypotUrl) {
        return { action: 'honeypot', reason: 'honeypot_redirect', url: honeypotUrl };
      }
      return { action: 'allow_flagged', reason: 'no_honeypot_url' };
    
    case 'block':
      return { action: 'block', reason: 'blocked' };
    
    default:
      return { action: 'allow_flagged', reason: 'default_flag' };
  }
}

// ============ RULE MATCHING ============

function matchesRules(
  rules: { 
    country_in: string[]; 
    device_in: string[]; 
    browser_in: string[]; 
    os_in: string[]; 
    lang_in: string[];
    include_paths: string[];
    url_match_mode?: string;
  },
  context: { 
    country: string; 
    device: string; 
    browser: string; 
    os: string; 
    lang: string;
    path: string;
    query: string;
  }
): boolean {
  if (rules.country_in?.length > 0 && !rules.country_in.includes(context.country)) return false;
  if (rules.device_in?.length > 0 && !rules.device_in.includes(context.device)) return false;
  if (rules.browser_in?.length > 0 && !rules.browser_in.includes(context.browser)) return false;
  if (rules.os_in?.length > 0 && !rules.os_in.includes(context.os)) return false;
  if (rules.lang_in?.length > 0 && !rules.lang_in.includes(context.lang)) return false;
  
  if (rules.include_paths?.length > 0) {
    const matchMode = rules.url_match_mode || 'path_prefix';
    const fullPath = context.path + (context.query ? '?' + context.query : '');
    
    const pathMatches = rules.include_paths.some(pattern => {
      if (!pattern) return false;
      
      switch (matchMode) {
        case 'exact_path':
          if (context.query?.length > 0) return false;
          return normalizePath(context.path) === normalizePath(pattern.replace(/\*$/, ''));
          
        case 'path_prefix':
          if (pattern.endsWith('*')) {
            return context.path.startsWith(pattern.slice(0, -1));
          }
          return normalizePath(context.path) === normalizePath(pattern);
          
        case 'full_url_prefix':
          if (pattern.endsWith('*')) {
            return fullPath.startsWith(pattern.slice(0, -1));
          }
          return fullPath === pattern || fullPath.startsWith(pattern + '?');
          
        default:
          return false;
      }
    });
    
    if (!pathMatches) return false;
  }
  
  return true;
}

// ============ GEO & IP FUNCTIONS ============

interface GeoData {
  country: string;
  region: string | null;
  city: string | null;
  isp: string | null;
  is_mobile: boolean;
  is_proxy: boolean;
}

// Hash IP for geo cache lookup
async function hashIPForGeo(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'geo-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function getGeoDataFromIP(ip: string, supabase: any): Promise<GeoData> {
  const defaultGeo: GeoData = {
    country: 'US',
    region: null,
    city: null,
    isp: null,
    is_mobile: false,
    is_proxy: false,
  };

  try {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
      return defaultGeo;
    }

    const ipHash = await hashIPForGeo(ip);

    // Check cache first
    const { data: cached } = await supabase
      .from('geo_cache')
      .select('country, region, city, isp, is_mobile, is_proxy')
      .eq('ip_hash', ipHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log(`GeoIP cache hit: ${cached.city}, ${cached.country}`);
      return {
        country: cached.country || 'US',
        region: cached.region,
        city: cached.city,
        isp: cached.isp,
        is_mobile: cached.is_mobile || false,
        is_proxy: cached.is_proxy || false,
      };
    }

    // Call ip-api.com
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,countryCode,regionName,city,isp,mobile,proxy`,
      { signal: AbortSignal.timeout(2000) }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success') {
        const geoData: GeoData = {
          country: data.countryCode || 'US',
          region: data.regionName || null,
          city: data.city || null,
          isp: data.isp || null,
          is_mobile: data.mobile || false,
          is_proxy: data.proxy || false,
        };

        console.log(`GeoIP: ${geoData.city}, ${geoData.region}, ${geoData.country}`);

        // Cache result
        await supabase.from('geo_cache').upsert({
          ip_hash: ipHash,
          country: geoData.country,
          region: geoData.region,
          city: geoData.city,
          isp: geoData.isp,
          is_mobile: geoData.is_mobile,
          is_proxy: geoData.is_proxy,
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'ip_hash' });

        return geoData;
      }
    }
  } catch (error) {
    console.warn('GeoIP lookup failed:', error);
  }
  
  return defaultGeo;
}

function getClientIP(req: Request): string {
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  if (cfConnectingIP) return cfConnectingIP;
  
  const xRealIP = req.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;
  
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  return '127.0.0.1';
}

// ============ SESSION & URL HELPERS ============

async function generateSessionId(visitorKeyHash: string): Promise<string> {
  const sessionWindow = 30 * 60 * 1000;
  const windowKey = Math.floor(Date.now() / sessionWindow).toString();
  return await hashString(visitorKeyHash + windowKey);
}

/**
 * Validates that a URL uses only safe schemes (http/https)
 * Returns true if valid, false otherwise
 */
function isValidHttpUrl(urlString: string): boolean {
  if (!urlString || !urlString.trim()) return false;
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildFinalUrl(destinationUrl: string, path: string, originalQuery: string): string {
  let finalUrl = destinationUrl;
  
  if (!finalUrl) return '';
  
  // Validate URL scheme before processing
  if (!isValidHttpUrl(finalUrl.replace('/*', ''))) {
    console.warn(`Invalid destination URL scheme: ${finalUrl.slice(0, 50)}`);
    return '';
  }
  
  try {
    if (finalUrl.includes('/*')) {
      const baseUrl = finalUrl.replace('/*', '');
      const destUrl = new URL(baseUrl);
      const visitorPath = path.startsWith('/') ? path.slice(1) : path;
      destUrl.pathname = destUrl.pathname.replace(/\/$/, '') + '/' + visitorPath;
      finalUrl = destUrl.toString();
    }
    
    if (originalQuery) {
      const destUrl = new URL(finalUrl);
      const origParams = new URLSearchParams(originalQuery);
      
      origParams.forEach((value, key) => {
        if (!destUrl.searchParams.has(key)) {
          destUrl.searchParams.set(key, value);
        }
      });
      
      finalUrl = destUrl.toString();
    }
  } catch (e) {
    console.warn('Failed to process URL:', e);
  }
  
  return finalUrl;
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const visitorKey = url.searchParams.get('vk');
    const sessionKey = url.searchParams.get('sk') || '';
    const path = url.searchParams.get('path') || '/';
    const lang = url.searchParams.get('lang') || 'en';
    const dnt = url.searchParams.get('dnt') === '1';
    const originalQuery = url.searchParams.get('oq') || '';
    const botSignalsParam = url.searchParams.get('bs') || ''; // Client-side bot signals

    // Parse UTM parameters
    const originalParams = new URLSearchParams(originalQuery);
    const utmSource = originalParams.get('utm_source') || '';
    const utmMedium = originalParams.get('utm_medium') || '';
    const utmCampaign = originalParams.get('utm_campaign') || '';
    const gclid = originalParams.get('gclid') || '';
    const fbclid = originalParams.get('fbclid') || '';
    
    console.log(`UTM params: source=${utmSource}, medium=${utmMedium}, campaign=${utmCampaign}`);

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token', shouldRedirect: false }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate token format (48 hex characters)
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      console.warn(`Invalid token format: ${token.slice(0, 10)}...`);
      return new Response(JSON.stringify({ error: 'Invalid token', shouldRedirect: false }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, primary_domain')
      .eq('publishable_token', token)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse user context
    const userAgent = req.headers.get('user-agent') || '';
    const clientIP = getClientIP(req);
    const ipHash = await hashString(clientIP);
    const { device, browser, os } = parseUserAgent(userAgent);
    const referrer = req.headers.get('referer') || '';
    
    // Get geo data
    let geoData: GeoData;
    const cfCountry = req.headers.get('cf-ipcountry');
    if (cfCountry && cfCountry !== 'XX') {
      // Use Cloudflare country, fetch rest from cache/API
      console.log(`CF country: ${cfCountry}, looking up full geo for IP`);
      geoData = await getGeoDataFromIP(clientIP, supabase);
      geoData.country = cfCountry; // Prefer CF country
    } else {
      console.log(`No CF header, looking up IP: ${clientIP}`);
      geoData = await getGeoDataFromIP(clientIP, supabase);
    }
    
    const context = { country: geoData.country, device, browser, os, lang, path, query: originalQuery };
    console.log('Visitor context:', JSON.stringify(context));

    // Get active campaigns with bot protection settings
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        id, sticky_enabled, respect_dnt, 
        bot_action, bot_threshold, honeypot_url, 
        bot_whitelist_ips, bot_whitelist_uas, 
        bot_challenge_enabled, bot_soft_block_delay_ms,
        variants (id, destination_url, weight, is_control),
        campaign_rules (country_in, device_in, browser_in, os_in, lang_in, include_paths, url_match_mode)
      `)
      .eq('project_id', project.id)
      .eq('status', 'active')
      .order('priority', { ascending: false });

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ shouldRedirect: false, reason: 'no_active_campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find matching campaign
    let matchedCampaign = null;
    for (const campaign of campaigns) {
      const rulesData = campaign.campaign_rules;
      const rules = Array.isArray(rulesData) 
        ? (rulesData[0] || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [], include_paths: [] })
        : (rulesData || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [], include_paths: [] });
      
      if (matchesRules(rules, context)) {
        console.log(`Campaign ${campaign.id} MATCHED`);
        matchedCampaign = campaign;
        break;
      }
    }

    if (!matchedCampaign) {
      return new Response(JSON.stringify({ shouldRedirect: false, reason: 'no_matching_rules' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ BOT DETECTION ============
    const botDetection = detectBot(userAgent, req.headers, botSignalsParam);
    console.log(`Bot detection - Score: ${botDetection.score}, Signals: ${JSON.stringify(botDetection.signals)}`);

    // Check whitelist first
    const whitelisted = isWhitelisted(
      clientIP,
      userAgent,
      matchedCampaign.bot_whitelist_ips || [],
      matchedCampaign.bot_whitelist_uas || []
    );

    let botActionResult: BotActionResult = { action: 'allow', reason: 'whitelisted' };
    
    if (!whitelisted) {
      botActionResult = decideBotAction(
        botDetection.score,
        matchedCampaign.bot_threshold || 70,
        matchedCampaign.bot_action || 'flag_only',
        matchedCampaign.honeypot_url,
        matchedCampaign.bot_soft_block_delay_ms
      );
      console.log(`Bot action decision: ${botActionResult.action} (${botActionResult.reason})`);
    }

    // Handle bot blocking actions
    if (botActionResult.action === 'block') {
      console.log('Bot blocked');
      return new Response(JSON.stringify({ 
        shouldRedirect: false, 
        reason: 'bot_detected',
        botScore: botDetection.score,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (botActionResult.action === 'honeypot' && botActionResult.url) {
      // Validate honeypot URL scheme before redirecting
      if (!isValidHttpUrl(botActionResult.url)) {
        console.warn(`Invalid honeypot URL scheme: ${botActionResult.url.slice(0, 50)}`);
        return new Response(JSON.stringify({ 
          shouldRedirect: false, 
          error: 'Invalid honeypot configuration',
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log(`Redirecting bot to honeypot: ${botActionResult.url}`);
      return new Response(JSON.stringify({ 
        shouldRedirect: true, 
        url: botActionResult.url,
        reason: 'honeypot_redirect',
        botScore: botDetection.score,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle DNT
    if (matchedCampaign.respect_dnt && dnt) {
      const selectedVariantId = selectVariant(matchedCampaign.variants);
      const selectedVariant = matchedCampaign.variants.find((v: { id: string }) => v.id === selectedVariantId);
      const dntFinalUrl = buildFinalUrl(selectedVariant?.destination_url || '', path, originalQuery);
      
      return new Response(JSON.stringify({
        shouldRedirect: true,
        url: dntFinalUrl,
        campaignId: matchedCampaign.id,
        variantId: selectedVariantId,
        dnt: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate visitor/session keys
    const actualVisitorKey = visitorKey || crypto.randomUUID();
    const visitorKeyHash = await hashString(actualVisitorKey);
    const sessionId = await generateSessionId(visitorKeyHash);

    // Check for existing assign in this session
    const { data: existingAssign } = await supabase
      .from('events_raw')
      .select('variant_id')
      .eq('campaign_id', matchedCampaign.id)
      .eq('visitor_key_hash', visitorKeyHash)
      .eq('session_id', sessionId)
      .eq('event_type', 'assign')
      .maybeSingle();

    if (existingAssign) {
      const cachedVariant = matchedCampaign.variants.find((v: { id: string }) => v.id === existingAssign.variant_id);
      const cachedUrl = buildFinalUrl(cachedVariant?.destination_url || '', path, originalQuery);
      
      return new Response(JSON.stringify({
        shouldRedirect: true,
        url: cachedUrl,
        campaignId: matchedCampaign.id,
        variantId: existingAssign.variant_id,
        visitorKey: actualVisitorKey,
        cached: true,
        ttl: 86400,
        ...(botActionResult.action === 'soft_block' && { softBlockDelay: botActionResult.delay }),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create visitor
    let visitorId: string;
    const { data: existingVisitor } = await supabase
      .from('visitors')
      .select('id')
      .eq('project_id', project.id)
      .eq('visitor_key_hash', visitorKeyHash)
      .single();

    if (existingVisitor) {
      visitorId = existingVisitor.id;
      await supabase
        .from('visitors')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', visitorId);
    } else {
      const { data: newVisitor, error: insertError } = await supabase
        .from('visitors')
        .insert({
          project_id: project.id,
          visitor_key_hash: visitorKeyHash,
        })
        .select('id')
        .single();

      visitorId = insertError ? crypto.randomUUID() : newVisitor.id;
    }

    // Select variant
    let selectedVariantId: string;
    
    if (matchedCampaign.sticky_enabled) {
      const { data: existingAssignment } = await supabase
        .from('assignments')
        .select('variant_id')
        .eq('campaign_id', matchedCampaign.id)
        .eq('visitor_id', visitorId)
        .single();

      if (existingAssignment) {
        selectedVariantId = existingAssignment.variant_id;
      } else {
        selectedVariantId = selectVariant(matchedCampaign.variants);
        await supabase.from('assignments').insert({
          campaign_id: matchedCampaign.id,
          visitor_id: visitorId,
          variant_id: selectedVariantId,
        });
      }
    } else {
      selectedVariantId = selectVariant(matchedCampaign.variants);
    }

    const selectedVariant = matchedCampaign.variants.find((v: { id: string }) => v.id === selectedVariantId);
    const finalUrl = buildFinalUrl(selectedVariant?.destination_url || '', path, originalQuery);

    // Log assignment event with geo data
    await supabase.from('events_raw').insert({
      project_id: project.id,
      campaign_id: matchedCampaign.id,
      variant_id: selectedVariantId,
      event_type: 'assign',
      country: geoData.country,
      city: geoData.city,
      region: geoData.region,
      isp: geoData.isp,
      is_mobile: geoData.is_mobile,
      is_proxy: geoData.is_proxy,
      device,
      browser,
      os,
      lang,
      visitor_key_hash: visitorKeyHash,
      session_id: sessionId,
      ip_hash: ipHash,
      path,
      referrer: referrer.slice(0, 500),
      user_agent: userAgent.slice(0, 500),
    });

    // Create/update session with bot detection and geo data
    const isBotSuspected = botDetection.isSuspected || botActionResult.action !== 'allow';
    const fullSessionKey = sessionKey || sessionId;
    
    await supabase.from('sessions').upsert({
      project_id: project.id,
      campaign_id: matchedCampaign.id,
      visitor_key_hash: visitorKeyHash,
      session_key: fullSessionKey,
      entry_page: path,
      exit_page: path,
      country: geoData.country,
      city: geoData.city,
      region: geoData.region,
      isp: geoData.isp,
      is_mobile: geoData.is_mobile,
      is_proxy: geoData.is_proxy,
      device,
      browser,
      os,
      referrer: referrer.slice(0, 500),
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      gclid: gclid || null,
      fbclid: fbclid || null,
      last_activity_at: new Date().toISOString(),
      // Bot detection fields
      bot_score: botDetection.score,
      bot_signals: botDetection.signals,
      is_bot_suspected: isBotSuspected,
    }, {
      onConflict: 'project_id,session_key',
    });

    // Add to bot review queue if suspected
    if (isBotSuspected && botActionResult.action !== 'allow') {
      const { error: reviewError } = await supabase.from('bot_review_queue').insert({
        project_id: project.id,
        campaign_id: matchedCampaign.id,
        visitor_key_hash: visitorKeyHash,
        ip_hash: ipHash,
        user_agent: userAgent.slice(0, 500),
        bot_score: botDetection.score,
        bot_signals: botDetection.signals,
        review_status: 'pending',
      });
      if (reviewError) console.warn('Failed to add to bot review queue:', reviewError);
    }

    console.log(`Assign logged - Session: ${sessionId.slice(0, 16)}..., Variant: ${selectedVariantId}, BotScore: ${botDetection.score}`);

    return new Response(JSON.stringify({
      shouldRedirect: true,
      url: finalUrl,
      campaignId: matchedCampaign.id,
      variantId: selectedVariantId,
      visitorKey: actualVisitorKey,
      sessionId: sessionId,
      cached: false,
      ttl: 86400,
      ...(botActionResult.action === 'soft_block' && { softBlockDelay: botActionResult.delay }),
      ...(isBotSuspected && { botScore: botDetection.score }),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge assign error:', error);
    return new Response(JSON.stringify({ error: 'Internal error', shouldRedirect: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
