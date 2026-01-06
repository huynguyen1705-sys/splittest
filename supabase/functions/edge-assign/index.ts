import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash function for visitor keys
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Parse user agent for device, browser, OS
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

// Weighted random selection
function selectVariant(variants: Array<{ id: string; weight: number }>): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const variant of variants) {
    random -= variant.weight;
    if (random <= 0) return variant.id;
  }
  
  return variants[0].id;
}

// Normalize path by removing trailing slash
function normalizePath(path: string): string {
  if (!path) return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

// Check if targeting rules match - now includes path matching with url_match_mode
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
  // Check country targeting
  if (rules.country_in && rules.country_in.length > 0 && !rules.country_in.includes(context.country)) return false;
  
  // Check device targeting
  if (rules.device_in && rules.device_in.length > 0 && !rules.device_in.includes(context.device)) return false;
  
  // Check browser targeting
  if (rules.browser_in && rules.browser_in.length > 0 && !rules.browser_in.includes(context.browser)) return false;
  
  // Check OS targeting
  if (rules.os_in && rules.os_in.length > 0 && !rules.os_in.includes(context.os)) return false;
  
  // Check language targeting
  if (rules.lang_in && rules.lang_in.length > 0 && !rules.lang_in.includes(context.lang)) return false;
  
  // Check path targeting with url_match_mode support
  if (rules.include_paths && rules.include_paths.length > 0) {
    const matchMode = rules.url_match_mode || 'path_prefix';
    
    // Combine path and query for full URL matching
    const fullPath = context.path + (context.query ? '?' + context.query : '');
    
    console.log(`URL Match Mode: ${matchMode}, Path: ${context.path}, Query: ${context.query}, FullPath: ${fullPath}`);
    
    const pathMatches = rules.include_paths.some(pattern => {
      if (!pattern) return false;
      
      switch (matchMode) {
        case 'exact_path':
          // Exact path match - ignore query params, no wildcard support
          // /quang-cao-in/ matches only /quang-cao-in/ or /quang-cao-in
          const normalizedPath = normalizePath(context.path);
          const normalizedPattern = normalizePath(pattern.replace(/\*$/, '')); // Remove trailing * if present
          const exactMatch = normalizedPath === normalizedPattern;
          console.log(`exact_path: "${normalizedPath}" === "${normalizedPattern}" = ${exactMatch}`);
          return exactMatch;
          
        case 'path_prefix':
          // Path prefix match with wildcard support - ignores query params
          // /quang-cao-in/* matches /quang-cao-in/page1 but NOT /quang-cao-in/?utm=x
          if (pattern.endsWith('*')) {
            const basePattern = pattern.slice(0, -1); // Remove trailing *
            const prefixMatch = context.path.startsWith(basePattern);
            console.log(`path_prefix (wildcard): "${context.path}".startsWith("${basePattern}") = ${prefixMatch}`);
            return prefixMatch;
          }
          // Exact path match if no wildcard
          const pathPrefixNorm = normalizePath(context.path);
          const patternPrefixNorm = normalizePath(pattern);
          const pathPrefixMatch = pathPrefixNorm === patternPrefixNorm;
          console.log(`path_prefix (exact): "${pathPrefixNorm}" === "${patternPrefixNorm}" = ${pathPrefixMatch}`);
          return pathPrefixMatch;
          
        case 'full_url_prefix':
          // Full URL prefix match - includes query params
          // /quang-cao-in/* matches /quang-cao-in/?gclid=abc
          if (pattern.endsWith('*')) {
            const basePattern = pattern.slice(0, -1); // Remove trailing *
            const fullUrlMatch = fullPath.startsWith(basePattern);
            console.log(`full_url_prefix (wildcard): "${fullPath}".startsWith("${basePattern}") = ${fullUrlMatch}`);
            return fullUrlMatch;
          }
          // Exact full URL match if no wildcard
          const fullUrlExactMatch = fullPath === pattern || fullPath.startsWith(pattern + '?');
          console.log(`full_url_prefix (exact): "${fullPath}" matches "${pattern}" = ${fullUrlExactMatch}`);
          return fullUrlExactMatch;
          
        default:
          return false;
      }
    });
    
    if (!pathMatches) {
      console.log(`Path ${context.path} did not match any patterns with mode ${matchMode}: ${JSON.stringify(rules.include_paths)}`);
      return false;
    }
  }
  
  return true;
}

