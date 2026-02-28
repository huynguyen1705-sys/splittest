import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toCsvRow(obj: Record<string, unknown>, columns: string[]): string {
  return columns.map(col => {
    const val = obj[col];
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"` 
      : str;
  }).join(',');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { action, projectId, table } = await req.json();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'export') {
      // Export table data as CSV
      const validTables = ['events_raw', 'aggregates_minute', 'sessions'];
      if (!validTables.includes(table)) {
        return new Response(JSON.stringify({ error: 'Invalid table' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('project_id', projectId)
        .order(table === 'aggregates_minute' ? 'minute_ts' : table === 'sessions' ? 'started_at' : 'ts', { ascending: false })
        .limit(50000);

      if (error) throw error;

      if (!data || data.length === 0) {
        return new Response(JSON.stringify({ error: 'No data to export', count: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const columns = Object.keys(data[0]);
      const csvLines = [columns.join(',')];
      for (const row of data) {
        csvLines.push(toCsvRow(row, columns));
      }

      return new Response(csvLines.join('\n'), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${table}_${projectId}_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (action === 'compress') {
      // Compress aggregates_minute into aggregates_daily
      console.log(`Compressing minute aggregates to daily for project ${projectId}`);

      const { data: minuteData, error: minuteError } = await supabase
        .from('aggregates_minute')
        .select('*')
        .eq('project_id', projectId);

      if (minuteError) throw minuteError;
      if (!minuteData || minuteData.length === 0) {
        return new Response(JSON.stringify({ message: 'No minute aggregates to compress', compressed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Group by day + dimensions
      const dailyMap = new Map<string, {
        project_id: string; campaign_id: string; variant_id: string | null;
        day_ts: string; country: string | null; device: string | null;
        browser: string | null; os: string | null; lang: string | null;
        assigns: number; redirects_ok: number; redirects_fail: number;
        total_ttr_ms: number; ttr_count: number;
        unique_visitors: number; unique_sessions: number;
      }>();

      for (const row of minuteData) {
        const dayTs = row.minute_ts.split('T')[0];
        const key = [
          row.campaign_id, row.variant_id || 'null', dayTs,
          row.country || '', row.device || '', row.browser || '', row.os || '', row.lang || ''
        ].join('|');

        if (!dailyMap.has(key)) {
          dailyMap.set(key, {
            project_id: row.project_id,
            campaign_id: row.campaign_id,
            variant_id: row.variant_id,
            day_ts: dayTs,
            country: row.country,
            device: row.device,
            browser: row.browser,
            os: row.os,
            lang: row.lang,
            assigns: 0, redirects_ok: 0, redirects_fail: 0,
            total_ttr_ms: 0, ttr_count: 0,
            unique_visitors: 0, unique_sessions: 0,
          });
        }

        const agg = dailyMap.get(key)!;
        agg.assigns += row.assigns || 0;
        agg.redirects_ok += row.redirects_ok || 0;
        agg.redirects_fail += row.redirects_fail || 0;
        if (row.avg_ttr_ms && row.avg_ttr_ms > 0) {
          const count = (row.redirects_ok || 0) || 1;
          agg.total_ttr_ms += row.avg_ttr_ms * count;
          agg.ttr_count += count;
        }
        agg.unique_visitors += row.unique_visitors || 0;
        agg.unique_sessions += row.unique_sessions || 0;
      }

      const dailyRows = Array.from(dailyMap.values()).map(agg => ({
        project_id: agg.project_id,
        campaign_id: agg.campaign_id,
        variant_id: agg.variant_id,
        day_ts: agg.day_ts,
        country: agg.country,
        device: agg.device,
        browser: agg.browser,
        os: agg.os,
        lang: agg.lang,
        assigns: agg.assigns,
        redirects_ok: agg.redirects_ok,
        redirects_fail: agg.redirects_fail,
        avg_ttr_ms: agg.ttr_count > 0 ? Math.round(agg.total_ttr_ms / agg.ttr_count) : 0,
        unique_visitors: agg.unique_visitors,
        unique_sessions: agg.unique_sessions,
      }));

      // Insert in batches
      const batchSize = 500;
      for (let i = 0; i < dailyRows.length; i += batchSize) {
        const batch = dailyRows.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('aggregates_daily')
          .upsert(batch, { onConflict: 'project_id,campaign_id,day_ts' });
        if (insertError) {
          console.error('Failed to insert daily batch:', insertError);
          throw insertError;
        }
      }

      // Delete compressed minute data
      const { count: deletedCount, error: deleteError } = await supabase
        .from('aggregates_minute')
        .delete({ count: 'exact' })
        .eq('project_id', projectId);

      if (deleteError) {
        console.error('Failed to delete minute data:', deleteError);
        throw deleteError;
      }

      console.log(`Compressed ${minuteData.length} minute rows into ${dailyRows.length} daily rows, deleted ${deletedCount} minute rows`);

      return new Response(JSON.stringify({
        success: true,
        minuteRowsProcessed: minuteData.length,
        dailyRowsCreated: dailyRows.length,
        minuteRowsDeleted: deletedCount,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'cleanup') {
      // Delete old events_raw and sessions (keeping aggregates_daily as summary)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep last 7 days
      const cutoffIso = cutoffDate.toISOString();

      const { count: eventsDeleted } = await supabase
        .from('events_raw')
        .delete({ count: 'exact' })
        .eq('project_id', projectId)
        .lt('ts', cutoffIso);

      const { count: sessionsDeleted } = await supabase
        .from('sessions')
        .delete({ count: 'exact' })
        .eq('project_id', projectId)
        .lt('started_at', cutoffIso);

      return new Response(JSON.stringify({
        success: true,
        eventsDeleted: eventsDeleted || 0,
        sessionsDeleted: sessionsDeleted || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Export/archive error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
