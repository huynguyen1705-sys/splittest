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

    console.log('Starting data cleanup job...');

    // Get all projects with their retention settings
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, data_retention_days');

    if (projectsError) {
      console.error('Failed to fetch projects:', projectsError);
      throw projectsError;
    }

    if (!projects || projects.length === 0) {
      console.log('No projects found');
      return new Response(JSON.stringify({ message: 'No projects to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ projectId: string; projectName: string; eventsDeleted: number; aggregatesDeleted: number }> = [];

    for (const project of projects) {
      const retentionDays = project.data_retention_days || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffIso = cutoffDate.toISOString();

      console.log(`Processing project ${project.name}: retention=${retentionDays} days, cutoff=${cutoffIso}`);

      // Delete old events_raw
      const { count: eventsCount, error: eventsError } = await supabase
        .from('events_raw')
        .delete({ count: 'exact' })
        .eq('project_id', project.id)
        .lt('ts', cutoffIso);

      if (eventsError) {
        console.error(`Failed to delete events for project ${project.id}:`, eventsError);
      }

      // Delete old aggregates_minute
      const { count: aggregatesCount, error: aggregatesError } = await supabase
        .from('aggregates_minute')
        .delete({ count: 'exact' })
        .eq('project_id', project.id)
        .lt('minute_ts', cutoffIso);

      if (aggregatesError) {
        console.error(`Failed to delete aggregates for project ${project.id}:`, aggregatesError);
      }

      results.push({
        projectId: project.id,
        projectName: project.name,
        eventsDeleted: eventsCount || 0,
        aggregatesDeleted: aggregatesCount || 0,
      });

      console.log(`Project ${project.name}: deleted ${eventsCount || 0} events, ${aggregatesCount || 0} aggregates`);
    }

    const totalEventsDeleted = results.reduce((sum, r) => sum + r.eventsDeleted, 0);
    const totalAggregatesDeleted = results.reduce((sum, r) => sum + r.aggregatesDeleted, 0);

    // Cleanup expired geo cache entries
    const { count: geoCacheDeleted, error: geoCacheError } = await supabase
      .from('geo_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (geoCacheError) {
      console.error('Failed to cleanup geo_cache:', geoCacheError);
    } else {
      console.log(`Cleaned up ${geoCacheDeleted || 0} expired geo cache entries`);
    }

    console.log(`Cleanup complete: ${totalEventsDeleted} events, ${totalAggregatesDeleted} aggregates, ${geoCacheDeleted || 0} geo cache entries deleted`);

    return new Response(JSON.stringify({
      success: true,
      projectsProcessed: projects.length,
      totalEventsDeleted,
      totalAggregatesDeleted,
      geoCacheDeleted: geoCacheDeleted || 0,
      details: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cleanup job error:', error);
    return new Response(JSON.stringify({ error: 'Cleanup failed', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
