import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { useAnalytics, useRealtimeEvents, TimeRangePreset, DateRange } from '@/hooks/useAnalytics';
import { useProject } from '@/hooks/useProjects';
import { useBotAnalytics, useApproveSession, useRejectSession, FlaggedSession } from '@/hooks/useBotAnalytics';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Play, Pause, Activity, Users, CheckCircle, XCircle, Clock, Globe, Monitor, Chrome, Settings, Wifi, WifiOff, RefreshCw, Zap, TrendingUp, Percent, Share2, Link2, Megaphone, CalendarIcon, Bot, ShieldAlert, AlertTriangle, MoreHorizontal, UserCheck, ShieldX, ShieldPlus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { CampaignStatus } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { calculateSignificance, analyticsToVariantStats, VariantStats, SignificanceResult } from '@/lib/statistics';
import { StatisticalSignificance, MultiVariantSignificanceSummary } from '@/components/StatisticalSignificance';
import { SplitTestResults, SplitTestSummaryBadge } from '@/components/SplitTestResults';
import { GeoBreakdown } from '@/components/GeoBreakdown';

const COLORS = ['hsl(239, 84%, 67%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(199, 89%, 48%)', 'hsl(280, 68%, 60%)'];

const statusVariantMap: Record<CampaignStatus, 'draft' | 'active' | 'paused' | 'completed'> = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
};

