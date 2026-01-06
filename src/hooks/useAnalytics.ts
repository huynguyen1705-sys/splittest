import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsData } from '@/types/database';

export function useAnalytics(campaignId: string | undefined, timeRange: '1h' | '24h' | '7d' = '24h') {
  const queryClient = useQueryClient();
  
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

      // Try aggregates_minute first for efficiency
      const { data: aggregates, error: aggError } = await supabase
        .from('aggregates_minute')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('minute_ts', startTime.toISOString())
        .order('minute_ts', { ascending: true });

      // Also get raw events for real-time data (last 5 minutes are most likely not aggregated)
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const { data: recentEvents, error: eventsError } = await supabase
        .from('events_raw')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('ts', fiveMinutesAgo.toISOString());

      const analytics: AnalyticsData = {
        totalAssigns: 0,
        totalRedirectsOk: 0,
        totalRedirectsFail: 0,
        avgTimeToRedirect: 0,
        uniqueVisitors: 0,
        uniqueSessions: 0,
        redirectSuccessRate: 0,
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
      const timeSeriesMap = new Map<string, { assigns: number; redirectsOk: number; uniqueVisitors: number }>();
      const processedMinutes = new Set<string>();
      
      // Track unique visitors and sessions across all data
      const allVisitorHashes = new Set<string>();
      const allSessionIds = new Set<string>();

      // Process aggregates (exclude last 5 minutes to avoid double counting)
      (aggregates || []).forEach((agg) => {
        const aggMinute = agg.minute_ts.slice(0, 16);
        if (new Date(agg.minute_ts) >= fiveMinutesAgo) {
          // Skip recent data - we'll get it from raw events
          return;
        }
        
        processedMinutes.add(aggMinute);
        
        // Sum up totals
        analytics.totalAssigns += agg.assigns || 0;
        analytics.totalRedirectsOk += agg.redirects_ok || 0;
        analytics.totalRedirectsFail += agg.redirects_fail || 0;
        
        // Sum unique metrics from aggregates
        analytics.uniqueVisitors += agg.unique_visitors || 0;
        analytics.uniqueSessions += agg.unique_sessions || 0;

        // Track TTR for weighted average
        if (agg.avg_ttr_ms && agg.redirects_ok) {
          totalTTR += agg.avg_ttr_ms * agg.redirects_ok;
          ttrCount += agg.redirects_ok;
        }

        // By variant
        if (agg.variant_id) {
          if (!analytics.byVariant[agg.variant_id]) {
            analytics.byVariant[agg.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 };
          }
          analytics.byVariant[agg.variant_id].assigns += agg.assigns || 0;
          analytics.byVariant[agg.variant_id].redirectsOk += agg.redirects_ok || 0;
          analytics.byVariant[agg.variant_id].redirectsFail += agg.redirects_fail || 0;
          analytics.byVariant[agg.variant_id].uniqueVisitors += agg.unique_visitors || 0;
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

        // Time series
        const tsKey = timeRange === '1h' 
          ? agg.minute_ts.slice(0, 16)
          : agg.minute_ts.slice(0, 13);
        
        if (!timeSeriesMap.has(tsKey)) {
          timeSeriesMap.set(tsKey, { assigns: 0, redirectsOk: 0, uniqueVisitors: 0 });
        }
        const ts = timeSeriesMap.get(tsKey)!;
        ts.assigns += agg.assigns || 0;
        ts.redirectsOk += agg.redirects_ok || 0;
        ts.uniqueVisitors += agg.unique_visitors || 0;
      });

      // Process recent raw events (for real-time display)
      (recentEvents || []).forEach((event) => {
        // Track unique visitors/sessions from recent events
        if (event.visitor_key_hash) {
          allVisitorHashes.add(event.visitor_key_hash);
        }
        if (event.session_id) {
          allSessionIds.add(event.session_id);
        }

        switch (event.event_type) {
          case 'assign':
            analytics.totalAssigns += 1;
            if (event.variant_id) {
              if (!analytics.byVariant[event.variant_id]) {
                analytics.byVariant[event.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 };
              }
              analytics.byVariant[event.variant_id].assigns += 1;
            }
            if (event.country) analytics.byCountry[event.country] = (analytics.byCountry[event.country] || 0) + 1;
            if (event.device) analytics.byDevice[event.device] = (analytics.byDevice[event.device] || 0) + 1;
            if (event.browser) analytics.byBrowser[event.browser] = (analytics.byBrowser[event.browser] || 0) + 1;
            if (event.os) analytics.byOS[event.os] = (analytics.byOS[event.os] || 0) + 1;
            if (event.lang) analytics.byLang[event.lang] = (analytics.byLang[event.lang] || 0) + 1;
            break;
          case 'redirect_ok':
            analytics.totalRedirectsOk += 1;
            if (event.variant_id) {
              if (!analytics.byVariant[event.variant_id]) {
                analytics.byVariant[event.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 };
              }
              analytics.byVariant[event.variant_id].redirectsOk += 1;
            }
            if (event.time_to_redirect_ms) {
              totalTTR += event.time_to_redirect_ms;
              ttrCount += 1;
            }
            break;
          case 'redirect_fail':
            analytics.totalRedirectsFail += 1;
            if (event.variant_id) {
              if (!analytics.byVariant[event.variant_id]) {
                analytics.byVariant[event.variant_id] = { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 };
              }
              analytics.byVariant[event.variant_id].redirectsFail += 1;
            }
            break;
        }

        // Add to time series
        const tsKey = timeRange === '1h' 
          ? event.ts.slice(0, 16)
          : event.ts.slice(0, 13);
        
        if (!timeSeriesMap.has(tsKey)) {
          timeSeriesMap.set(tsKey, { assigns: 0, redirectsOk: 0, uniqueVisitors: 0 });
        }
        const ts = timeSeriesMap.get(tsKey)!;
        if (event.event_type === 'assign') ts.assigns += 1;
        if (event.event_type === 'redirect_ok') ts.redirectsOk += 1;
      });

      // Add recent unique visitors/sessions to totals
      analytics.uniqueVisitors += allVisitorHashes.size;
      analytics.uniqueSessions += allSessionIds.size;

      // Calculate redirect success rate
      const totalRedirects = analytics.totalRedirectsOk + analytics.totalRedirectsFail;
      analytics.redirectSuccessRate = totalRedirects > 0 
        ? Math.round((analytics.totalRedirectsOk / totalRedirects) * 100) 
        : 0;

      analytics.avgTimeToRedirect = ttrCount > 0 ? Math.round(totalTTR / ttrCount) : 0;
      analytics.timeSeries = Array.from(timeSeriesMap.entries())
        .map(([ts, data]) => ({ ts, ...data }))
        .sort((a, b) => a.ts.localeCompare(b.ts));

      return analytics;
    },
    enabled: !!campaignId,
    refetchInterval: 10000, // Refresh every 10 seconds for more real-time feel
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
    session_id: string | null;
  }>>([]);
  const [newEventCount, setNewEventCount] = useState(0);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const queryClient = useQueryClient();

  // Reset new event count after 3 seconds
  useEffect(() => {
    if (newEventCount > 0) {
      const timer = setTimeout(() => setNewEventCount(0), 3000);
      return () => clearTimeout(timer);
    }
  }, [newEventCount]);

  useEffect(() => {
    if (!campaignId) return;

    // Real-time events still need events_raw for live data
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const fetchRecent = async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      const { data } = await supabase
        .from('events_raw')
        .select('id, event_type, ts, country, device, browser, variant_id, session_id')
        .eq('campaign_id', campaignId)
        .gte('ts', since)
        .order('ts', { ascending: false })
        .limit(200);
      
      if (data) {
        setEvents(data);
        if (data.length > 0) {
          setLastEventTime(new Date(data[0].ts));
        }
      }
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
          const cutoff = Date.now() - windowMs;
          return [newEvent, ...prev].filter((e) => new Date(e.ts).getTime() > cutoff).slice(0, 300);
        });
        setNewEventCount(prev => prev + 1);
        setLastEventTime(new Date(newEvent.ts));
        setIsLive(true);
        
        // Invalidate analytics to refresh stats
        queryClient.invalidateQueries({ queryKey: ['analytics', campaignId] });
      })
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => { 
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [campaignId, queryClient]);

  return { events, newEventCount, lastEventTime, isLive };
}
