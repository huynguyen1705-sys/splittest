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

    // Process all events up to 1 minute ago (to ensure events are fully written)
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60000);
    cutoff.setSeconds(0, 0);
    const cutoffIso = cutoff.toISOString();

    // Find the latest aggregated minute to avoid reprocessing
    const { data: latestAgg } = await supabase
      .from('aggregates_minute')
      .select('minute_ts')
      .order('minute_ts', { ascending: false })
      .limit(1);

    const lastAggregated = latestAgg?.[0]?.minute_ts;
    
    console.log(`Aggregating events from ${lastAggregated || 'beginning'} to ${cutoffIso}`);

    // Get all raw events that haven't been aggregated yet
    let query = supabase
      .from('events_raw')
      .select('*')
      .lt('ts', cutoffIso);
    
    if (lastAggregated) {
      query = query.gte('ts', lastAggregated);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('Failed to fetch events:', eventsError);
      throw eventsError;
    }

    if (!events || events.length === 0) {
      console.log('No events to aggregate');
      return new Response(JSON.stringify({ message: 'No events to aggregate' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${events.length} events to aggregate`);

    // Group events by minute, project, campaign, variant, and dimensions
    const aggregates = new Map<string, {
      project_id: string;
      campaign_id: string;
      variant_id: string | null;
      minute_ts: string;
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
      unique_visitor_hashes: Set<string>;
      unique_session_ids: Set<string>;
    }>();

    for (const event of events) {
      // Floor timestamp to minute
      const eventDate = new Date(event.ts);
      eventDate.setSeconds(0, 0);
      const minuteTs = eventDate.toISOString();

      // Create a composite key for grouping
      const key = [
        event.project_id,
        event.campaign_id || 'null',
        event.variant_id || 'null',
        minuteTs,
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
          minute_ts: minuteTs,
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
          unique_visitor_hashes: new Set(),
          unique_session_ids: new Set(),
        });
      }

      const agg = aggregates.get(key)!;

      // Track unique visitors and sessions
      if (event.visitor_key_hash) {
        agg.unique_visitor_hashes.add(event.visitor_key_hash);
      }
      if (event.session_id) {
        agg.unique_session_ids.add(event.session_id);
      }

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
        minute_ts: agg.minute_ts,
        country: agg.country,
        device: agg.device,
        browser: agg.browser,
        os: agg.os,
        lang: agg.lang,
        assigns: agg.assigns,
        redirects_ok: agg.redirects_ok,
        redirects_fail: agg.redirects_fail,
        avg_ttr_ms: agg.ttr_count > 0 ? Math.round(agg.total_ttr_ms / agg.ttr_count) : null,
        unique_visitors: agg.unique_visitor_hashes.size,
        unique_sessions: agg.unique_session_ids.size,
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

      console.log(`Inserted ${aggregateRows.length} aggregate rows with unique metrics`);
    }

    return new Response(JSON.stringify({
      success: true,
      cutoff: cutoffIso,
      eventsProcessed: events.length,
      aggregatesCreated: aggregateRows.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Aggregation error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
