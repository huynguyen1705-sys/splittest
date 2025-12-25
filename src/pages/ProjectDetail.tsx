import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProjects';
import { useCampaigns, useUpdateCampaign, useDeleteCampaign, useDuplicateCampaign } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Settings, Code, BarChart3, Play, Pause, CheckCircle, MoreVertical, Trash2, Pencil, Copy, CheckCircle2, XCircle, Loader2, Globe } from 'lucide-react';
import { CampaignStatus } from '@/types/database';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

const statusVariantMap: Record<CampaignStatus, 'draft' | 'active' | 'paused' | 'completed'> = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns(id);
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const duplicateCampaign = useDuplicateCampaign();
  const navigate = useNavigate();
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);
  const [validateUrl, setValidateUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Initialize validateUrl when project loads
  useEffect(() => {
    if (project?.primary_domain && !validateUrl) {
      setValidateUrl(`https://${project.primary_domain}`);
    }
  }, [project?.primary_domain]);

  const handleValidate = async () => {
    if (!validateUrl.trim() || !project) {
      toast({ title: 'Error', description: 'Please enter a URL', variant: 'destructive' });
      return;
    }
    setIsValidating(true);
    setValidationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-snippet', {
        body: { url: validateUrl, token: project.publishable_token },
      });
      if (error) throw error;
      setValidationResult(data);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Validation failed', variant: 'destructive' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteClick = (campaignId: string, campaignName: string) => {
    setCampaignToDelete({ id: campaignId, name: campaignName });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteCampaign.mutateAsync(campaignToDelete.id);
      toast({
        title: 'Campaign deleted',
        description: `"${campaignToDelete.name}" has been deleted`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete campaign',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    }
  };

  const handleStatusChange = async (campaignId: string, newStatus: CampaignStatus, campaignName: string) => {
    try {
      await updateCampaign.mutateAsync({ id: campaignId, status: newStatus });
      toast({
        title: 'Campaign updated',
        description: `"${campaignName}" is now ${newStatus}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update campaign status',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || projectLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Project not found</h1>
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

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
              <div>
                <h1 className="font-semibold">{project.name}</h1>
                <p className="text-xs text-muted-foreground">{project.primary_domain}</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="campaigns" className="space-y-6">
          <TabsList>
            <TabsTrigger value="campaigns" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="snippet" className="gap-2">
              <Code className="w-4 h-4" />
              Install Snippet
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Campaigns</h2>
                <p className="text-muted-foreground">Manage your split test campaigns</p>
              </div>
              <Link to={`/project/${id}/campaign/new`}>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Campaign
                </Button>
              </Link>
            </div>

            {campaignsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : campaigns?.length === 0 ? (
              <Card className="text-center py-16">
                <CardContent>
                  <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No campaigns yet</h3>
                  <p className="text-muted-foreground mb-6">Create your first split test campaign</p>
                  <Link to={`/project/${id}/campaign/new`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Campaign
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {campaigns?.map((campaign) => (
                  <Card key={campaign.id} className="hover:shadow-medium transition-all duration-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">{campaign.name}</CardTitle>
                            <Badge variant={statusVariantMap[campaign.status as CampaignStatus]}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <CardDescription>
                            {campaign.variants?.length || 0} variants · Created {new Date(campaign.created_at).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {campaign.status === 'active' ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleStatusChange(campaign.id, 'paused', campaign.name)}
                              disabled={updateCampaign.isPending}
                            >
                              <Pause className="w-4 h-4 mr-1" />
                              Pause
                            </Button>
                          ) : campaign.status === 'draft' || campaign.status === 'paused' ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleStatusChange(campaign.id, 'active', campaign.name)}
                              disabled={updateCampaign.isPending}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Start
                            </Button>
                          ) : null}
                          
                          <Link to={`/project/${id}/campaign/${campaign.id}/edit`}>
                            <Button variant="outline" size="sm">
                              <Pencil className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                          </Link>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {campaign.status !== 'completed' && (
                                <DropdownMenuItem 
                                  onClick={() => handleStatusChange(campaign.id, 'completed', campaign.name)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Mark Complete
                                </DropdownMenuItem>
                              )}
                              {campaign.status === 'completed' && (
                                <DropdownMenuItem 
                                  onClick={() => handleStatusChange(campaign.id, 'paused', campaign.name)}
                                >
                                  <Pause className="w-4 h-4 mr-2" />
                                  Reopen as Paused
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => duplicateCampaign.mutate({ campaignId: campaign.id, projectId: id! })}
                                disabled={duplicateCampaign.isPending}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteClick(campaign.id, campaign.name)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Campaign
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <Link to={`/project/${id}/campaign/${campaign.id}`}>
                            <Button size="sm">
                              <BarChart3 className="w-4 h-4 mr-1" />
                              Analytics
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardHeader>
                    {campaign.variants && campaign.variants.length > 0 && (
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-2">
                          {campaign.variants.slice(0, 5).map((variant) => (
                            <div key={variant.id} className="text-xs px-2 py-1 rounded-md bg-muted">
                              {variant.name} ({variant.weight}%)
                            </div>
                          ))}
                          {campaign.variants.length > 5 && (
                            <div className="text-xs px-2 py-1 text-muted-foreground">
                              +{campaign.variants.length - 5} more
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="snippet" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Install Snippet</h2>
              <p className="text-muted-foreground">Add this code to your website to enable split testing</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>JavaScript Snippet</CardTitle>
                <CardDescription>
                  Add this script to the &lt;head&gt; of your website, before any other scripts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const minifiedSnippet = `<script>!function(){var s=localStorage,k="sf_vk",t="${project.publishable_token}",a="https://clgztmdjppmbkcfdtxhw.supabase.co/functions/v1";fetch(a+"/edge-assign?token="+t+"&vk="+(s.getItem(k)||"")+"&path="+encodeURIComponent(location.pathname)+"&lang="+(navigator.language||"en").slice(0,2)).then(r=>r.json()).then(d=>{d.visitorKey&&s.setItem(k,d.visitorKey);d.shouldRedirect&&d.url&&(location.href=d.url)}).catch(()=>{})}()</script>`;
                  return (
                    <div className="relative">
                      <pre className="p-4 rounded-lg bg-sidebar text-sidebar-foreground text-sm overflow-x-auto">
                        <code>{minifiedSnippet}</code>
                      </pre>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute top-2 right-2"
                        onClick={() => {
                          navigator.clipboard.writeText(minifiedSnippet);
                          toast({ title: 'Copied!', description: 'Snippet copied to clipboard' });
                        }}
                      >
                        Copy
                      </Button>
                      <p className="text-xs text-muted-foreground mt-3">
                        ~350 bytes minified • No dependencies • Async loading
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Full Version (with tracking)</CardTitle>
                <CardDescription>
                  Use this if you need detailed analytics and error tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const fullSnippet = `<script>
!function(){
  var s=localStorage,k="sf_vk",t="${project.publishable_token}",
      a="https://clgztmdjppmbkcfdtxhw.supabase.co/functions/v1",st=Date.now();
  fetch(a+"/edge-assign?token="+t+"&vk="+(s.getItem(k)||"")+"&path="+encodeURIComponent(location.pathname)+"&lang="+(navigator.language||"en").slice(0,2))
    .then(r=>r.json())
    .then(d=>{
      d.visitorKey&&s.setItem(k,d.visitorKey);
      if(d.shouldRedirect&&d.url){
        navigator.sendBeacon(a+"/collect",JSON.stringify({token:t,type:"redirect_ok",campaignId:d.campaignId,variantId:d.variantId,timeToRedirectMs:Date.now()-st,path:location.pathname}));
        location.href=d.url;
      }
    })
    .catch(e=>navigator.sendBeacon(a+"/collect",JSON.stringify({token:t,type:"redirect_fail",errorMessage:e.message,path:location.pathname})));
}()
</script>`;
                  return (
                    <div className="relative">
                      <pre className="p-4 rounded-lg bg-sidebar text-sidebar-foreground text-sm overflow-x-auto">
                        <code>{fullSnippet}</code>
                      </pre>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute top-2 right-2"
                        onClick={() => {
                          navigator.clipboard.writeText(fullSnippet);
                          toast({ title: 'Copied!', description: 'Snippet copied to clipboard' });
                        }}
                      >
                        Copy
                      </Button>
                      <p className="text-xs text-muted-foreground mt-3">
                        Uses sendBeacon for reliable tracking even during redirect
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Async Loading (Recommended)</CardTitle>
                <CardDescription>
                  Non-blocking script that loads after page content for best performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const asyncSnippet = `<script defer>
window.addEventListener('DOMContentLoaded',function(){
  var s=localStorage,k="sf_vk",t="${project.publishable_token}",
      a="https://clgztmdjppmbkcfdtxhw.supabase.co/functions/v1";
  fetch(a+"/edge-assign?token="+t+"&vk="+(s.getItem(k)||"")+"&path="+encodeURIComponent(location.pathname)+"&lang="+(navigator.language||"en").slice(0,2))
    .then(function(r){return r.json()})
    .then(function(d){
      d.visitorKey&&s.setItem(k,d.visitorKey);
      d.shouldRedirect&&d.url&&(location.href=d.url);
    }).catch(function(){});
});
</script>`;
                  return (
                    <div className="relative">
                      <pre className="p-4 rounded-lg bg-sidebar text-sidebar-foreground text-sm overflow-x-auto">
                        <code>{asyncSnippet}</code>
                      </pre>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute top-2 right-2"
                        onClick={() => {
                          navigator.clipboard.writeText(asyncSnippet);
                          toast({ title: 'Copied!', description: 'Snippet copied to clipboard' });
                        }}
                      >
                        Copy
                      </Button>
                      <p className="text-xs text-muted-foreground mt-3">
                        ✓ Non-blocking • ✓ Defer parsing • ✓ Runs after DOM ready
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Validate Installation
                </CardTitle>
                <CardDescription>Check if the snippet is correctly installed on your website</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://yourwebsite.com"
                      value={validateUrl}
                      onChange={(e) => setValidateUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                    />
                    <Button onClick={handleValidate} disabled={isValidating}>
                      {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validate'}
                    </Button>
                  </div>

                  {validationResult && (
                    <div className={`p-4 rounded-lg border ${validationResult.installed ? 'border-green-500/50 bg-green-500/10' : 'border-destructive/50 bg-destructive/10'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        {validationResult.installed ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            <span className="font-medium text-green-500">Snippet Installed</span>
                            {validationResult.snippetType && (
                              <Badge variant="secondary" className="ml-2">{validationResult.snippetType}</Badge>
                            )}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-destructive" />
                            <span className="font-medium text-destructive">Snippet Not Found</span>
                          </>
                        )}
                      </div>

                      {validationResult.checks && (
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div className="flex items-center gap-2">
                            {validationResult.checks.tokenFound ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                            <span className={validationResult.checks.tokenFound ? '' : 'text-muted-foreground'}>Token found</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {validationResult.checks.edgeAssignFound ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                            <span className={validationResult.checks.edgeAssignFound ? '' : 'text-muted-foreground'}>API endpoint found</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {validationResult.inHead ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                            <span className={validationResult.inHead ? '' : 'text-muted-foreground'}>In &lt;head&gt; tag</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {validationResult.checks.sfVkFound ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                            <span className={validationResult.checks.sfVkFound ? '' : 'text-muted-foreground'}>Visitor key storage</span>
                          </div>
                        </div>
                      )}

                      {validationResult.recommendations?.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium mb-1">Recommendations:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {validationResult.recommendations.map((rec: string, i: number) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {validationResult.error && (
                        <p className="text-sm text-destructive">{validationResult.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Project Token</CardTitle>
                <CardDescription>This is your unique project identifier</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <code className="px-3 py-2 rounded-md bg-muted text-sm font-mono">
                  {project.publishable_token}
                </code>
                <Link to={`/test?token=${project.publishable_token}`}>
                  <Button variant="outline" size="sm">
                    <Play className="w-4 h-4 mr-2" />
                    Test Edge Functions
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Project Settings</h2>
              <p className="text-muted-foreground">Configure your project settings</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Project Name</label>
                  <p className="text-muted-foreground">{project.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Primary Domain</label>
                  <p className="text-muted-foreground">{project.primary_domain}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Timezone</label>
                  <p className="text-muted-foreground">{project.timezone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Data Retention</label>
                  <p className="text-muted-foreground">{project.data_retention_days} days</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be undone and will remove all associated variants, rules, and analytics data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCampaign.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
