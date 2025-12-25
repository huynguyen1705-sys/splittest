import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsData } from '@/types/database';

export function useAnalytics(campaignId: string | undefined, timeRange: '1h' | '24h' | '7d' = '24h') {
  return useQuery({
    queryKey: ['analytics', campaignId, timeRange],
    queryFn: async (): Promise<AnalyticsData> => {
      if (!campaignId) throw new Error('Campaign ID required');

      const now = new Date();
      let startTime: Date;
      
      switch (timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      // Query aggregates_minute for pre-computed data
      const { data: aggregates, error } = await supabase
        .from('aggregates_minute')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('minute_ts', startTime.toISOString())
        .order('minute_ts', { ascending: true });

      if (error) throw error;

      const analytics: AnalyticsData = {
        totalAssigns: 0,
        totalRedirectsOk: 0,
        totalRedirectsFail: 0,
        avgTimeToRedirect: 0,
        byVariant: {},
        byCountry: {},
        byDevice: {},
        byBrowser: {},
        byOS: {},
        byLang: {},
        timeSeries: [],
      };

      let totalTTR = 0;
      let ttrCount = 0;
      const timeSeriesMap = new Map<string, { assigns: number; redirectsOk: number }>();

      (aggregates || []).forEach((agg) => {
        // Sum up totals
        analytics.totalAssigns += agg.assigns || 0;
        analytics.totalRedirectsOk += agg.redirects_ok || 0;
        analytics.totalRedirectsFail += agg.redirects_fail || 0;

        // Track TTR for weighted average
        if (agg.avg_ttr_ms && agg.redirects_ok) {
          totalTTR += agg.avg_ttr_ms * agg.redirects_ok;
          ttrCount += agg.redirects_ok;
        }

        // By variant
        if (agg.variant_id) {
          if (!analytics.byVariant[agg.variant_id]) {
            analytics.byVariant[agg.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0 };
          }
          analytics.byVariant[agg.variant_id].assigns += agg.assigns || 0;
          analytics.byVariant[agg.variant_id].redirectsOk += agg.redirects_ok || 0;
          analytics.byVariant[agg.variant_id].redirectsFail += agg.redirects_fail || 0;
        }

        // By dimensions (counting assigns)
        const assigns = agg.assigns || 0;
        if (agg.country && assigns > 0) {
          analytics.byCountry[agg.country] = (analytics.byCountry[agg.country] || 0) + assigns;
        }
        if (agg.device && assigns > 0) {
          analytics.byDevice[agg.device] = (analytics.byDevice[agg.device] || 0) + assigns;
        }
        if (agg.browser && assigns > 0) {
          analytics.byBrowser[agg.browser] = (analytics.byBrowser[agg.browser] || 0) + assigns;
        }
        if (agg.os && assigns > 0) {
          analytics.byOS[agg.os] = (analytics.byOS[agg.os] || 0) + assigns;
        }
        if (agg.lang && assigns > 0) {
          analytics.byLang[agg.lang] = (analytics.byLang[agg.lang] || 0) + assigns;
        }

        // Time series - group by hour or minute depending on range
        const tsKey = timeRange === '1h' 
          ? agg.minute_ts.slice(0, 16) // minute granularity
          : agg.minute_ts.slice(0, 13); // hour granularity
        
        if (!timeSeriesMap.has(tsKey)) {
          timeSeriesMap.set(tsKey, { assigns: 0, redirectsOk: 0 });
        }
        const ts = timeSeriesMap.get(tsKey)!;
        ts.assigns += agg.assigns || 0;
        ts.redirectsOk += agg.redirects_ok || 0;
      });

      analytics.avgTimeToRedirect = ttrCount > 0 ? Math.round(totalTTR / ttrCount) : 0;
      analytics.timeSeries = Array.from(timeSeriesMap.entries())
        .map(([ts, data]) => ({ ts, ...data }))
        .sort((a, b) => a.ts.localeCompare(b.ts));

      return analytics;
    },
    enabled: !!campaignId,
    refetchInterval: 30000,
  });
}

export function useRealtimeEvents(campaignId: string | undefined) {
  const [events, setEvents] = useState<Array<{
    id: string;
    event_type: string;
    ts: string;
    country: string | null;
    device: string | null;
    browser: string | null;
    variant_id: string | null;
  }>>([]);

  useEffect(() => {
    if (!campaignId) return;

    // Real-time events still need events_raw for live data
    const fetchRecent = async () => {
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      const { data } = await supabase
        .from('events_raw')
        .select('id, event_type, ts, country, device, browser, variant_id')
        .eq('campaign_id', campaignId)
        .gte('ts', sixtySecondsAgo)
        .order('ts', { ascending: false })
        .limit(50);
      
      if (data) setEvents(data);
    };

    fetchRecent();

    const channel = supabase
      .channel(`events-${campaignId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events_raw',
        filter: `campaign_id=eq.${campaignId}`,
      }, (payload) => {
        const newEvent = payload.new as typeof events[0];
        setEvents((prev) => {
          const cutoff = Date.now() - 60000;
          return [newEvent, ...prev].filter((e) => new Date(e.ts).getTime() > cutoff).slice(0, 100);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  return events;
}
