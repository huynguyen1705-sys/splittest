import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeoData {
  country: string;
  region: string | null;
  city: string | null;
  district: string | null;
  zip: string | null;
  isp: string | null;
  is_mobile: boolean;
  is_proxy: boolean;
  lat: number | null;
  lon: number | null;
}

// Hash IP for privacy and cache lookup
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'geo-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Get full geo data from IP with caching
async function getGeoDataFromIP(ip: string, supabase: any): Promise<GeoData> {
  const defaultGeo: GeoData = {
    country: 'US',
    region: null,
    city: null,
    district: null,
    zip: null,
    isp: null,
    is_mobile: false,
    is_proxy: false,
    lat: null,
    lon: null,
  };

  try {
    // Skip local/private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
      return defaultGeo;
    }

    const ipHash = await hashIP(ip);

    // Check cache first
    const { data: cached } = await supabase
      .from('geo_cache')
      .select('*')
      .eq('ip_hash', ipHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log(`GeoIP cache hit: ${ip.slice(0, 8)}... -> ${cached.city}, ${cached.country}`);
      return {
        country: cached.country || 'US',
        region: cached.region,
        city: cached.city,
        district: cached.district,
        zip: cached.zip,
        isp: cached.isp,
        is_mobile: cached.is_mobile || false,
        is_proxy: cached.is_proxy || false,
        lat: cached.lat,
        lon: cached.lon,
      };
    }

    // Call ip-api.com with full fields
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,countryCode,regionName,city,district,zip,lat,lon,isp,mobile,proxy`,
      { signal: AbortSignal.timeout(2000) }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success') {
        const geoData: GeoData = {
          country: data.countryCode || 'US',
          region: data.regionName || null,
          city: data.city || null,
          district: data.district || null,
          zip: data.zip || null,
          isp: data.isp || null,
          is_mobile: data.mobile || false,
          is_proxy: data.proxy || false,
          lat: data.lat || null,
          lon: data.lon || null,
        };

        console.log(`GeoIP: ${ip.slice(0, 8)}... -> ${geoData.city}, ${geoData.region}, ${geoData.country}`);

        // Cache the result (upsert to handle race conditions)
        await supabase.from('geo_cache').upsert({
          ip_hash: ipHash,
          country: geoData.country,
          region: geoData.region,
          city: geoData.city,
          district: geoData.district,
          zip: geoData.zip,
          isp: geoData.isp,
          is_mobile: geoData.is_mobile,
          is_proxy: geoData.is_proxy,
          lat: geoData.lat,
          lon: geoData.lon,
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h TTL
        }, { onConflict: 'ip_hash' });

        return geoData;
      }
    }
  } catch (error) {
    console.warn('GeoIP lookup failed:', error);
  }
  
  return defaultGeo;
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

    // Get geo data - try Cloudflare headers first, then full lookup
    const clientIP = getClientIP(req);
    let geoData: GeoData;
    
    const cfCountry = req.headers.get('cf-ipcountry');
    const cfCity = req.headers.get('cf-ipcity'); // Only available on Cloudflare Enterprise
    
    if (cfCountry && cfCountry !== 'XX' && cfCity) {
      // Use Cloudflare data if available
      geoData = {
        country: cfCountry,
        region: null,
        city: cfCity,
        district: null,
        zip: null,
        isp: null,
        is_mobile: false,
        is_proxy: false,
        lat: null,
        lon: null,
      };
      console.log(`CF GeoIP: ${cfCity}, ${cfCountry}`);
    } else {
      // Fall back to ip-api.com with caching
      console.log(`No CF header, looking up IP: ${clientIP}`);
      geoData = await getGeoDataFromIP(clientIP, supabase);
    }

    // Insert event with full geo data
    const { error: insertError } = await supabase.from('events_raw').insert({
      project_id: project.id,
      campaign_id: campaignId || null,
      variant_id: variantId || null,
      event_type: type,
      time_to_redirect_ms: timeToRedirectMs || null,
      error_message: errorMessage || null,
      visitor_key_hash: visitorKeyHash || null,
      country: geoData.country,
      city: geoData.city,
      region: geoData.region,
      district: geoData.district,
      zip: geoData.zip,
      isp: geoData.isp,
      is_mobile: geoData.is_mobile,
      is_proxy: geoData.is_proxy,
      lat: geoData.lat,
      lon: geoData.lon,
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