// Get country from IP using free ip-api.com service
async function getCountryFromIP(ip: string): Promise<string> {
  try {
    // Skip local/private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
      return 'US';
    }
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.countryCode) {
        console.log(`GeoIP: ${ip} -> ${data.countryCode}`);
        return data.countryCode;
      }
    }
  } catch (error) {
    console.warn('GeoIP lookup failed:', error);
  }
  
  return 'US'; // Default fallback
}

// Extract client IP from request headers
function getClientIP(req: Request): string {
  // Check various headers in order of priority
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  if (cfConnectingIP) return cfConnectingIP;
  
  const xRealIP = req.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;
  
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP in the chain (original client)
    return xForwardedFor.split(',')[0].trim();
  }
  
  return '127.0.0.1';
}

// Generate session ID based on visitor key and 30-minute window
async function generateSessionId(visitorKeyHash: string): Promise<string> {
  const sessionWindow = 30 * 60 * 1000; // 30 minutes in milliseconds
  const windowKey = Math.floor(Date.now() / sessionWindow).toString();
  return await hashString(visitorKeyHash + windowKey);
}

// Build final URL with path wildcard and query parameter handling
function buildFinalUrl(destinationUrl: string, path: string, originalQuery: string): string {
  let finalUrl = destinationUrl;
  
  if (!finalUrl) return '';
  
  try {
    // Handle path wildcard: if destination ends with /*, append visitor's path
    if (finalUrl.includes('/*')) {
      const baseUrl = finalUrl.replace('/*', '');
      const destUrl = new URL(baseUrl);
      const visitorPath = path.startsWith('/') ? path.slice(1) : path;
      destUrl.pathname = destUrl.pathname.replace(/\/$/, '') + '/' + visitorPath;
      finalUrl = destUrl.toString();
      console.log(`Path wildcard applied: ${destinationUrl} + ${path} -> ${finalUrl}`);
    }
    
    // Merge original query params into destination URL
    if (originalQuery) {
      const destUrl = new URL(finalUrl);
      const origParams = new URLSearchParams(originalQuery);
      
      origParams.forEach((value, key) => {
        // Don't override existing params in destination URL
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const visitorKey = url.searchParams.get('vk');
    const sessionKey = url.searchParams.get('sk') || ''; // Session key from client
    const path = url.searchParams.get('path') || '/';
    const lang = url.searchParams.get('lang') || 'en';
    const dnt = url.searchParams.get('dnt') === '1';
    const originalQuery = url.searchParams.get('oq') || '';
    
    // UTM parameters for session tracking
    const utmSource = url.searchParams.get('utm_source') || '';
    const utmMedium = url.searchParams.get('utm_medium') || '';
    const utmCampaign = url.searchParams.get('utm_campaign') || '';
    const gclid = url.searchParams.get('gclid') || '';
    const fbclid = url.searchParams.get('fbclid') || '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client with service role for edge function operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project by token
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
    const { device, browser, os } = parseUserAgent(userAgent);
    const referrer = req.headers.get('referer') || '';
    
    // Get country - first try Cloudflare header, then fallback to IP geolocation
    let country = req.headers.get('cf-ipcountry');
    if (!country || country === 'XX') {
      const clientIP = getClientIP(req);
      console.log(`No CF header, looking up IP: ${clientIP}`);
      country = await getCountryFromIP(clientIP);
    }
    
    // Context now includes path and query for URL matching
    const context = { country, device, browser, os, lang, path, query: originalQuery };
    console.log('Visitor context:', JSON.stringify(context));

    // Get active campaigns for this project with include_paths and url_match_mode in rules
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        id, sticky_enabled, respect_dnt,
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

    // Find matching campaign with path-based rules
    let matchedCampaign = null;
    for (const campaign of campaigns) {
      const rulesData = campaign.campaign_rules;
      const rules = Array.isArray(rulesData) 
        ? (rulesData[0] || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [], include_paths: [] })
        : (rulesData || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [], include_paths: [] });
      
      console.log(`Campaign ${campaign.id} rules:`, JSON.stringify(rules));
      console.log(`Checking match: country_in=${JSON.stringify(rules.country_in)}, include_paths=${JSON.stringify(rules.include_paths)}, visitor_path=${context.path}`);
      
      if (matchesRules(rules, context)) {
        console.log(`Campaign ${campaign.id} MATCHED`);
        matchedCampaign = campaign;
        break;
      } else {
        console.log(`Campaign ${campaign.id} NOT matched`);
      }
    }

    if (!matchedCampaign) {
      return new Response(JSON.stringify({ shouldRedirect: false, reason: 'no_matching_rules' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle DNT - assign variant but don't store
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

    // Generate or use visitor key
    const actualVisitorKey = visitorKey || crypto.randomUUID();
    const visitorKeyHash = await hashString(actualVisitorKey);
    
    // Generate session ID for deduplication (30-minute window)
    const sessionId = await generateSessionId(visitorKeyHash);
    console.log(`Session ID generated: ${sessionId.slice(0, 16)}...`);

    // === SESSION-BASED DEDUPLICATION ===
    // Check if we already have an assign event for this session
    const { data: existingAssign } = await supabase
      .from('events_raw')
      .select('variant_id')
      .eq('campaign_id', matchedCampaign.id)
      .eq('visitor_key_hash', visitorKeyHash)
      .eq('session_id', sessionId)
      .eq('event_type', 'assign')
      .maybeSingle();

    if (existingAssign) {
      // Return cached result without logging new event
      console.log(`Session already assigned to variant ${existingAssign.variant_id}, returning cached result`);
      const cachedVariant = matchedCampaign.variants.find((v: { id: string }) => v.id === existingAssign.variant_id);
      const cachedUrl = buildFinalUrl(cachedVariant?.destination_url || '', path, originalQuery);
      
      return new Response(JSON.stringify({
        shouldRedirect: true,
        url: cachedUrl,
        campaignId: matchedCampaign.id,
        variantId: existingAssign.variant_id,
        visitorKey: actualVisitorKey,
        cached: true, // Flag to tell client this is a cached response
        ttl: 86400,
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
      // Update last seen
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

      if (insertError) {
        console.error('Failed to create visitor:', insertError);
        visitorId = crypto.randomUUID();
      } else {
        visitorId = newVisitor.id;
      }
    }

    // Check for existing assignment if sticky enabled
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
        
        // Create assignment
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

    // Log assignment event with session_id for deduplication
    await supabase.from('events_raw').insert({
      project_id: project.id,
      campaign_id: matchedCampaign.id,
      variant_id: selectedVariantId,
      event_type: 'assign',
      country,
      device,
      browser,
      os,
      lang,
      visitor_key_hash: visitorKeyHash,
      session_id: sessionId,
      path,
      referrer: referrer.slice(0, 500),
      user_agent: userAgent.slice(0, 500),
    });

    // Create or update session record
    const fullSessionKey = sessionKey || sessionId;
    await supabase.from('sessions').upsert({
      project_id: project.id,
      visitor_key_hash: visitorKeyHash,
      session_key: fullSessionKey,
      entry_page: path,
      exit_page: path,
      country,
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
    }, {
      onConflict: 'project_id,session_key',
    });

    console.log(`New assign logged for session ${sessionId.slice(0, 16)}..., variant ${selectedVariantId}`);

    return new Response(JSON.stringify({
      shouldRedirect: true,
      url: finalUrl,
      campaignId: matchedCampaign.id,
      variantId: selectedVariantId,
      visitorKey: actualVisitorKey,
      sessionId: sessionId,
      cached: false,
      ttl: 86400, // 24 hours
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
