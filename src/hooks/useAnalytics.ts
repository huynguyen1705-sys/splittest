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

      const { data: events, error } = await supabase
        .from('events_raw')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('ts', startTime.toISOString())
        .order('ts', { ascending: true });

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

      (events || []).forEach((event) => {
        const eventType = event.event_type;
        
        if (eventType === 'assign') {
          analytics.totalAssigns++;
          if (event.variant_id) {
            if (!analytics.byVariant[event.variant_id]) {
              analytics.byVariant[event.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0 };
            }
            analytics.byVariant[event.variant_id].assigns++;
          }
          if (event.country) analytics.byCountry[event.country] = (analytics.byCountry[event.country] || 0) + 1;
          if (event.device) analytics.byDevice[event.device] = (analytics.byDevice[event.device] || 0) + 1;
          if (event.browser) analytics.byBrowser[event.browser] = (analytics.byBrowser[event.browser] || 0) + 1;
          if (event.os) analytics.byOS[event.os] = (analytics.byOS[event.os] || 0) + 1;
          if (event.lang) analytics.byLang[event.lang] = (analytics.byLang[event.lang] || 0) + 1;
        } else if (eventType === 'redirect_ok') {
          analytics.totalRedirectsOk++;
          if (event.variant_id && analytics.byVariant[event.variant_id]) {
            analytics.byVariant[event.variant_id].redirectsOk++;
          }
          if (event.time_to_redirect_ms) {
            totalTTR += event.time_to_redirect_ms;
            ttrCount++;
          }
        } else if (eventType === 'redirect_fail') {
          analytics.totalRedirectsFail++;
          if (event.variant_id && analytics.byVariant[event.variant_id]) {
            analytics.byVariant[event.variant_id].redirectsFail++;
          }
        }

        const tsKey = new Date(event.ts).toISOString().slice(0, timeRange === '1h' ? 16 : 13);
        if (!timeSeriesMap.has(tsKey)) timeSeriesMap.set(tsKey, { assigns: 0, redirectsOk: 0 });
        const ts = timeSeriesMap.get(tsKey)!;
        if (eventType === 'assign') ts.assigns++;
        if (eventType === 'redirect_ok') ts.redirectsOk++;
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
