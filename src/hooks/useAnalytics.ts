import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AnalyticsData } from '@/types/database';

export type TimeRangePreset = '1h' | '24h' | '7d' | '30d' | 'custom';

export interface DateRange { from: Date; to: Date; }

const RANGE_MAP: Record<TimeRangePreset, string> = {
  '1h': '1h', '24h': '24h', '7d': '7d', '30d': '30d', custom: '24h',
};

export function useAnalytics(
  campaignId: string | undefined,
  timeRange: TimeRangePreset = '24h',
  customRange?: DateRange,
  excludeBots: boolean = false
) {
  return useQuery({
    queryKey: ['analytics', campaignId, timeRange, customRange?.from?.toISOString(), customRange?.to?.toISOString(), excludeBots],
    queryFn: async (): Promise<AnalyticsData> => {
      if (!campaignId) throw new Error('Campaign ID required');
      const range = RANGE_MAP[timeRange] || '24h';
      const params = new URLSearchParams({ range });
      if (excludeBots) params.set('excludeBots', '1');

      const { aggregates = [], recentEvents = [], sessionsData = [] } =
        await api.get<{ aggregates: any[]; recentEvents: any[]; sessionsData: any[] }>(
          `/analytics/full/${campaignId}?${params.toString()}`
        );

      const analytics: AnalyticsData = {
        totalAssigns: 0, totalRedirectsOk: 0, totalRedirectsFail: 0, avgTimeToRedirect: 0,
        uniqueVisitors: 0, uniqueSessions: 0, redirectSuccessRate: 0,
        byVariant: {}, byCountry: {}, byDevice: {}, byBrowser: {}, byOS: {}, byLang: {},
        byUtmSource: {}, byUtmMedium: {}, byUtmCampaign: {}, byReferrer: {},
        timeSeries: [],
        byCity: [], byRegion: [], byISP: [],
        networkType: { mobile: 0, fixed: 0 },
        proxyUsage: { proxy: 0, direct: 0 },
        byHour: {}, byEntryPage: [], byExitPage: [],
        trafficSources: {
          direct: { sessions: 0, visitors: 0 } as any,
          search: { sessions: 0, visitors: 0 } as any,
          social: { sessions: 0, visitors: 0 } as any,
          referral: { sessions: 0, visitors: 0 } as any,
          paid: { sessions: 0, visitors: 0 } as any,
        },
        topReferrers: [], heatmapData: {},
      };

      const visitorSet = new Set<string>();
      const sessionSet = new Set<string>();
      const utmSourceVisitors: Record<string, Set<string>> = {};
      const utmMediumVisitors: Record<string, Set<string>> = {};
      const utmCampaignVisitors: Record<string, Set<string>> = {};
      const referrerVisitors: Record<string, Set<string>> = {};
      const cityMap: Record<string, { sessions: number; visitors: Set<string>; country: string }> = {};
      const regionMap: Record<string, { sessions: number; visitors: Set<string>; country: string }> = {};
      const ispMap: Record<string, { sessions: number; isMobile: boolean }> = {};
      const hourMap: Record<number, number> = {};
      const heatmapMap: Record<number, Record<number, number>> = {};
      const entryPageMap: Record<string, { sessions: number; visitors: Set<string> }> = {};
      const exitPageMap: Record<string, { sessions: number; visitors: Set<string> }> = {};
      const trafficSourceVisitors = { direct: new Set<string>(), search: new Set<string>(), social: new Set<string>(), referral: new Set<string>(), paid: new Set<string>() };
      const trafficSourceSessions = { direct: 0, search: 0, social: 0, referral: 0, paid: 0 };
      const referrerDetailMap: Record<string, { sessions: number; visitors: Set<string>; category: string }> = {};
      let mobileCount = 0, fixedCount = 0, proxyCount = 0, directCount = 0;

      const categorizeReferrer = (referrer: string | null, utmSource: string | null, utmMedium: string | null, gclid: string | null, fbclid: string | null) => {
        if (gclid || fbclid || utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid') {
          return { category: 'paid', domain: utmSource || (gclid ? 'google' : fbclid ? 'facebook' : 'paid') };
        }
        if (!referrer) return { category: 'direct', domain: 'Direct' };
        let domain: string;
        try { domain = new URL(referrer).hostname.replace('www.', ''); } catch { domain = referrer; }
        const se = ['google','bing','yahoo','duckduckgo','baidu','yandex','ecosia','ask','aol'];
        if (se.some(s => domain.includes(s))) return { category: 'search', domain };
        const sn = ['facebook','twitter','instagram','linkedin','pinterest','tiktok','reddit','youtube','snapchat','whatsapp','t.co','fb.com','lnkd.in'];
        if (sn.some(s => domain.includes(s))) return { category: 'social', domain };
        return { category: 'referral', domain };
      };

      sessionsData.forEach((s: any) => {
        const vh = s.visitor_key_hash || '';
        const sk = s.session_key || s.id;
        if (vh) visitorSet.add(vh);
        if (sk) sessionSet.add(sk);

        if (s.city) {
          const k = `${s.city}|${s.country || 'Unknown'}`;
          if (!cityMap[k]) cityMap[k] = { sessions: 0, visitors: new Set(), country: s.country || 'Unknown' };
          cityMap[k].sessions++; if (vh) cityMap[k].visitors.add(vh);
        }
        if (s.region) {
          const k = `${s.region}|${s.country || 'Unknown'}`;
          if (!regionMap[k]) regionMap[k] = { sessions: 0, visitors: new Set(), country: s.country || 'Unknown' };
          regionMap[k].sessions++; if (vh) regionMap[k].visitors.add(vh);
        }
        if (s.isp) {
          if (!ispMap[s.isp]) ispMap[s.isp] = { sessions: 0, isMobile: s.is_mobile || false };
          ispMap[s.isp].sessions++;
        }
        if (s.is_mobile) mobileCount++; else fixedCount++;
        if (s.is_proxy) proxyCount++; else directCount++;
        if (s.started_at) {
          const dt = new Date(s.started_at);
          const h = dt.getHours(); const dow = dt.getDay();
          hourMap[h] = (hourMap[h] || 0) + 1;
          if (!heatmapMap[dow]) heatmapMap[dow] = {};
          heatmapMap[dow][h] = (heatmapMap[dow][h] || 0) + 1;
        }
        if (s.entry_page) {
          if (!entryPageMap[s.entry_page]) entryPageMap[s.entry_page] = { sessions: 0, visitors: new Set() };
          entryPageMap[s.entry_page].sessions++; if (vh) entryPageMap[s.entry_page].visitors.add(vh);
        }
        if (s.exit_page) {
          if (!exitPageMap[s.exit_page]) exitPageMap[s.exit_page] = { sessions: 0, visitors: new Set() };
          exitPageMap[s.exit_page].sessions++; if (vh) exitPageMap[s.exit_page].visitors.add(vh);
        }
        const { category, domain } = categorizeReferrer(s.referrer, s.utm_source, s.utm_medium, s.gclid, s.fbclid);
        trafficSourceSessions[category as keyof typeof trafficSourceSessions]++;
        if (vh) trafficSourceVisitors[category as keyof typeof trafficSourceVisitors].add(vh);
        if (domain && domain !== 'Direct') {
          if (!referrerDetailMap[domain]) referrerDetailMap[domain] = { sessions: 0, visitors: new Set(), category };
          referrerDetailMap[domain].sessions++; if (vh) referrerDetailMap[domain].visitors.add(vh);
        }

        let source = s.utm_source;
        if (!source && s.gclid) source = 'google';
        if (!source && s.fbclid) source = 'facebook';
        if (source) {
          if (!analytics.byUtmSource[source]) { analytics.byUtmSource[source] = { sessions: 0, uniqueVisitors: 0 }; utmSourceVisitors[source] = new Set(); }
          analytics.byUtmSource[source].sessions++; if (vh) utmSourceVisitors[source].add(vh);
        }
        if (s.utm_medium) {
          if (!analytics.byUtmMedium[s.utm_medium]) { analytics.byUtmMedium[s.utm_medium] = { sessions: 0, uniqueVisitors: 0 }; utmMediumVisitors[s.utm_medium] = new Set(); }
          analytics.byUtmMedium[s.utm_medium].sessions++; if (vh) utmMediumVisitors[s.utm_medium].add(vh);
        }
        if (s.utm_campaign) {
          if (!analytics.byUtmCampaign[s.utm_campaign]) { analytics.byUtmCampaign[s.utm_campaign] = { sessions: 0, uniqueVisitors: 0 }; utmCampaignVisitors[s.utm_campaign] = new Set(); }
          analytics.byUtmCampaign[s.utm_campaign].sessions++; if (vh) utmCampaignVisitors[s.utm_campaign].add(vh);
        }
        if (s.referrer) {
          let rd: string; try { rd = new URL(s.referrer).hostname.replace('www.', ''); } catch { rd = s.referrer; }
          if (!analytics.byReferrer[rd]) { analytics.byReferrer[rd] = { sessions: 0, uniqueVisitors: 0 }; referrerVisitors[rd] = new Set(); }
          analytics.byReferrer[rd].sessions++; if (vh) referrerVisitors[rd].add(vh);
        }
      });

      analytics.uniqueVisitors = visitorSet.size;
      analytics.uniqueSessions = sessionSet.size;
      Object.keys(utmSourceVisitors).forEach(k => analytics.byUtmSource[k].uniqueVisitors = utmSourceVisitors[k].size);
      Object.keys(utmMediumVisitors).forEach(k => analytics.byUtmMedium[k].uniqueVisitors = utmMediumVisitors[k].size);
      Object.keys(utmCampaignVisitors).forEach(k => analytics.byUtmCampaign[k].uniqueVisitors = utmCampaignVisitors[k].size);
      Object.keys(referrerVisitors).forEach(k => analytics.byReferrer[k].uniqueVisitors = referrerVisitors[k].size);

      analytics.byCity = Object.entries(cityMap).map(([k, d]) => { const [name] = k.split('|'); return { name, country: d.country, sessions: d.sessions, visitors: d.visitors.size }; }).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      analytics.byRegion = Object.entries(regionMap).map(([k, d]) => { const [name] = k.split('|'); return { name, country: d.country, sessions: d.sessions, visitors: d.visitors.size }; }).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      analytics.byISP = Object.entries(ispMap).map(([isp, d]) => ({ isp, sessions: d.sessions, isMobile: d.isMobile })).sort((a, b) => b.sessions - a.sessions).slice(0, 10);
      analytics.networkType = { mobile: mobileCount, fixed: fixedCount };
      analytics.proxyUsage = { proxy: proxyCount, direct: directCount };
      analytics.byHour = hourMap;
      analytics.byEntryPage = Object.entries(entryPageMap).map(([path, d]) => ({ path, sessions: d.sessions, visitors: d.visitors.size })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      analytics.byExitPage = Object.entries(exitPageMap).map(([path, d]) => ({ path, sessions: d.sessions, visitors: d.visitors.size })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      analytics.trafficSources = {
        direct: { sessions: trafficSourceSessions.direct, visitors: trafficSourceVisitors.direct.size },
        search: { sessions: trafficSourceSessions.search, visitors: trafficSourceVisitors.search.size },
        social: { sessions: trafficSourceSessions.social, visitors: trafficSourceVisitors.social.size },
        referral: { sessions: trafficSourceSessions.referral, visitors: trafficSourceVisitors.referral.size },
        paid: { sessions: trafficSourceSessions.paid, visitors: trafficSourceVisitors.paid.size },
      };
      analytics.topReferrers = Object.entries(referrerDetailMap).map(([domain, d]) => ({ domain, sessions: d.sessions, visitors: d.visitors.size, category: d.category })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      analytics.heatmapData = heatmapMap;

      let totalTTR = 0, ttrCount = 0;
      const tsMap = new Map<string, { assigns: number; redirectsOk: number; uniqueVisitors: number }>();

      aggregates.forEach((agg: any) => {
        analytics.totalAssigns += agg.assigns || 0;
        analytics.totalRedirectsOk += agg.redirects_ok || 0;
        analytics.totalRedirectsFail += agg.redirects_fail || 0;
        if (agg.avg_ttr_ms && agg.redirects_ok) { totalTTR += agg.avg_ttr_ms * agg.redirects_ok; ttrCount += agg.redirects_ok; }
        if (agg.variant_id) {
          const v = analytics.byVariant[agg.variant_id] ||= { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 };
          v.assigns += agg.assigns || 0; v.redirectsOk += agg.redirects_ok || 0; v.redirectsFail += agg.redirects_fail || 0; v.uniqueVisitors += agg.unique_visitors || 0;
        }
        const a = agg.assigns || 0;
        if (agg.country && a > 0) analytics.byCountry[agg.country] = (analytics.byCountry[agg.country] || 0) + a;
        if (agg.device && a > 0) analytics.byDevice[agg.device] = (analytics.byDevice[agg.device] || 0) + a;
        if (agg.browser && a > 0) analytics.byBrowser[agg.browser] = (analytics.byBrowser[agg.browser] || 0) + a;
        if (agg.os && a > 0) analytics.byOS[agg.os] = (analytics.byOS[agg.os] || 0) + a;
        if (agg.lang && a > 0) analytics.byLang[agg.lang] = (analytics.byLang[agg.lang] || 0) + a;
        const tsKey = timeRange === '1h' ? agg.minute_ts.slice(0, 16) : agg.minute_ts.slice(0, 13);
        const ts = tsMap.get(tsKey) || { assigns: 0, redirectsOk: 0, uniqueVisitors: 0 }; tsMap.set(tsKey, ts);
        ts.assigns += agg.assigns || 0; ts.redirectsOk += agg.redirects_ok || 0; ts.uniqueVisitors += agg.unique_visitors || 0;
      });

      recentEvents.forEach((ev: any) => {
        switch (ev.event_type) {
          case 'assign':
            analytics.totalAssigns++;
            if (ev.variant_id) { const v = analytics.byVariant[ev.variant_id] ||= { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 }; v.assigns++; }
            if (ev.country) analytics.byCountry[ev.country] = (analytics.byCountry[ev.country] || 0) + 1;
            if (ev.device) analytics.byDevice[ev.device] = (analytics.byDevice[ev.device] || 0) + 1;
            if (ev.browser) analytics.byBrowser[ev.browser] = (analytics.byBrowser[ev.browser] || 0) + 1;
            if (ev.os) analytics.byOS[ev.os] = (analytics.byOS[ev.os] || 0) + 1;
            if (ev.lang) analytics.byLang[ev.lang] = (analytics.byLang[ev.lang] || 0) + 1;
            break;
          case 'redirect_ok':
            analytics.totalRedirectsOk++;
            if (ev.variant_id) { const v = analytics.byVariant[ev.variant_id] ||= { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 }; v.redirectsOk++; }
            if (ev.time_to_redirect_ms) { totalTTR += ev.time_to_redirect_ms; ttrCount++; }
            break;
          case 'redirect_fail':
            analytics.totalRedirectsFail++;
            if (ev.variant_id) { const v = analytics.byVariant[ev.variant_id] ||= { assigns: 0, redirectsOk: 0, redirectsFail: 0, uniqueVisitors: 0 }; v.redirectsFail++; }
            break;
        }
        const tsKey = timeRange === '1h' ? ev.ts.slice(0, 16) : ev.ts.slice(0, 13);
        const ts = tsMap.get(tsKey) || { assigns: 0, redirectsOk: 0, uniqueVisitors: 0 }; tsMap.set(tsKey, ts);
        if (ev.event_type === 'assign') ts.assigns++;
        if (ev.event_type === 'redirect_ok') ts.redirectsOk++;
      });

      const totalRedirects = analytics.totalRedirectsOk + analytics.totalRedirectsFail;
      analytics.redirectSuccessRate = totalRedirects > 0 ? Math.round((analytics.totalRedirectsOk / totalRedirects) * 100) : 0;
      analytics.avgTimeToRedirect = ttrCount > 0 ? Math.round(totalTTR / ttrCount) : 0;
      analytics.timeSeries = Array.from(tsMap.entries()).map(([ts, d]) => ({ ts, ...d })).sort((a, b) => a.ts.localeCompare(b.ts));

      return analytics;
    },
    enabled: !!campaignId,
    refetchInterval: 10000,
  });
}

// Realtime events: poll every 5s (no websocket — keep simple)
export function useRealtimeEvents(campaignId: string | undefined) {
  const [events, setEvents] = useState<Array<{ id: string; event_type: string; ts: string; country: string | null; device: string | null; browser: string | null; variant_id: string | null; session_id: string | null }>>([]);
  const [newEventCount, setNewEventCount] = useState(0);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (newEventCount > 0) {
      const t = setTimeout(() => setNewEventCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [newEventCount]);

  useEffect(() => {
    if (!campaignId) return;
    let lastSeenId: string | null = null;
    let alive = true;

    const poll = async () => {
      try {
        const { data } = await api.get<{ data: any[] }>(`/analytics/realtime/${campaignId}`);
        if (!alive) return;
        setEvents(data);
        if (data.length) {
          setLastEventTime(new Date(data[0].ts));
          if (lastSeenId && data[0].id !== lastSeenId) {
            const newCount = data.findIndex(e => e.id === lastSeenId);
            setNewEventCount(prev => prev + (newCount > 0 ? newCount : 1));
            qc.invalidateQueries({ queryKey: ['analytics', campaignId] });
          }
          lastSeenId = data[0].id;
        }
        setIsLive(true);
      } catch { setIsLive(false); }
    };

    poll();
    const itv = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(itv); setIsLive(false); };
  }, [campaignId, qc]);

  return { events, newEventCount, lastEventTime, isLive };
}
