const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, token } = await req.json();

    if (!url || !token) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL and token are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Validating snippet on:', formattedUrl);

    // Fetch the website HTML
    const response = await fetch(formattedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SplitFlowValidator/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          installed: false,
          error: `Failed to fetch website: ${response.status} ${response.statusText}` 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    
    // Check for various indicators of the snippet being installed
    const checks = {
      tokenFound: html.includes(token),
      sfVkFound: html.includes('sf_vk'),
      edgeAssignFound: html.includes('edge-assign'),
      splitFlowFound: html.includes('SplitFlow') || html.includes('splitflow'),
    };

    const installed = checks.tokenFound && (checks.sfVkFound || checks.edgeAssignFound);
    
    // Determine snippet version/type
    let snippetType = null;
    if (installed) {
      if (html.includes('sendBeacon')) {
        snippetType = 'full';
      } else if (html.includes('DOMContentLoaded')) {
        snippetType = 'async';
      } else {
        snippetType = 'minimal';
      }
    }

    // Check if snippet is in <head>
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const inHead = headMatch ? headMatch[1].includes(token) : false;

    console.log('Validation result:', { installed, checks, snippetType, inHead });

    return new Response(
      JSON.stringify({ 
        success: true,
        installed,
        checks,
        snippetType,
        inHead,
        recommendations: !installed ? [
          !checks.tokenFound && 'Token not found - make sure you copied the correct snippet',
          !checks.edgeAssignFound && 'Edge assign endpoint not found - snippet may be incomplete',
        ].filter(Boolean) : (
          !inHead ? ['Snippet should be placed in <head> for best performance'] : []
        ),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error validating snippet:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        installed: false,
        error: error instanceof Error ? error.message : 'Failed to validate' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
