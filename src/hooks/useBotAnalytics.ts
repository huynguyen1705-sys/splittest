import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BotSignals, BotReviewItem } from '@/types/database';

export interface BotAnalyticsData {
  totalSessions: number;
  suspectedBotSessions: number;
  botPercentage: number;
  avgBotScore: number;
  scoreDistribution: { range: string; count: number }[];
  signalsBreakdown: { signal: string; count: number; label: string }[];
  actionsTaken: { action: string; count: number }[];
  flaggedSessions: FlaggedSession[];
}

export interface FlaggedSession {
  id: string;
  visitor_key_hash: string;
  bot_score: number;
  bot_signals: BotSignals | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  created_at: string;
  entry_page: string | null;
  user_agent?: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  webdriver: 'WebDriver Detected',
  noPlugins: 'No Browser Plugins',
  knownBotUA: 'Known Bot User-Agent',
  suspiciousUA: 'Suspicious User-Agent',
  rateLimitExceeded: 'Rate Limit Exceeded',
  missingHeaders: 'Missing HTTP Headers',
  datacenterIP: 'Datacenter IP',
  automationProps: 'Automation Properties',
};

export function useBotAnalytics(campaignId: string | undefined) {
  return useQuery<BotAnalyticsData>({
    queryKey: ['bot-analytics', campaignId],
    queryFn: async () => {
      if (!campaignId) throw new Error('No campaign ID');

      // Fetch all sessions for this campaign with bot data
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, visitor_key_hash, bot_score, bot_signals, is_bot_suspected, country, device, browser, started_at, entry_page')
        .eq('campaign_id', campaignId)
        .order('started_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const allSessions = sessions || [];
      const totalSessions = allSessions.length;
      const suspectedSessions = allSessions.filter(s => s.is_bot_suspected);
      const suspectedBotSessions = suspectedSessions.length;
      const botPercentage = totalSessions > 0 ? (suspectedBotSessions / totalSessions) * 100 : 0;

      // Calculate average bot score
      const scoresSum = allSessions.reduce((sum, s) => sum + (s.bot_score || 0), 0);
      const avgBotScore = totalSessions > 0 ? Math.round(scoresSum / totalSessions) : 0;

      // Score distribution
      const scoreRanges = [
        { range: '0-20', min: 0, max: 20, count: 0 },
        { range: '21-40', min: 21, max: 40, count: 0 },
        { range: '41-60', min: 41, max: 60, count: 0 },
        { range: '61-80', min: 61, max: 80, count: 0 },
        { range: '81-100', min: 81, max: 100, count: 0 },
      ];

      allSessions.forEach(s => {
        const score = s.bot_score || 0;
        const range = scoreRanges.find(r => score >= r.min && score <= r.max);
        if (range) range.count++;
      });

      const scoreDistribution = scoreRanges.map(r => ({ range: r.range, count: r.count }));

      // Signals breakdown
      const signalCounts: Record<string, number> = {};
      allSessions.forEach(s => {
        if (s.bot_signals && typeof s.bot_signals === 'object') {
          const signals = s.bot_signals as BotSignals;
          Object.entries(signals).forEach(([key, value]) => {
            if (value === true) {
              signalCounts[key] = (signalCounts[key] || 0) + 1;
            }
          });
        }
      });

      const signalsBreakdown = Object.entries(signalCounts)
        .map(([signal, count]) => ({
          signal,
          count,
          label: SIGNAL_LABELS[signal] || signal,
        }))
        .sort((a, b) => b.count - a.count);

      // Flagged sessions (top 50 with highest scores)
      const flaggedSessions: FlaggedSession[] = allSessions
        .filter(s => (s.bot_score || 0) > 0)
        .sort((a, b) => (b.bot_score || 0) - (a.bot_score || 0))
        .slice(0, 50)
        .map(s => ({
          id: s.id,
          visitor_key_hash: s.visitor_key_hash?.slice(0, 12) + '...',
          bot_score: s.bot_score || 0,
          bot_signals: s.bot_signals as BotSignals | null,
          country: s.country,
          device: s.device,
          browser: s.browser,
          created_at: s.started_at || new Date().toISOString(),
          entry_page: s.entry_page,
        }));

      // Actions taken (from review queue)
      const { data: reviewData } = await supabase
        .from('bot_review_queue')
        .select('review_status')
        .eq('campaign_id', campaignId);

      const actionCounts: Record<string, number> = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      (reviewData || []).forEach(r => {
        if (r.review_status) {
          actionCounts[r.review_status] = (actionCounts[r.review_status] || 0) + 1;
        }
      });

      const actionsTaken = Object.entries(actionCounts)
        .filter(([, count]) => count > 0)
        .map(([action, count]) => ({ action, count }));

      return {
        totalSessions,
        suspectedBotSessions,
        botPercentage,
        avgBotScore,
        scoreDistribution,
        signalsBreakdown,
        actionsTaken,
        flaggedSessions,
      };
    },
    enabled: !!campaignId,
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useBotReviewQueue(campaignId: string | undefined) {
  return useQuery<BotReviewItem[]>({
    queryKey: ['bot-review-queue', campaignId],
    queryFn: async () => {
      if (!campaignId) throw new Error('No campaign ID');

      const { data, error } = await supabase
        .from('bot_review_queue')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as BotReviewItem[];
    },
    enabled: !!campaignId,
  });
}
