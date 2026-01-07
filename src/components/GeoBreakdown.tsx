import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Globe, MapPin, Building2, Wifi, WifiOff, ShieldAlert, Server, Clock, LogIn, LogOut, Search, Share2, Link2, DollarSign, MousePointerClick, CalendarDays } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { GeoBreakdownItem, ISPBreakdownItem } from '@/types/database';

const COLORS = ['hsl(239, 84%, 67%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(199, 89%, 48%)', 'hsl(280, 68%, 60%)'];

interface PageBreakdownItem {
  path: string;
  sessions: number;
  visitors: number;
}

interface TrafficSources {
  direct: { sessions: number; visitors: number };
  search: { sessions: number; visitors: number };
  social: { sessions: number; visitors: number };
  referral: { sessions: number; visitors: number };
  paid: { sessions: number; visitors: number };
}

interface ReferrerItem {
  domain: string;
  sessions: number;
  visitors: number;
  category: string;
}

interface GeoBreakdownProps {
  byCity: GeoBreakdownItem[];
  byRegion: GeoBreakdownItem[];
  byISP: ISPBreakdownItem[];
  networkType: { mobile: number; fixed: number };
  proxyUsage: { proxy: number; direct: number };
  byHour: Record<number, number>;
  timezone?: string;
  byEntryPage?: PageBreakdownItem[];
  byExitPage?: PageBreakdownItem[];
  trafficSources?: TrafficSources;
  topReferrers?: ReferrerItem[];
  heatmapData?: Record<number, Record<number, number>>;
}

