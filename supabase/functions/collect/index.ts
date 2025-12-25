import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, campaignId, variantId, type, timeToRedirectMs, errorMessage, visitorKeyHash, device, browser, os, lang, path } = body;

    if (!token || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate event type
    const validTypes = ['assign', 'redirect_ok', 'redirect_fail', 'goal'];
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid event type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project by token
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('publishable_token', token)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get country - try Cloudflare header first, then IP geolocation
    let country = req.headers.get('cf-ipcountry');
    if (!country || country === 'XX') {
      const clientIP = getClientIP(req);
      country = await getCountryFromIP(clientIP);
    }

    // Insert event
    const { error: insertError } = await supabase.from('events_raw').insert({
      project_id: project.id,
      campaign_id: campaignId || null,
      variant_id: variantId || null,
      event_type: type,
      time_to_redirect_ms: timeToRedirectMs || null,
      error_message: errorMessage || null,
      visitor_key_hash: visitorKeyHash || null,
      country: country || null,
      device: device || null,
      browser: browser || null,
      os: os || null,
      lang: lang || null,
      path: path || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
    });

    if (insertError) {
      console.error('Failed to insert event:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to record event' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Collect error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