export default function CampaignAnalytics() {
  const { id: projectId, campaignId } = useParams<{ id: string; campaignId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: project } = useProject(projectId);
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('24h');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [excludeBots, setExcludeBots] = useState(false);
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(campaignId, timeRange, customRange, excludeBots);
  const { events: realtimeEvents, newEventCount, lastEventTime, isLive } = useRealtimeEvents(campaignId);
  const { data: botAnalytics, isLoading: botAnalyticsLoading } = useBotAnalytics(campaignId);
  const approveSession = useApproveSession();
  const rejectSession = useRejectSession();
  const navigate = useNavigate();
  const [isSendingTestEvent, setIsSendingTestEvent] = useState(false);
  const [testEventType, setTestEventType] = useState<'assign' | 'redirect_ok' | 'redirect_fail'>('assign');

  // Helper function to format date with project timezone
  const formatDateWithTimezone = (dateStr: string, options: Intl.DateTimeFormatOptions = {}) => {
    // Handle truncated ISO strings like "2026-01-07T15" or "2026-01-07T15:30"
    const fullDateStr = dateStr.length === 13 ? `${dateStr}:00:00` : dateStr.length === 16 ? `${dateStr}:00` : dateStr;
    const date = new Date(fullDateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const timezone = project?.timezone || 'UTC';
    try {
      return date.toLocaleString([], { ...options, timeZone: timezone });
    } catch {
      // Fallback if timezone is invalid
      return date.toLocaleString([], options);
    }
  };

  // Move useMemo hooks before any early returns to ensure consistent hook order
  const variantData = useMemo(() => {
    if (!campaign?.variants) return [];
    return campaign.variants.map((v, i) => ({
      id: v.id,
      name: v.name,
      isControl: v.is_control,
      assigns: analytics?.byVariant[v.id]?.assigns || 0,
      redirectsOk: analytics?.byVariant[v.id]?.redirectsOk || 0,
      redirectsFail: analytics?.byVariant[v.id]?.redirectsFail || 0,
      uniqueVisitors: analytics?.byVariant[v.id]?.uniqueVisitors || 0,
      color: COLORS[i % COLORS.length],
    }));
  }, [campaign?.variants, analytics?.byVariant]);

  // Calculate statistical significance
  const significanceData = useMemo(() => {
    if (!variantData || variantData.length < 2) return null;

    const controlIndex = variantData.findIndex(v => v.isControl);
    const actualControlIndex = controlIndex >= 0 ? controlIndex : 0;
    const control = variantData[actualControlIndex];

    if (!control) return null;

    const variantStats: VariantStats[] = variantData.map(v => 
      analyticsToVariantStats(v.id, v.name, {
        assigns: v.assigns,
        redirectsOk: v.redirectsOk,
        redirectsFail: v.redirectsFail,
        uniqueVisitors: v.uniqueVisitors,
      })
    );

    const controlStats = variantStats[actualControlIndex];
    
    const results = new Map<string, SignificanceResult>();
    variantStats.forEach((variant, index) => {
      if (index === actualControlIndex) return;
      results.set(variant.name, calculateSignificance(controlStats, variant));
    });

    return {
      controlStats,
      variantStats,
      results,
      controlName: control.name,
    };
  }, [variantData]);

  const handleTestEvent = async () => {
    if (!campaignId || !projectId || !campaign?.variants?.length) {
      toast({ title: 'Error', description: 'No variants available', variant: 'destructive' });
      return;
    }

    setIsSendingTestEvent(true);
    try {
      // Pick a random variant
      const randomVariant = campaign.variants[Math.floor(Math.random() * campaign.variants.length)];
      const countries = ['TH', 'VN', 'US', 'JP', 'SG'];
      const devices = ['desktop', 'mobile', 'tablet'];
      const browsers = ['chrome', 'safari', 'firefox', 'edge'];
      const oses = ['windows', 'macos', 'ios', 'android'];
      const langs = ['en', 'th', 'vi', 'ja'];

      const eventData: any = {
        project_id: projectId,
        campaign_id: campaignId,
        variant_id: randomVariant.id,
        event_type: testEventType,
        country: countries[Math.floor(Math.random() * countries.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        browser: browsers[Math.floor(Math.random() * browsers.length)],
        os: oses[Math.floor(Math.random() * oses.length)],
        lang: langs[Math.floor(Math.random() * langs.length)],
        path: '/test-event',
      };

      // Add time_to_redirect_ms for redirect events
      if (testEventType === 'redirect_ok') {
        eventData.time_to_redirect_ms = Math.floor(Math.random() * 500) + 50; // 50-550ms
      }
      
      // Add error message for failed redirects
      if (testEventType === 'redirect_fail') {
        eventData.error_message = 'Test error: simulated redirect failure';
      }

      const { error } = await supabase.from('events_raw').insert(eventData);

      if (error) throw error;
      
      const eventTypeLabels = {
        assign: 'Assignment',
        redirect_ok: 'Redirect Success',
        redirect_fail: 'Redirect Failed'
      };
      
      toast({ 
        title: `${eventTypeLabels[testEventType]} sent!`, 
        description: `Variant: ${randomVariant.name}`,
      });
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send test event', 
        variant: 'destructive' 
      });
    } finally {
      setIsSendingTestEvent(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleStatusChange = async (newStatus: 'active' | 'paused') => {
    if (!campaignId) return;
    await updateCampaign.mutateAsync({ id: campaignId, status: newStatus });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Campaign not found</h1>
          <Link to={`/project/${projectId}`}>
            <Button>Back to Project</Button>
          </Link>
        </div>
      </div>
    );
  }

  const countryData = Object.entries(analytics?.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const deviceData = Object.entries(analytics?.byDevice || {})
    .map(([name, value]) => ({ name, value }));

  const browserData = Object.entries(analytics?.byBrowser || {})
    .map(([name, value]) => ({ name, value }));

  // UTM data - now with sessions and uniqueVisitors
  const utmSourceData = Object.entries(analytics?.byUtmSource || {})
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 10)
    .map(([name, data]) => ({ name: name || 'Direct', sessions: data.sessions, uniqueVisitors: data.uniqueVisitors }));

  const utmMediumData = Object.entries(analytics?.byUtmMedium || {})
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 10)
    .map(([name, data]) => ({ name, sessions: data.sessions, uniqueVisitors: data.uniqueVisitors }));

  const utmCampaignData = Object.entries(analytics?.byUtmCampaign || {})
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 10)
    .map(([name, data]) => ({ name, sessions: data.sessions, uniqueVisitors: data.uniqueVisitors }));

  const referrerData = Object.entries(analytics?.byReferrer || {})
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 10)
    .map(([name, data]) => ({ name, sessions: data.sessions, uniqueVisitors: data.uniqueVisitors }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to={`/project/${projectId}`} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold text-sm sm:text-base truncate">{campaign.name}</h1>
                  <Badge variant={statusVariantMap[campaign.status as CampaignStatus]} className="flex-shrink-0">
                    {campaign.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {campaign.variants?.length || 0} variants
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Link to={`/project/${projectId}/campaign/${campaignId}/edit`}>
              <Button variant="outline" size="sm" className="h-8 sm:h-9">
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </Link>
            {campaign.status === 'active' ? (
              <Button variant="outline" size="sm" className="h-8 sm:h-9" onClick={() => handleStatusChange('paused')} disabled={updateCampaign.isPending}>
                <Pause className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Pause</span>
              </Button>
            ) : (
              <Button size="sm" className="h-8 sm:h-9" onClick={() => handleStatusChange('active')} disabled={updateCampaign.isPending}>
                <Play className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Start</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-4 sm:py-8">
        {/* Realtime Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className={`flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${
              isLive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
            }`}>
              {isLive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                  </span>
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Connecting...</span>
                </>
              )}
            </div>
            {newEventCount > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm animate-in slide-in-from-left-2">
                <Activity className="w-3 h-3" />
                <span>+{newEventCount}</span>
              </div>
            )}
            {lastEventTime && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Last: {lastEventTime.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={testEventType} onValueChange={(v) => setTestEventType(v as typeof testEventType)}>
              <SelectTrigger className="w-28 sm:w-36 h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assign">
                  <span className="flex items-center gap-2">
                    <Users className="w-3 h-3" />
                    Assign
                  </span>
                </SelectItem>
                <SelectItem value="redirect_ok">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-success" />
                    Redirect OK
                  </span>
                </SelectItem>
                <SelectItem value="redirect_fail">
                  <span className="flex items-center gap-2">
                    <XCircle className="w-3 h-3 text-destructive" />
                    Redirect Fail
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 sm:h-9"
              onClick={handleTestEvent}
              disabled={isSendingTestEvent}
            >
              <Zap className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{isSendingTestEvent ? 'Sending...' : 'Send'}</span>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
          {/* Time Range Selector - moved to top for mobile */}
          <div className="flex items-center gap-2 sm:hidden">
            <Select 
              value={timeRange} 
              onValueChange={(v) => {
                setTimeRange(v as TimeRangePreset);
                if (v !== 'custom') {
                  setCustomRange(undefined);
                }
              }}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {timeRange === 'custom' && (
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 text-xs justify-start text-left font-normal",
                      !customRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {customRange?.from ? (
                      customRange.to ? (
                        <>
                          {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d")}
                        </>
                      ) : (
                        format(customRange.from, "MMM d")
                      )
                    ) : (
                      <span>Pick dates</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    defaultMonth={customRange?.from}
                    selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setCustomRange({ from: range.from, to: range.to });
                        setDatePickerOpen(false);
                      } else if (range?.from) {
                        setCustomRange({ from: range.from, to: range.from });
                      }
                    }}
                    numberOfMonths={1}
                    disabled={(date) => date > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Scrollable tabs on mobile */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
              <TabsList className="inline-flex w-max sm:w-auto">
                <TabsTrigger value="overview" className="text-xs sm:text-sm px-2.5 sm:px-3">Overview</TabsTrigger>
                <TabsTrigger value="traffic" className="text-xs sm:text-sm px-2.5 sm:px-3">
                  <span className="sm:hidden">Traffic</span>
                  <span className="hidden sm:inline">Traffic Sources</span>
                </TabsTrigger>
                <TabsTrigger value="realtime" className="relative text-xs sm:text-sm px-2.5 sm:px-3">
                  Real-Time
                  {newEventCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center">
                      {newEventCount > 9 ? '9+' : newEventCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="breakdown" className="text-xs sm:text-sm px-2.5 sm:px-3">Breakdown</TabsTrigger>
                <TabsTrigger value="bot-traffic" className="text-xs sm:text-sm flex items-center gap-1 px-2.5 sm:px-3">
                  <Bot className="w-3 h-3" />
                  <span className="hidden sm:inline">Bot Traffic</span>
                  <span className="sm:hidden">Bot</span>
                  {(botAnalytics?.suspectedBotSessions || 0) > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-destructive/20 text-destructive rounded-full">
                      {botAnalytics?.suspectedBotSessions}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* Desktop time range selector */}
            <div className="hidden sm:flex items-center gap-2">
              <Select 
                value={timeRange} 
                onValueChange={(v) => {
                  setTimeRange(v as TimeRangePreset);
                  if (v !== 'custom') {
                    setCustomRange(undefined);
                  }
                }}
              >
                <SelectTrigger className="w-36 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              
              {timeRange === 'custom' && (
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 text-sm justify-start text-left font-normal",
                        !customRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customRange?.from ? (
                        customRange.to ? (
                          <>
                            {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(customRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span>Pick dates</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      defaultMonth={customRange?.from}
                      selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          setCustomRange({ from: range.from, to: range.to });
                          setDatePickerOpen(false);
                        } else if (range?.from) {
                          setCustomRange({ from: range.from, to: range.from });
                        }
                      }}
                      numberOfMonths={2}
                      disabled={(date) => date > new Date()}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <TabsContent value="overview" className="space-y-4 sm:space-y-6">
            {/* Bot Filter Toggle */}
            <div className="flex items-center justify-end gap-2">
              <div className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-lg">
                <Switch
                  id="exclude-bots"
                  checked={excludeBots}
                  onCheckedChange={setExcludeBots}
                />
                <Label htmlFor="exclude-bots" className="text-xs sm:text-sm cursor-pointer flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  Exclude Bot Traffic
                  {excludeBots && botAnalytics?.suspectedBotSessions ? (
                    <span className="text-muted-foreground">
                      (-{botAnalytics.suspectedBotSessions})
                    </span>
                  ) : null}
                </Label>
              </div>
            </div>

            {/* KPI Cards - Updated with Unique Visitors */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {/* Unique Visitors - Primary metric */}
              <Card className="border-primary/50">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">Unique Visitors</p>
                      <p className="text-lg sm:text-2xl font-bold">{analytics?.uniqueVisitors?.toLocaleString() || 0}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Assigns: {analytics?.totalAssigns.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Sessions */}
              <Card>
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-info" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">Sessions</p>
                      <p className="text-lg sm:text-2xl font-bold">{analytics?.uniqueSessions?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Redirect Success Rate */}
              <Card>
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                      <Percent className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-lg sm:text-2xl font-bold">{analytics?.redirectSuccessRate || 0}%</p>
                      <p className="text-[10px] text-muted-foreground">
                        {analytics?.totalRedirectsOk.toLocaleString() || 0} / {(analytics?.totalRedirectsOk || 0) + (analytics?.totalRedirectsFail || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Avg TTR */}
              <Card>
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">Avg. TTR</p>
                      <p className="text-lg sm:text-2xl font-bold">{analytics?.avgTimeToRedirect || 0}ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="text-base sm:text-lg">Traffic Over Time</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {analyticsLoading ? (
                  <Skeleton className="h-48 sm:h-64" />
                ) : analytics?.timeSeries.length === 0 ? (
                  <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No data available for this time range
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={analytics?.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="ts" 
                        className="text-xs"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatDateWithTimezone(v, { hour: '2-digit', minute: '2-digit' })}
                      />
                      <YAxis className="text-xs" tick={{ fontSize: 10 }} width={35} />
                      <Tooltip 
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                        labelFormatter={(v) => formatDateWithTimezone(v, { dateStyle: 'medium', timeStyle: 'short' })}
                      />
                      <Line type="monotone" dataKey="assigns" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Assignments" />
                      <Line type="monotone" dataKey="redirectsOk" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Redirects" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Variants Performance with Statistical Significance */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Variant Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Variant Performance</CardTitle>
                  <CardDescription>Traffic distribution and conversion rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {variantData.map((variant, i) => {
                      const conversionRate = variant.uniqueVisitors > 0 
                        ? ((variant.redirectsOk / variant.uniqueVisitors) * 100).toFixed(1) 
                        : '0.0';
                      return (
                        <div key={i} className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: variant.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{variant.name}</span>
                                  {variant.isControl && (
                                    <Badge variant="outline" className="text-[10px] px-1.5">Control</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-muted-foreground">
                                    {variant.assigns.toLocaleString()} assigns
                                  </span>
                                  <Badge variant="secondary" className="font-mono">
                                    {conversionRate}%
                                  </Badge>
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ 
                                    width: `${analytics?.totalAssigns ? (variant.assigns / analytics.totalAssigns) * 100 : 0}%`,
                                    backgroundColor: variant.color,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="ml-6 flex gap-4 text-xs text-muted-foreground">
                            <span>{variant.uniqueVisitors.toLocaleString()} visitors</span>
                            <span className="text-success">{variant.redirectsOk.toLocaleString()} OK</span>
                            {variant.redirectsFail > 0 && (
                              <span className="text-destructive">{variant.redirectsFail} failed</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Split Test Health - Replaces misleading A/B significance */}
              {variantData.length >= 2 ? (
                <SplitTestResults
                  variants={variantData}
                  totalAssigns={analytics?.totalAssigns || 0}
                />
              ) : (
                <Card className="flex items-center justify-center">
                  <CardContent className="py-12 text-center">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                    <p className="text-muted-foreground">
                      Need at least 2 variants to show split test health
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="realtime" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Activity className="w-5 h-5 text-success" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full animate-ping" />
                    </div>
                    <CardTitle>Live Events Feed</CardTitle>
                  </div>
                  <Badge variant="secondary" className="font-mono">
                    {realtimeEvents.length} events
                  </Badge>
                </div>
                <CardDescription>
                  Showing events from the last 10 minutes • Auto-updates in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {realtimeEvents.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-1">Waiting for events...</p>
                    <p className="text-sm">Install the snippet on your website and events will appear here in real-time</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                    {realtimeEvents.map((event, index) => {
                      const variant = campaign.variants?.find(v => v.id === event.variant_id);
                      return (
                        <div 
                          key={event.id} 
                          className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                            index === 0 ? 'bg-primary/5 border-primary/20 animate-in slide-in-from-top-2' : 'bg-muted/30 border-transparent'
                          }`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            event.event_type === 'redirect_ok' ? 'bg-success' :
                            event.event_type === 'redirect_fail' ? 'bg-destructive' :
                            event.event_type === 'assign' ? 'bg-primary' :
                            'bg-muted-foreground'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              <Badge variant={
                                event.event_type === 'redirect_ok' ? 'default' :
                                event.event_type === 'redirect_fail' ? 'destructive' :
                                'secondary'
                              } className="text-xs">
                                {event.event_type === 'redirect_ok' ? 'Redirect OK' :
                                 event.event_type === 'redirect_fail' ? 'Failed' :
                                 event.event_type === 'assign' ? 'Assigned' :
                                 event.event_type}
                              </Badge>
                              {variant && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                  {variant.name}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {[event.country, event.device, event.browser].filter(Boolean).join(' • ')}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                            {new Date(event.ts).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Traffic Sources Tab */}
          <TabsContent value="traffic" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* UTM Source */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="w-5 h-5" />
                    Traffic Source (utm_source)
                  </CardTitle>
                  <CardDescription>
                    Where your traffic comes from (Google, Facebook, etc.)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {utmSourceData.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground text-sm">No UTM data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use ?utm_source=google in your URLs
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {utmSourceData.map((item, i) => {
                        const total = utmSourceData.reduce((s, x) => s + x.sessions, 0);
                        const percent = total > 0 ? (item.sessions / total) * 100 : 0;
                        return (
                          <div key={item.name} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium flex items-center gap-2">
                                {item.name === 'google' && <span className="text-red-500">●</span>}
                                {item.name === 'facebook' && <span className="text-blue-500">●</span>}
                                {!['google', 'facebook'].includes(item.name) && (
                                  <span style={{ color: COLORS[i % COLORS.length] }}>●</span>
                                )}
                                {item.name}
                              </span>
                              <span className="text-muted-foreground flex items-center gap-2">
                                <span title="Sessions">{item.sessions} sessions</span>
                                <span className="text-xs text-primary" title="Unique Visitors">
                                  ({item.uniqueVisitors} visitors)
                                </span>
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${percent}%`,
                                  backgroundColor:
                                    item.name === 'google' ? '#ea4335' :
                                    item.name === 'facebook' ? '#1877f2' :
                                    COLORS[i % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* UTM Medium */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5" />
                    Medium (utm_medium)
                  </CardTitle>
                  <CardDescription>
                    How traffic reached you (cpc, social, email, etc.)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {utmMediumData.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground text-sm">No medium data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use ?utm_medium=cpc in your URLs
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {utmMediumData.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <span className="font-medium flex items-center gap-2">
                            <span style={{ color: COLORS[i % COLORS.length] }}>●</span>
                            {item.name}
                          </span>
                          <span className="text-muted-foreground flex items-center gap-2">
                            <span>{item.sessions} sessions</span>
                            <span className="text-xs text-primary">({item.uniqueVisitors} visitors)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* UTM Campaign */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Campaign (utm_campaign)
                  </CardTitle>
                  <CardDescription>
                    Which ad campaigns are driving traffic
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {utmCampaignData.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground text-sm">No campaign data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use ?utm_campaign=summer_sale in your URLs
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {utmCampaignData.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <span className="font-medium flex items-center gap-2">
                            <span style={{ color: COLORS[i % COLORS.length] }}>●</span>
                            {item.name}
                          </span>
                          <span className="text-muted-foreground flex items-center gap-2">
                            <span>{item.sessions} sessions</span>
                            <span className="text-xs text-primary">({item.uniqueVisitors} visitors)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Referrer Domains */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="w-5 h-5" />
                    Referrer Domains
                  </CardTitle>
                  <CardDescription>
                    Websites that linked to your page
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {referrerData.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground text-sm">No referrer data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Direct traffic doesn't have referrers
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {referrerData.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <span className="text-sm font-medium truncate flex-1 mr-2" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-muted-foreground flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-xs">
                              {item.sessions} sessions
                            </Badge>
                            <span className="text-xs text-primary">({item.uniqueVisitors} visitors)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-6">
            {/* Geographic Deep Dive */}
            <GeoBreakdown
              byCity={analytics?.byCity || []}
              byRegion={analytics?.byRegion || []}
              byISP={analytics?.byISP || []}
              networkType={analytics?.networkType || { mobile: 0, fixed: 0 }}
              proxyUsage={analytics?.proxyUsage || { proxy: 0, direct: 0 }}
              byHour={analytics?.byHour || {}}
              timezone={project?.timezone}
              byEntryPage={analytics?.byEntryPage || []}
              byExitPage={analytics?.byExitPage || []}
              trafficSources={analytics?.trafficSources}
              topReferrers={analytics?.topReferrers || []}
            />

            {/* Existing charts */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    By Country
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {countryData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={countryData} layout="vertical">
                        <XAxis type="number" className="text-xs" />
                        <YAxis type="category" dataKey="name" className="text-xs" width={40} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    By Device
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deviceData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={deviceData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {deviceData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Chrome className="w-5 h-5" />
                    By Browser
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {browserData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={browserData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {browserData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bot Traffic Tab */}
          <TabsContent value="bot-traffic" className="space-y-4 sm:space-y-6">
            {botAnalyticsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : (
              <>
                {/* Bot Traffic Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  <Card>
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-muted-foreground">Total Sessions</p>
                          <p className="text-lg sm:text-2xl font-bold">{botAnalytics?.totalSessions?.toLocaleString() || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={botAnalytics?.suspectedBotSessions ? 'border-destructive/50' : ''}>
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-muted-foreground">Suspected Bots</p>
                          <p className="text-lg sm:text-2xl font-bold text-destructive">
                            {botAnalytics?.suspectedBotSessions?.toLocaleString() || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                          <Percent className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-muted-foreground">Bot %</p>
                          <p className="text-lg sm:text-2xl font-bold">
                            {botAnalytics?.botPercentage?.toFixed(1) || 0}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-muted-foreground">Avg Bot Score</p>
                          <p className="text-lg sm:text-2xl font-bold">{botAnalytics?.avgBotScore || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Bot vs Human Traffic Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Bot vs Human Traffic Over Time
                    </CardTitle>
                    <CardDescription>
                      Comparison of bot and legitimate traffic patterns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!botAnalytics?.timeSeries?.length ? (
                      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                        No time series data available
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={botAnalytics.timeSeries}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis 
                            dataKey="ts" 
                            className="text-xs"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => formatDateWithTimezone(v, { weekday: 'short', hour: '2-digit' })}
                            interval="preserveStartEnd"
                          />
                          <YAxis className="text-xs" tick={{ fontSize: 10 }} width={35} />
                          <Tooltip 
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                            labelFormatter={(v) => formatDateWithTimezone(v, { dateStyle: 'medium', timeStyle: 'short' })}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="humans" 
                            stroke="hsl(var(--success))" 
                            strokeWidth={2} 
                            dot={false} 
                            name="Humans" 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="bots" 
                            stroke="hsl(var(--destructive))" 
                            strokeWidth={2} 
                            dot={false} 
                            name="Bots" 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Score Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Bot Score Distribution
                      </CardTitle>
                      <CardDescription>
                        Distribution of bot scores across all sessions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {botAnalytics?.scoreDistribution?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No data</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={botAnalytics?.scoreDistribution || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="range" />
                            <YAxis />
                            <Tooltip />
                            <Bar 
                              dataKey="count" 
                              fill="hsl(var(--primary))" 
                              radius={4}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  {/* Bot Signals Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5" />
                        Detection Signals
                      </CardTitle>
                      <CardDescription>
                        Which signals triggered bot detection
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {botAnalytics?.signalsBreakdown?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No bot signals detected</p>
                      ) : (
                        <div className="space-y-3">
                          {botAnalytics?.signalsBreakdown?.slice(0, 6).map((item) => (
                            <div key={item.signal} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{item.label}</span>
                                <span className="font-medium">{item.count}</span>
                              </div>
                              <Progress 
                                value={(item.count / (botAnalytics?.totalSessions || 1)) * 100} 
                                className="h-2"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Flagged Sessions Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      Flagged Sessions
                    </CardTitle>
                    <CardDescription>
                      Sessions with elevated bot scores (sorted by score)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {botAnalytics?.flaggedSessions?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No flagged sessions yet</p>
                        <p className="text-sm">Sessions with bot activity will appear here</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Score</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Visitor</TableHead>
                              <TableHead>Country</TableHead>
                              <TableHead>Device</TableHead>
                              <TableHead>Signals</TableHead>
                              <TableHead>Entry Page</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead className="w-10">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {botAnalytics?.flaggedSessions?.map((session) => (
                              <TableRow key={session.id} className={cn(
                                session.review_status === 'approved' && 'bg-green-500/5',
                                session.review_status === 'rejected' && 'bg-destructive/5'
                              )}>
                                <TableCell>
                                  <div className={cn(
                                    "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                    session.bot_score >= 70 
                                      ? "bg-destructive/20 text-destructive" 
                                      : session.bot_score >= 40 
                                      ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                                      : "bg-muted text-muted-foreground"
                                  )}>
                                    {session.bot_score}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {session.review_status === 'approved' ? (
                                    <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                                      <UserCheck className="w-3 h-3 mr-1" />
                                      Human
                                    </Badge>
                                  ) : session.review_status === 'rejected' ? (
                                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                                      <Bot className="w-3 h-3 mr-1" />
                                      Bot
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Pending
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {session.visitor_key_hash}
                                </TableCell>
                                <TableCell>{session.country || '-'}</TableCell>
                                <TableCell className="capitalize">{session.device || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {session.bot_signals && Object.entries(session.bot_signals)
                                      .filter(([, v]) => v === true)
                                      .slice(0, 3)
                                      .map(([key]) => (
                                        <Badge key={key} variant="outline" className="text-[10px]">
                                          {key}
                                        </Badge>
                                      ))
                                    }
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[150px] truncate text-xs">
                                  {session.entry_page || '/'}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {new Date(session.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8"
                                        disabled={approveSession.isPending || rejectSession.isPending}
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => approveSession.mutate({
                                          sessionId: session.session_id,
                                          campaignId: campaignId!,
                                          projectId: projectId!,
                                          visitorKeyHash: session.full_visitor_key_hash,
                                        })}
                                        className="text-green-600"
                                      >
                                        <UserCheck className="w-4 h-4 mr-2" />
                                        Approve as Human
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => approveSession.mutate({
                                          sessionId: session.session_id,
                                          campaignId: campaignId!,
                                          projectId: projectId!,
                                          visitorKeyHash: session.full_visitor_key_hash,
                                          addToWhitelist: true,
                                          whitelistType: 'ua',
                                          whitelistValue: session.browser || '',
                                        })}
                                        className="text-green-600"
                                      >
                                        <ShieldPlus className="w-4 h-4 mr-2" />
                                        Approve + Whitelist Browser
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => rejectSession.mutate({
                                          sessionId: session.session_id,
                                          campaignId: campaignId!,
                                          projectId: projectId!,
                                          visitorKeyHash: session.full_visitor_key_hash,
                                        })}
                                        className="text-destructive"
                                      >
                                        <ShieldX className="w-4 h-4 mr-2" />
                                        Confirm as Bot
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