export function GeoBreakdown({ 
  byCity, byRegion, byISP, networkType, proxyUsage, byHour, timezone, 
  byEntryPage = [], byExitPage = [],
  trafficSources = { direct: { sessions: 0, visitors: 0 }, search: { sessions: 0, visitors: 0 }, social: { sessions: 0, visitors: 0 }, referral: { sessions: 0, visitors: 0 }, paid: { sessions: 0, visitors: 0 } },
  topReferrers = [],
  heatmapData = {}
}: GeoBreakdownProps) {
  const totalNetwork = networkType.mobile + networkType.fixed;
  const mobilePercent = totalNetwork > 0 ? Math.round((networkType.mobile / totalNetwork) * 100) : 0;
  const fixedPercent = 100 - mobilePercent;

  const totalProxy = proxyUsage.proxy + proxyUsage.direct;
  const proxyPercent = totalProxy > 0 ? Math.round((proxyUsage.proxy / totalProxy) * 100) : 0;

  const networkData = [
    { name: 'Mobile', value: networkType.mobile },
    { name: 'Fixed', value: networkType.fixed },
  ].filter(d => d.value > 0);

  const regionChartData = byRegion.slice(0, 8).map(r => ({
    name: r.name,
    sessions: r.sessions,
  }));

  const cityChartData = byCity.slice(0, 8).map(c => ({
    name: c.name,
    sessions: c.sessions,
  }));

  // Build hour data for all 24 hours
  const hourChartData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    sessions: byHour[hour] || 0,
  }));

  const maxHourSessions = Math.max(...hourChartData.map(h => h.sessions), 1);
  const peakHours = hourChartData
    .filter(h => h.sessions > maxHourSessions * 0.7)
    .map(h => h.label);

  const hasHourData = Object.keys(byHour).length > 0;

  // Traffic sources data
  const totalTraffic = trafficSources.direct.sessions + trafficSources.search.sessions + 
    trafficSources.social.sessions + trafficSources.referral.sessions + trafficSources.paid.sessions;
  
  const trafficSourceData = [
    { name: 'Direct', sessions: trafficSources.direct.sessions, visitors: trafficSources.direct.visitors, icon: MousePointerClick, color: 'hsl(var(--muted-foreground))' },
    { name: 'Search', sessions: trafficSources.search.sessions, visitors: trafficSources.search.visitors, icon: Search, color: 'hsl(239, 84%, 67%)' },
    { name: 'Social', sessions: trafficSources.social.sessions, visitors: trafficSources.social.visitors, icon: Share2, color: 'hsl(280, 68%, 60%)' },
    { name: 'Referral', sessions: trafficSources.referral.sessions, visitors: trafficSources.referral.visitors, icon: Link2, color: 'hsl(160, 84%, 39%)' },
    { name: 'Paid', sessions: trafficSources.paid.sessions, visitors: trafficSources.paid.visitors, icon: DollarSign, color: 'hsl(38, 92%, 50%)' },
  ].filter(s => s.sessions > 0);

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'search': return 'bg-primary/20 text-primary';
      case 'social': return 'bg-purple-500/20 text-purple-600';
      case 'referral': return 'bg-emerald-500/20 text-emerald-600';
      case 'paid': return 'bg-amber-500/20 text-amber-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Heatmap data preparation
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Find max value for color scaling
  let maxHeatmapValue = 0;
  Object.values(heatmapData).forEach(hourData => {
    Object.values(hourData).forEach(count => {
      if (count > maxHeatmapValue) maxHeatmapValue = count;
    });
  });

  const getHeatmapColor = (value: number) => {
    if (value === 0 || maxHeatmapValue === 0) return 'bg-muted/30';
    const intensity = value / maxHeatmapValue;
    if (intensity > 0.8) return 'bg-primary';
    if (intensity > 0.6) return 'bg-primary/80';
    if (intensity > 0.4) return 'bg-primary/60';
    if (intensity > 0.2) return 'bg-primary/40';
    return 'bg-primary/20';
  };

  const hasHeatmapData = Object.keys(heatmapData).length > 0;

  // Find best times to advertise (top 5 hour+day combinations)
  const bestTimes: Array<{ day: string; hour: string; sessions: number }> = [];
  Object.entries(heatmapData).forEach(([day, hourData]) => {
    Object.entries(hourData).forEach(([hour, count]) => {
      bestTimes.push({
        day: dayNames[parseInt(day)],
        hour: `${hour.padStart(2, '0')}:00`,
        sessions: count,
      });
    });
  });
  bestTimes.sort((a, b) => b.sessions - a.sessions);

  return (
    <div className="space-y-6">
      {/* Time of Day Analysis - Full width at top */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Traffic by Hour of Day
          </CardTitle>
          <CardDescription>
            Session distribution across 24 hours {timezone && `(${timezone})`}
            {peakHours.length > 0 && (
              <span className="ml-2">
                • Peak hours: <span className="font-medium text-primary">{peakHours.join(', ')}</span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasHourData ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No hourly data yet</p>
              <p className="text-xs mt-1">Data will appear after new traffic arrives</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourChartData}>
                <XAxis 
                  dataKey="label" 
                  className="text-xs" 
                  tick={{ fontSize: 10 }}
                  interval={2}
                />
                <YAxis className="text-xs" width={35} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  labelFormatter={(_, payload) => {
                    if (payload?.[0]?.payload) {
                      return `${payload[0].payload.label}`;
                    }
                    return '';
                  }}
                  formatter={(value: number) => [value, 'Sessions']}
                />
                <Bar 
                  dataKey="sessions" 
                  radius={2}
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Traffic Heatmap - Hour x Day of Week */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Traffic Heatmap
          </CardTitle>
          <CardDescription>
            Session distribution by day of week and hour {timezone && `(${timezone})`}
            {bestTimes.length > 0 && (
              <span className="ml-2">
                • Best time: <span className="font-medium text-primary">{bestTimes[0]?.day} {bestTimes[0]?.hour}</span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasHeatmapData ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No heatmap data yet</p>
              <p className="text-xs mt-1">Data will appear after traffic across different days</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Heatmap Grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Hour labels */}
                  <div className="flex gap-0.5 mb-1 ml-10">
                    {hours.filter((_, i) => i % 3 === 0).map(h => (
                      <div 
                        key={h} 
                        className="text-[10px] text-muted-foreground text-center"
                        style={{ width: '36px' }}
                      >
                        {h.toString().padStart(2, '0')}
                      </div>
                    ))}
                  </div>
                  
                  {/* Day rows */}
                  {dayNames.map((day, dayIndex) => (
                    <div key={day} className="flex items-center gap-0.5 mb-0.5">
                      <div className="w-10 text-xs text-muted-foreground text-right pr-2">{day}</div>
                      <div className="flex gap-0.5">
                        {hours.map(hour => {
                          const count = heatmapData[dayIndex]?.[hour] || 0;
                          return (
                            <div
                              key={`${dayIndex}-${hour}`}
                              className={`w-3 h-3 rounded-sm transition-colors ${getHeatmapColor(count)}`}
                              title={`${day} ${hour.toString().padStart(2, '0')}:00 - ${count} sessions`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Less</span>
                  <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-muted/30" />
                    <div className="w-3 h-3 rounded-sm bg-primary/20" />
                    <div className="w-3 h-3 rounded-sm bg-primary/40" />
                    <div className="w-3 h-3 rounded-sm bg-primary/60" />
                    <div className="w-3 h-3 rounded-sm bg-primary/80" />
                    <div className="w-3 h-3 rounded-sm bg-primary" />
                  </div>
                  <span>More</span>
                </div>
                
                {bestTimes.length >= 3 && (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">Best times:</span>
                    {bestTimes.slice(0, 3).map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {t.day} {t.hour}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traffic Sources Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Traffic Source Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Traffic Sources
            </CardTitle>
            <CardDescription>
              Where your visitors come from
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalTraffic === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No traffic source data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trafficSourceData.map((source) => {
                  const percent = totalTraffic > 0 ? Math.round((source.sessions / totalTraffic) * 100) : 0;
                  const Icon = source.icon;
                  return (
                    <div key={source.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: source.color }} />
                          <span className="font-medium">{source.name}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {source.sessions} ({percent}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: source.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Referrers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Top Referrers
            </CardTitle>
            <CardDescription>
              Websites sending traffic to you
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No referrer data yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topReferrers.slice(0, 8).map((ref, i) => {
                  const maxSessions = topReferrers[0]?.sessions || 1;
                  const percent = (ref.sessions / maxSessions) * 100;
                  return (
                    <div key={ref.domain} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate flex-1 mr-2 flex items-center gap-2">
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getCategoryBadgeColor(ref.category)}`}>
                            {ref.category}
                          </Badge>
                          <span className="truncate" title={ref.domain}>{ref.domain}</span>
                        </span>
                        <span className="text-muted-foreground flex-shrink-0 text-xs">
                          {ref.sessions} · {ref.visitors} visitors
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Geographic Drill-down */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* By Region */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              By Region / Province
            </CardTitle>
            <CardDescription>
              Traffic breakdown by state or province
            </CardDescription>
          </CardHeader>
          <CardContent>
            {regionChartData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No region data yet</p>
                <p className="text-xs mt-1">Region data will appear after new traffic arrives</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={regionChartData} layout="vertical">
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  />
                  <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* By City */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              By City
            </CardTitle>
            <CardDescription>
              Top cities by session count
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cityChartData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No city data yet</p>
                <p className="text-xs mt-1">City data will appear after new traffic arrives</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cityChartData} layout="vertical">
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  />
                  <Bar dataKey="sessions" fill="hsl(160, 84%, 39%)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Network Analysis */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Top ISPs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Top ISPs
            </CardTitle>
            <CardDescription>
              Internet service providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byISP.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No ISP data yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {byISP.slice(0, 6).map((item, i) => {
                  const maxSessions = byISP[0]?.sessions || 1;
                  const percent = (item.sessions / maxSessions) * 100;
                  return (
                    <div key={item.isp} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate flex-1 mr-2 flex items-center gap-1">
                          {item.isMobile && <Badge variant="outline" className="text-[9px] px-1 py-0">Mobile</Badge>}
                          <span className="truncate" title={item.isp}>{item.isp}</span>
                        </span>
                        <span className="text-muted-foreground flex-shrink-0">{item.sessions}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="w-5 h-5" />
              Network Type
            </CardTitle>
            <CardDescription>
              Mobile vs Fixed connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalNetwork === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Wifi className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No network data yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={networkData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                    >
                      <Cell fill="hsl(var(--primary))" />
                      <Cell fill="hsl(var(--muted-foreground))" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-primary" />
                    <span>Mobile: {mobilePercent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-muted-foreground" />
                    <span>Fixed: {fixedPercent}%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VPN/Proxy Detection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              VPN / Proxy
            </CardTitle>
            <CardDescription>
              Traffic through VPN or proxy
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalProxy === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No proxy data yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${proxyPercent > 20 ? 'text-destructive' : proxyPercent > 10 ? 'text-yellow-500' : 'text-success'}`}>
                    {proxyPercent}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {proxyUsage.proxy} of {totalProxy} sessions
                  </p>
                </div>
                <Progress 
                  value={proxyPercent} 
                  className="h-2"
                />
                {proxyPercent > 20 && (
                  <p className="text-xs text-destructive text-center">
                    ⚠️ High VPN/proxy usage may indicate bot traffic
                  </p>
                )}
                {proxyPercent <= 10 && (
                  <p className="text-xs text-success text-center">
                    ✓ Normal proxy usage levels
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Geographic Table */}
      {(byCity.length > 0 || byRegion.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Detailed Geographic Breakdown
            </CardTitle>
            <CardDescription>
              Sessions and unique visitors by location
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">City</th>
                    <th className="text-left py-2 px-3 font-medium">Region</th>
                    <th className="text-left py-2 px-3 font-medium">Country</th>
                    <th className="text-right py-2 px-3 font-medium">Sessions</th>
                    <th className="text-right py-2 px-3 font-medium">Visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {byCity.slice(0, 10).map((city, i) => {
                    const region = byRegion.find(r => r.country === city.country);
                    return (
                      <tr key={`${city.name}-${city.country}-${i}`} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{city.name}</td>
                        <td className="py-2 px-3 text-muted-foreground">{region?.name || '-'}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-xs">
                            {city.country}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{city.sessions}</td>
                        <td className="py-2 px-3 text-right font-mono text-primary">{city.visitors}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry/Exit Pages Analysis */}
      {(byEntryPage.length > 0 || byExitPage.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Entry Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="w-5 h-5" />
                Top Entry Pages
              </CardTitle>
              <CardDescription>
                Landing pages where users first arrive
              </CardDescription>
            </CardHeader>
            <CardContent>
              {byEntryPage.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <LogIn className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No entry page data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {byEntryPage.slice(0, 8).map((item, i) => {
                    const maxSessions = byEntryPage[0]?.sessions || 1;
                    const percent = (item.sessions / maxSessions) * 100;
                    return (
                      <div key={item.path} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="truncate flex-1 mr-2 font-mono text-xs" title={item.path}>
                            {item.path || '/'}
                          </span>
                          <span className="text-muted-foreground flex-shrink-0 text-xs">
                            {item.sessions} sessions · {item.visitors} visitors
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all bg-primary"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Exit Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="w-5 h-5" />
                Top Exit Pages
              </CardTitle>
              <CardDescription>
                Pages where users leave the site
              </CardDescription>
            </CardHeader>
            <CardContent>
              {byExitPage.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <LogOut className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No exit page data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {byExitPage.slice(0, 8).map((item, i) => {
                    const maxSessions = byExitPage[0]?.sessions || 1;
                    const percent = (item.sessions / maxSessions) * 100;
                    return (
                      <div key={item.path} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="truncate flex-1 mr-2 font-mono text-xs" title={item.path}>
                            {item.path || '/'}
                          </span>
                          <span className="text-muted-foreground flex-shrink-0 text-xs">
                            {item.sessions} sessions · {item.visitors} visitors
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ width: `${percent}%`, backgroundColor: 'hsl(38, 92%, 50%)' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
