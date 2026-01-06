import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { useAnalytics, useRealtimeEvents, TimeRangePreset, DateRange } from '@/hooks/useAnalytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Play, Pause, Activity, Users, CheckCircle, XCircle, Clock, Globe, Monitor, Chrome, Settings, Wifi, WifiOff, RefreshCw, Zap, TrendingUp, Percent, Share2, Link2, Megaphone, CalendarIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { CampaignStatus } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('24h');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(campaignId, timeRange, customRange);
  const { events: realtimeEvents, newEventCount, lastEventTime, isLive } = useRealtimeEvents(campaignId);
  const navigate = useNavigate();
  const [isSendingTestEvent, setIsSendingTestEvent] = useState(false);
  const [testEventType, setTestEventType] = useState<'assign' | 'redirect_ok' | 'redirect_fail'>('assign');

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

  const variantData = campaign.variants?.map((v, i) => ({
    name: v.name,
    assigns: analytics?.byVariant[v.id]?.assigns || 0,
    redirectsOk: analytics?.byVariant[v.id]?.redirectsOk || 0,
    color: COLORS[i % COLORS.length],
  })) || [];

  const countryData = Object.entries(analytics?.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const deviceData = Object.entries(analytics?.byDevice || {})
    .map(([name, value]) => ({ name, value }));

  const browserData = Object.entries(analytics?.byBrowser || {})
    .map(([name, value]) => ({ name, value }));

  // UTM data
  const utmSourceData = Object.entries(analytics?.byUtmSource || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name: name || 'Direct', value }));

  const utmMediumData = Object.entries(analytics?.byUtmMedium || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const utmCampaignData = Object.entries(analytics?.byUtmCampaign || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const referrerData = Object.entries(analytics?.byReferrer || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="traffic" className="text-xs sm:text-sm">Traffic Sources</TabsTrigger>
              <TabsTrigger value="realtime" className="relative text-xs sm:text-sm">
                Real-Time
                {newEventCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center">
                    {newEventCount > 9 ? '9+' : newEventCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="breakdown" className="text-xs sm:text-sm">Breakdown</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Select 
                value={timeRange} 
                onValueChange={(v) => {
                  setTimeRange(v as TimeRangePreset);
                  if (v !== 'custom') {
                    setCustomRange(undefined);
                  }
                }}
              >
                <SelectTrigger className="w-full sm:w-36 h-8 sm:h-9 text-xs sm:text-sm">
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
                        "h-8 sm:h-9 text-xs sm:text-sm justify-start text-left font-normal",
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
                        Raw: {analytics?.totalAssigns.toLocaleString() || 0}
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
                        tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      />
                      <YAxis className="text-xs" tick={{ fontSize: 10 }} width={35} />
                      <Tooltip 
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                        labelFormatter={(v) => new Date(v).toLocaleString()}
                      />
                      <Line type="monotone" dataKey="assigns" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Assignments" />
                      <Line type="monotone" dataKey="redirectsOk" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Redirects" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Variants */}
            <Card>
              <CardHeader>
                <CardTitle>Variant Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {variantData.map((variant, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: variant.color }} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{variant.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {variant.assigns} assignments
                          </span>
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
                  ))}
                </div>
              </CardContent>
            </Card>
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
                        const total = utmSourceData.reduce((s, x) => s + x.value, 0);
                        const percent = total > 0 ? (item.value / total) * 100 : 0;
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
                              <span className="text-muted-foreground">
                                {item.value} ({percent.toFixed(1)}%)
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
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={utmMediumData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {utmMediumData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
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
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={utmCampaignData} layout="vertical">
                        <XAxis type="number" className="text-xs" />
                        <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
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
                          <Badge variant="secondary" className="text-xs">
                            {item.value}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-6">
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
        </Tabs>
      </main>
    </div>
  );
}
