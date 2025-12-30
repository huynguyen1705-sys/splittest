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

// Check if targeting rules match
function matchesRules(
  rules: { country_in: string[]; device_in: string[]; browser_in: string[]; os_in: string[]; lang_in: string[] },
  context: { country: string; device: string; browser: string; os: string; lang: string }
): boolean {
  if (rules.country_in.length > 0 && !rules.country_in.includes(context.country)) return false;
  if (rules.device_in.length > 0 && !rules.device_in.includes(context.device)) return false;
  if (rules.browser_in.length > 0 && !rules.browser_in.includes(context.browser)) return false;
  if (rules.os_in.length > 0 && !rules.os_in.includes(context.os)) return false;
  if (rules.lang_in.length > 0 && !rules.lang_in.includes(context.lang)) return false;
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const visitorKey = url.searchParams.get('vk');
    const path = url.searchParams.get('path') || '/';
    const lang = url.searchParams.get('lang') || 'en';
    const dnt = url.searchParams.get('dnt') === '1';

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
    
    // Get country - first try Cloudflare header, then fallback to IP geolocation
    let country = req.headers.get('cf-ipcountry');
    if (!country || country === 'XX') {
      const clientIP = getClientIP(req);
      console.log(`No CF header, looking up IP: ${clientIP}`);
      country = await getCountryFromIP(clientIP);
    }
    
    const context = { country, device, browser, os, lang };
    console.log('Visitor context:', JSON.stringify(context));

    // Get active campaigns for this project
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        id, sticky_enabled, respect_dnt,
        variants (id, destination_url, weight, is_control),
        campaign_rules (country_in, device_in, browser_in, os_in, lang_in)
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
      // campaign_rules can be array or single object depending on Supabase query
      const rulesData = campaign.campaign_rules;
      const rules = Array.isArray(rulesData) 
        ? (rulesData[0] || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [] })
        : (rulesData || { country_in: [], device_in: [], browser_in: [], os_in: [], lang_in: [] });
      
      console.log(`Campaign ${campaign.id} rules:`, JSON.stringify(rules));
      console.log(`Checking match: country_in=${JSON.stringify(rules.country_in)}, visitor_country=${context.country}`);
      
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

    // Handle DNT
    if (matchedCampaign.respect_dnt && dnt) {
      // Assign variant but don't store
      const selectedVariantId = selectVariant(matchedCampaign.variants);
      const selectedVariant = matchedCampaign.variants.find((v: { id: string }) => v.id === selectedVariantId);
      
      return new Response(JSON.stringify({
        shouldRedirect: true,
        url: selectedVariant?.destination_url,
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
        // Continue without persistent visitor
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

    // Log assignment event
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
      path,
      user_agent: userAgent.slice(0, 500),
    });

    return new Response(JSON.stringify({
      shouldRedirect: true,
      url: selectedVariant?.destination_url,
      campaignId: matchedCampaign.id,
      variantId: selectedVariantId,
      visitorKey: actualVisitorKey,
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
