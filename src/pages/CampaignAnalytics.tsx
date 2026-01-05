import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { useAnalytics, useRealtimeEvents } from '@/hooks/useAnalytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Play, Pause, Activity, Users, CheckCircle, XCircle, Clock, Globe, Monitor, Chrome, Settings, Wifi, WifiOff, RefreshCw, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { CampaignStatus } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(campaignId, timeRange);
  const { events: realtimeEvents, newEventCount, lastEventTime, isLive } = useRealtimeEvents(campaignId);
  const navigate = useNavigate();
  const [isSendingTestEvent, setIsSendingTestEvent] = useState(false);

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

      const { error } = await supabase.from('events_raw').insert({
        project_id: projectId,
        campaign_id: campaignId,
        variant_id: randomVariant.id,
        event_type: 'assign',
        country: countries[Math.floor(Math.random() * countries.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        browser: browsers[Math.floor(Math.random() * browsers.length)],
        os: oses[Math.floor(Math.random() * oses.length)],
        lang: langs[Math.floor(Math.random() * langs.length)],
        path: '/test-event',
      });

      if (error) throw error;
      
      toast({ 
        title: 'Test event sent!', 
        description: `Assigned to ${randomVariant.name}`,
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/project/${projectId}`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold">{campaign.name}</h1>
                  <Badge variant={statusVariantMap[campaign.status as CampaignStatus]}>
                    {campaign.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {campaign.variants?.length || 0} variants
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/project/${projectId}/campaign/${campaignId}/edit`}>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </Link>
            {campaign.status === 'active' ? (
              <Button variant="outline" onClick={() => handleStatusChange('paused')} disabled={updateCampaign.isPending}>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
            ) : (
              <Button onClick={() => handleStatusChange('active')} disabled={updateCampaign.isPending}>
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        {/* Realtime Indicator */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
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
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm animate-in slide-in-from-left-2">
                <Activity className="w-3 h-3" />
                <span>+{newEventCount} new</span>
              </div>
            )}
            {lastEventTime && (
              <span className="text-xs text-muted-foreground">
                Last event: {lastEventTime.toLocaleTimeString()}
              </span>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestEvent}
            disabled={isSendingTestEvent}
          >
            <Zap className="w-4 h-4 mr-2" />
            {isSendingTestEvent ? 'Sending...' : 'Test Event'}
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="realtime" className="relative">
                Real-Time
                {newEventCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center">
                    {newEventCount > 9 ? '9+' : newEventCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
            </TabsList>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Assignments</p>
                      <p className="text-2xl font-bold">{analytics?.totalAssigns.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Successful</p>
                      <p className="text-2xl font-bold">{analytics?.totalRedirectsOk.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold">{analytics?.totalRedirectsFail.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-info" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. TTR</p>
                      <p className="text-2xl font-bold">{analytics?.avgTimeToRedirect || 0}ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Traffic Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-64" />
                ) : analytics?.timeSeries.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No data available for this time range
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics?.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="ts" 
                        className="text-xs"
                        tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
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
