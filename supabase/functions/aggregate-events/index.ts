import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the current minute timestamp (floored to minute)
    const now = new Date();
    now.setSeconds(0, 0);
    
    // Process the previous minute to ensure all events are captured
    const minuteTs = new Date(now.getTime() - 60000);
    const minuteStart = minuteTs.toISOString();
    const minuteEnd = new Date(minuteTs.getTime() + 60000).toISOString();

    console.log(`Aggregating events from ${minuteStart} to ${minuteEnd}`);

    // Get all raw events for the target minute that haven't been aggregated yet
    const { data: events, error: eventsError } = await supabase
      .from('events_raw')
      .select('*')
      .gte('ts', minuteStart)
      .lt('ts', minuteEnd);

    if (eventsError) {
      console.error('Failed to fetch events:', eventsError);
      throw eventsError;
    }

    if (!events || events.length === 0) {
      console.log('No events to aggregate');
      return new Response(JSON.stringify({ message: 'No events to aggregate', minuteTs: minuteStart }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${events.length} events to aggregate`);

    // Group events by project, campaign, variant, and dimensions
    const aggregates = new Map<string, {
      project_id: string;
      campaign_id: string;
      variant_id: string | null;
      country: string | null;
      device: string | null;
      browser: string | null;
      os: string | null;
      lang: string | null;
      assigns: number;
      redirects_ok: number;
      redirects_fail: number;
      total_ttr_ms: number;
      ttr_count: number;
    }>();

    for (const event of events) {
      // Create a composite key for grouping
      const key = [
        event.project_id,
        event.campaign_id || 'null',
        event.variant_id || 'null',
        event.country || 'unknown',
        event.device || 'unknown',
        event.browser || 'unknown',
        event.os || 'unknown',
        event.lang || 'unknown',
      ].join('|');

      if (!aggregates.has(key)) {
        aggregates.set(key, {
          project_id: event.project_id,
          campaign_id: event.campaign_id,
          variant_id: event.variant_id,
          country: event.country,
          device: event.device,
          browser: event.browser,
          os: event.os,
          lang: event.lang,
          assigns: 0,
          redirects_ok: 0,
          redirects_fail: 0,
          total_ttr_ms: 0,
          ttr_count: 0,
        });
      }

      const agg = aggregates.get(key)!;

      switch (event.event_type) {
        case 'assign':
          agg.assigns += 1;
          break;
        case 'redirect_ok':
          agg.redirects_ok += 1;
          if (event.time_to_redirect_ms) {
            agg.total_ttr_ms += event.time_to_redirect_ms;
            agg.ttr_count += 1;
          }
          break;
        case 'redirect_fail':
          agg.redirects_fail += 1;
          break;
      }
    }

    // Insert or update aggregates
    const aggregateRows = Array.from(aggregates.values())
      .filter(agg => agg.campaign_id) // Only aggregate events with campaign_id
      .map(agg => ({
        project_id: agg.project_id,
        campaign_id: agg.campaign_id,
        variant_id: agg.variant_id,
        minute_ts: minuteStart,
        country: agg.country,
        device: agg.device,
        browser: agg.browser,
        os: agg.os,
        lang: agg.lang,
        assigns: agg.assigns,
        redirects_ok: agg.redirects_ok,
        redirects_fail: agg.redirects_fail,
        avg_ttr_ms: agg.ttr_count > 0 ? Math.round(agg.total_ttr_ms / agg.ttr_count) : null,
      }));

    if (aggregateRows.length > 0) {
      const { error: insertError } = await supabase
        .from('aggregates_minute')
        .upsert(aggregateRows, {
          onConflict: 'project_id,campaign_id,minute_ts,variant_id,country,device,browser,os,lang',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('Failed to insert aggregates:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${aggregateRows.length} aggregate rows`);
    }

    return new Response(JSON.stringify({
      success: true,
      minuteTs: minuteStart,
      eventsProcessed: events.length,
      aggregatesCreated: aggregateRows.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Aggregation error:', error);
    return new Response(JSON.stringify({ error: 'Aggregation failed', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
