import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Play, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';

const EDGE_API = 'https://collect.splittest.app';

interface AssignResponse {
  shouldRedirect?: boolean;
  url?: string;
  campaignId?: string;
  variantId?: string;
  visitorKey?: string;
  reason?: string;
  error?: string;
  dnt?: boolean;
  ttl?: number;
}

interface CollectResponse {
  success?: boolean;
  error?: string;
}

export default function SnippetTest() {
  const [searchParams] = useSearchParams();
  const defaultToken = searchParams.get('token') || '';
  
  const [token, setToken] = useState(defaultToken);
  const [path, setPath] = useState('/');
  const [lang, setLang] = useState('en');
  
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignResponse | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignLatency, setAssignLatency] = useState<number | null>(null);
  
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectResult, setCollectResult] = useState<CollectResponse | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  
  const [visitorKey, setVisitorKey] = useState<string>('');

  const testAssign = async () => {
    if (!token.trim()) {
      setAssignError('Please enter a project token');
      return;
    }
    
    setAssignLoading(true);
    setAssignError(null);
    setAssignResult(null);
    
    const startTime = Date.now();
    
    try {
      const url = `${EDGE_API}/assign?token=${encodeURIComponent(token)}&vk=${encodeURIComponent(visitorKey)}&path=${encodeURIComponent(path)}&lang=${encodeURIComponent(lang)}`;
      
      const response = await fetch(url);
      const data: AssignResponse = await response.json();
      
      setAssignLatency(Date.now() - startTime);
      setAssignResult(data);
      
      if (data.visitorKey) {
        setVisitorKey(data.visitorKey);
      }
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to call edge-assign');
      setAssignLatency(Date.now() - startTime);
    } finally {
      setAssignLoading(false);
    }
  };

  const testCollect = async (type: 'redirect_ok' | 'redirect_fail' | 'goal') => {
    if (!token.trim()) {
      setCollectError('Please enter a project token');
      return;
    }
    
    setCollectLoading(true);
    setCollectError(null);
    setCollectResult(null);
    
    try {
      const response = await fetch(`${EDGE_API}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          type,
          campaignId: assignResult?.campaignId || null,
          variantId: assignResult?.variantId || null,
          timeToRedirectMs: Math.floor(Math.random() * 500) + 50,
          path,
          errorMessage: type === 'redirect_fail' ? 'Test error message' : null,
        }),
      });
      
      const data: CollectResponse = await response.json();
      setCollectResult(data);
    } catch (err) {
      setCollectError(err instanceof Error ? err.message : 'Failed to call collect');
    } finally {
      setCollectLoading(false);
    }
  };

  const resetVisitor = () => {
    setVisitorKey('');
    setAssignResult(null);
    setCollectResult(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">S</span>
              </div>
              <h1 className="font-semibold">Edge Function Tester</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Enter your project token to test the edge functions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="token">Project Token</Label>
                  <Input
                    id="token"
                    placeholder="Your publishable token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="path">Page Path</Label>
                  <Input
                    id="path"
                    placeholder="/"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lang">Language</Label>
                  <Input
                    id="lang"
                    placeholder="en"
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                  />
                </div>
              </div>
              
              {visitorKey && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  <span className="text-sm text-muted-foreground">Visitor Key:</span>
                  <code className="text-xs font-mono">{visitorKey.slice(0, 8)}...{visitorKey.slice(-8)}</code>
                  <Button variant="ghost" size="sm" onClick={resetVisitor} className="ml-auto">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Assign */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>1. Test Variant Assignment</CardTitle>
                  <CardDescription>Call the edge-assign endpoint to get a variant</CardDescription>
                </div>
                <Button onClick={testAssign} disabled={assignLoading}>
                  {assignLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run Test
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {assignError && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
                  <XCircle className="w-5 h-5" />
                  <span>{assignError}</span>
                </div>
              )}
              
              {assignResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {assignResult.shouldRedirect ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Should Redirect
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        No Redirect
                      </Badge>
                    )}
                    {assignLatency && (
                      <Badge variant="outline">{assignLatency}ms</Badge>
                    )}
                    {assignResult.dnt && (
                      <Badge variant="warning">DNT Respected</Badge>
                    )}
                  </div>
                  
                  <div className="p-4 rounded-lg bg-sidebar overflow-x-auto">
                    <pre className="text-sm text-sidebar-foreground">
                      {JSON.stringify(assignResult, null, 2)}
                    </pre>
                  </div>
                  
                  {assignResult.shouldRedirect && assignResult.url && (
                    <div className="p-3 rounded-lg border border-border">
                      <span className="text-sm text-muted-foreground">Redirect URL: </span>
                      <a 
                        href={assignResult.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {assignResult.url}
                      </a>
                    </div>
                  )}
                </div>
              )}
              
              {!assignResult && !assignError && (
                <p className="text-sm text-muted-foreground">
                  Click "Run Test" to call the edge-assign endpoint and get a variant assignment.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Test Collect */}
          <Card>
            <CardHeader>
              <CardTitle>2. Test Event Collection</CardTitle>
              <CardDescription>Send test events to the collect endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => testCollect('redirect_ok')}
                  disabled={collectLoading}
                >
                  {collectLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send redirect_ok
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => testCollect('redirect_fail')}
                  disabled={collectLoading}
                >
                  Send redirect_fail
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => testCollect('goal')}
                  disabled={collectLoading}
                >
                  Send goal
                </Button>
              </div>
              
              {collectError && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
                  <XCircle className="w-5 h-5" />
                  <span>{collectError}</span>
                </div>
              )}
              
              {collectResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {collectResult.success ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Event Recorded
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="w-3 h-3" />
                        Failed
                      </Badge>
                    )}
                  </div>
                  
                  <div className="p-4 rounded-lg bg-sidebar overflow-x-auto">
                    <pre className="text-sm text-sidebar-foreground">
                      {JSON.stringify(collectResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              
              {!collectResult && !collectError && (
                <p className="text-sm text-muted-foreground">
                  Click one of the buttons above to send a test event to the collect endpoint.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li><strong>edge-assign:</strong> Called when a visitor lands on your page. Returns a variant to redirect to (if any active campaigns match).</li>
                <li><strong>collect:</strong> Records events like successful redirects, failed redirects, or goal conversions.</li>
                <li><strong>Sticky sessions:</strong> If enabled, the same visitor key will always get the same variant.</li>
                <li><strong>Geolocation:</strong> Country is detected from IP address using ip-api.com.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
