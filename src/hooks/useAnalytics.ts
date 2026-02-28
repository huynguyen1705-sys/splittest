import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsData } from '@/types/database';

export type TimeRangePreset = '1h' | '24h' | '7d' | '30d' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

export function useAnalytics(
  campaignId: string | undefined, 
  timeRange: TimeRangePreset = '24h',
  customRange?: DateRange,
  excludeBots: boolean = false
) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['analytics', campaignId, timeRange, customRange?.from?.toISOString(), customRange?.to?.toISOString(), excludeBots],
    queryFn: async (): Promise<AnalyticsData> => {
      if (!campaignId) throw new Error('Campaign ID required');

      // Trigger on-demand aggregation (fire-and-forget, don't block UI)
      supabase.functions.invoke('aggregate-events').catch((err) => {
        console.warn('On-demand aggregation failed (non-blocking):', err);
      });

      const now = new Date();
      let startTime: Date;
      let endTime: Date = now;
      
      if (timeRange === 'custom' && customRange) {
        startTime = customRange.from;
        endTime = customRange.to;
      } else {
        switch (timeRange) {
          case '1h':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '7d':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
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

      // Fetch sessions data for unique visitors/sessions, UTM attribution, and geo breakdown
      let sessionsQuery = supabase
        .from('sessions')
        .select('id, utm_source, utm_medium, utm_campaign, gclid, fbclid, referrer, visitor_key_hash, is_bot_suspected, session_key, city, region, country, isp, is_mobile, is_proxy, started_at, entry_page, exit_page')
        .eq('campaign_id', campaignId)
        .gte('started_at', startTime.toISOString())
        .lte('started_at', endTime.toISOString());
      
      if (excludeBots) {
        sessionsQuery = sessionsQuery.or('is_bot_suspected.is.null,is_bot_suspected.eq.false');
      }
      
      const { data: sessionsData } = await sessionsQuery;

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
        byUtmSource: {},
        byUtmMedium: {},
        byUtmCampaign: {},
        byReferrer: {},
        timeSeries: [],
        // Geo breakdown
        byCity: [],
        byRegion: [],
        byISP: [],
        networkType: { mobile: 0, fixed: 0 },
        proxyUsage: { proxy: 0, direct: 0 },
        // Time of day
        byHour: {},
        // Entry/Exit pages
        byEntryPage: [],
        byExitPage: [],
        // Traffic sources
        trafficSources: {
          direct: { sessions: 0, visitors: new Set() as unknown as number },
          search: { sessions: 0, visitors: new Set() as unknown as number },
          social: { sessions: 0, visitors: new Set() as unknown as number },
          referral: { sessions: 0, visitors: new Set() as unknown as number },
          paid: { sessions: 0, visitors: new Set() as unknown as number },
        },
        topReferrers: [],
        heatmapData: {},
      };

      // Track unique visitors and sessions directly from sessions table (most accurate)
      const globalVisitorHashes = new Set<string>();
      const globalSessionKeys = new Set<string>();
      
      // Track unique visitors per UTM dimension
      const utmSourceVisitors: Record<string, Set<string>> = {};
      const utmMediumVisitors: Record<string, Set<string>> = {};
      const utmCampaignVisitors: Record<string, Set<string>> = {};
      const referrerVisitors: Record<string, Set<string>> = {};

      // Geo breakdown tracking
      const cityMap: Record<string, { sessions: number; visitors: Set<string>; country: string }> = {};
      const regionMap: Record<string, { sessions: number; visitors: Set<string>; country: string }> = {};
      const ispMap: Record<string, { sessions: number; isMobile: boolean }> = {};
      const hourMap: Record<number, number> = {}; // hour -> count
      const heatmapMap: Record<number, Record<number, number>> = {}; // day -> hour -> count
      const entryPageMap: Record<string, { sessions: number; visitors: Set<string> }> = {};
      const exitPageMap: Record<string, { sessions: number; visitors: Set<string> }> = {};
      // Traffic source tracking
      const trafficSourceVisitors = {
        direct: new Set<string>(),
        search: new Set<string>(),
        social: new Set<string>(),
        referral: new Set<string>(),
        paid: new Set<string>(),
      };
      const trafficSourceSessions = { direct: 0, search: 0, social: 0, referral: 0, paid: 0 };
      const referrerDetailMap: Record<string, { sessions: number; visitors: Set<string>; category: string }> = {};
      let mobileCount = 0;
      let fixedCount = 0;
      let proxyCount = 0;
      let directCount = 0;

      // Process sessions data - calculate global unique visitors/sessions AND UTM attribution
      (sessionsData || []).forEach((session) => {
        const visitorHash = session.visitor_key_hash || '';
        const sessionKey = session.session_key || session.id;
        
        // Track global unique visitors and sessions
        if (visitorHash) globalVisitorHashes.add(visitorHash);
        if (sessionKey) globalSessionKeys.add(sessionKey);

        // Geo breakdown
        if (session.city) {
          const cityKey = `${session.city}|${session.country || 'Unknown'}`;
          if (!cityMap[cityKey]) {
            cityMap[cityKey] = { sessions: 0, visitors: new Set(), country: session.country || 'Unknown' };
          }
          cityMap[cityKey].sessions++;
          if (visitorHash) cityMap[cityKey].visitors.add(visitorHash);
        }

        if (session.region) {
          const regionKey = `${session.region}|${session.country || 'Unknown'}`;
          if (!regionMap[regionKey]) {
            regionMap[regionKey] = { sessions: 0, visitors: new Set(), country: session.country || 'Unknown' };
          }
          regionMap[regionKey].sessions++;
          if (visitorHash) regionMap[regionKey].visitors.add(visitorHash);
        }

        if (session.isp) {
          if (!ispMap[session.isp]) {
            ispMap[session.isp] = { sessions: 0, isMobile: session.is_mobile || false };
          }
          ispMap[session.isp].sessions++;
        }

        // Network type
        if (session.is_mobile) {
          mobileCount++;
        } else {
          fixedCount++;
        }

        // Proxy usage
        if (session.is_proxy) {
          proxyCount++;
        } else {
          directCount++;
        }

        // Time of day analysis
        if (session.started_at) {
          const date = new Date(session.started_at);
          const hour = date.getHours();
          const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
          
          hourMap[hour] = (hourMap[hour] || 0) + 1;
          
          // Heatmap data
          if (!heatmapMap[dayOfWeek]) {
            heatmapMap[dayOfWeek] = {};
          }
          heatmapMap[dayOfWeek][hour] = (heatmapMap[dayOfWeek][hour] || 0) + 1;
        }

        // Entry page tracking
        if (session.entry_page) {
          if (!entryPageMap[session.entry_page]) {
            entryPageMap[session.entry_page] = { sessions: 0, visitors: new Set() };
          }
          entryPageMap[session.entry_page].sessions++;
          if (visitorHash) entryPageMap[session.entry_page].visitors.add(visitorHash);
        }

        // Exit page tracking
        if (session.exit_page) {
          if (!exitPageMap[session.exit_page]) {
            exitPageMap[session.exit_page] = { sessions: 0, visitors: new Set() };
          }
          exitPageMap[session.exit_page].sessions++;
          if (visitorHash) exitPageMap[session.exit_page].visitors.add(visitorHash);
        }

        // Traffic source categorization
        const categorizeReferrer = (referrer: string | null, utmSource: string | null, utmMedium: string | null, gclid: string | null, fbclid: string | null): { category: string; domain: string } => {
          // Paid traffic detection
          if (gclid || fbclid || utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid') {
            return { category: 'paid', domain: utmSource || (gclid ? 'google' : fbclid ? 'facebook' : 'paid') };
          }

          if (!referrer) {
            return { category: 'direct', domain: 'Direct' };
          }

          let domain: string;
          try {
            domain = new URL(referrer).hostname.replace('www.', '');
          } catch {
            domain = referrer;
          }

          // Search engines
          const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'ecosia', 'ask', 'aol'];
          if (searchEngines.some(se => domain.includes(se))) {
            return { category: 'search', domain };
          }

          // Social media
          const socialNetworks = ['facebook', 'twitter', 'instagram', 'linkedin', 'pinterest', 'tiktok', 'reddit', 'youtube', 'snapchat', 'whatsapp', 't.co', 'fb.com', 'lnkd.in'];
          if (socialNetworks.some(sn => domain.includes(sn))) {
            return { category: 'social', domain };
          }

          return { category: 'referral', domain };
        };

        const { category, domain } = categorizeReferrer(session.referrer, session.utm_source, session.utm_medium, session.gclid, session.fbclid);
        
        // Track traffic source category
        trafficSourceSessions[category as keyof typeof trafficSourceSessions]++;
        if (visitorHash) {
          trafficSourceVisitors[category as keyof typeof trafficSourceVisitors].add(visitorHash);
        }

        // Track detailed referrer
        if (domain && domain !== 'Direct') {
          if (!referrerDetailMap[domain]) {
            referrerDetailMap[domain] = { sessions: 0, visitors: new Set(), category };
          }
          referrerDetailMap[domain].sessions++;
          if (visitorHash) referrerDetailMap[domain].visitors.add(visitorHash);
        }
        
        // Determine UTM source
        let source = session.utm_source;
        if (!source && session.gclid) source = 'google';
        if (!source && session.fbclid) source = 'facebook';
        
        if (source) {
          if (!analytics.byUtmSource[source]) {
            analytics.byUtmSource[source] = { sessions: 0, uniqueVisitors: 0 };
            utmSourceVisitors[source] = new Set();
          }
          analytics.byUtmSource[source].sessions += 1;
          if (visitorHash) utmSourceVisitors[source].add(visitorHash);
        }
        
        if (session.utm_medium) {
          if (!analytics.byUtmMedium[session.utm_medium]) {
            analytics.byUtmMedium[session.utm_medium] = { sessions: 0, uniqueVisitors: 0 };
            utmMediumVisitors[session.utm_medium] = new Set();
          }
          analytics.byUtmMedium[session.utm_medium].sessions += 1;
          if (visitorHash) utmMediumVisitors[session.utm_medium].add(visitorHash);
        }
        
        if (session.utm_campaign) {
          if (!analytics.byUtmCampaign[session.utm_campaign]) {
            analytics.byUtmCampaign[session.utm_campaign] = { sessions: 0, uniqueVisitors: 0 };
            utmCampaignVisitors[session.utm_campaign] = new Set();
          }
          analytics.byUtmCampaign[session.utm_campaign].sessions += 1;
          if (visitorHash) utmCampaignVisitors[session.utm_campaign].add(visitorHash);
        }
        
        if (session.referrer) {
          let refDomain: string;
          try {
            refDomain = new URL(session.referrer).hostname.replace('www.', '');
          } catch {
            refDomain = session.referrer;
          }
          if (!analytics.byReferrer[refDomain]) {
            analytics.byReferrer[refDomain] = { sessions: 0, uniqueVisitors: 0 };
            referrerVisitors[refDomain] = new Set();
          }
          analytics.byReferrer[refDomain].sessions += 1;
          if (visitorHash) referrerVisitors[refDomain].add(visitorHash);
        }
      });
      
      // Set global unique counts from sessions table (most accurate source of truth)
      analytics.uniqueVisitors = globalVisitorHashes.size;
      analytics.uniqueSessions = globalSessionKeys.size;

      // Calculate unique visitors counts
      Object.keys(utmSourceVisitors).forEach(key => {
        analytics.byUtmSource[key].uniqueVisitors = utmSourceVisitors[key].size;
      });
      Object.keys(utmMediumVisitors).forEach(key => {
        analytics.byUtmMedium[key].uniqueVisitors = utmMediumVisitors[key].size;
      });
      Object.keys(utmCampaignVisitors).forEach(key => {
        analytics.byUtmCampaign[key].uniqueVisitors = utmCampaignVisitors[key].size;
      });
      Object.keys(referrerVisitors).forEach(key => {
        analytics.byReferrer[key].uniqueVisitors = referrerVisitors[key].size;
      });

      // Build geo breakdown arrays (sorted by sessions desc)
      analytics.byCity = Object.entries(cityMap)
        .map(([key, data]) => {
          const [name] = key.split('|');
          return { name, country: data.country, sessions: data.sessions, visitors: data.visitors.size };
        })
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      analytics.byRegion = Object.entries(regionMap)
        .map(([key, data]) => {
          const [name] = key.split('|');
          return { name, country: data.country, sessions: data.sessions, visitors: data.visitors.size };
        })
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      analytics.byISP = Object.entries(ispMap)
        .map(([isp, data]) => ({ isp, sessions: data.sessions, isMobile: data.isMobile }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10);

      analytics.networkType = { mobile: mobileCount, fixed: fixedCount };
      analytics.proxyUsage = { proxy: proxyCount, direct: directCount };
      analytics.byHour = hourMap;

      // Build entry/exit page arrays
      analytics.byEntryPage = Object.entries(entryPageMap)
        .map(([path, data]) => ({ path, sessions: data.sessions, visitors: data.visitors.size }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      analytics.byExitPage = Object.entries(exitPageMap)
        .map(([path, data]) => ({ path, sessions: data.sessions, visitors: data.visitors.size }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      // Build traffic sources summary
      analytics.trafficSources = {
        direct: { sessions: trafficSourceSessions.direct, visitors: trafficSourceVisitors.direct.size },
        search: { sessions: trafficSourceSessions.search, visitors: trafficSourceVisitors.search.size },
        social: { sessions: trafficSourceSessions.social, visitors: trafficSourceVisitors.social.size },
        referral: { sessions: trafficSourceSessions.referral, visitors: trafficSourceVisitors.referral.size },
        paid: { sessions: trafficSourceSessions.paid, visitors: trafficSourceVisitors.paid.size },
      };

      analytics.topReferrers = Object.entries(referrerDetailMap)
        .map(([domain, data]) => ({ domain, sessions: data.sessions, visitors: data.visitors.size, category: data.category }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      analytics.heatmapData = heatmapMap;

      let totalTTR = 0;
      let ttrCount = 0;
      const timeSeriesMap = new Map<string, { assigns: number; redirectsOk: number; uniqueVisitors: number }>();
      const processedMinutes = new Set<string>();

      // Process aggregates (exclude last 5 minutes to avoid double counting)
      (aggregates || []).forEach((agg) => {
        const aggMinute = agg.minute_ts.slice(0, 16);
        if (new Date(agg.minute_ts) >= fiveMinutesAgo) {
          // Skip recent data - we'll get it from raw events
          return;
        }
        
        processedMinutes.add(aggMinute);
        
        // Sum up totals (event counts, NOT unique counts - those come from sessions table)
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

      // Process recent raw events (for real-time display - event counts only, unique counts already from sessions)
      (recentEvents || []).forEach((event) => {
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
