import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProject, useUpdateProject, useDeleteProject } from '@/hooks/useProjects';
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
import { ArrowLeft, Plus, Settings, Code, BarChart3, Play, Pause, CheckCircle, MoreVertical, Trash2, Pencil, Copy, CheckCircle2, XCircle, Loader2, Globe, Save, Download, Archive, HardDrive } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIMEZONES } from '@/lib/constants';
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
  const updateProject = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const navigate = useNavigate();
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [validateUrl, setValidateUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  
  // Settings edit state
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editTimezone, setEditTimezone] = useState('');
  const [editRetention, setEditRetention] = useState('');

  // Initialize settings form when project loads
  useEffect(() => {
    if (project) {
      setEditName(project.name);
      setEditDomain(project.primary_domain);
      setEditTimezone(project.timezone || 'UTC');
      setEditRetention(String(project.data_retention_days || 90));
    }
  }, [project]);

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
        <div className="container mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-primary-foreground">S</span>
              </div>
              <div className="min-w-0">
                <h1 className="font-semibold truncate">{project.name}</h1>
                <p className="text-xs text-muted-foreground truncate">{project.primary_domain}</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="flex-shrink-0">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 sm:py-8">
        <Tabs defaultValue="campaigns" className="space-y-4 sm:space-y-6">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex">
            <TabsTrigger value="campaigns" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Campaigns</span>
              <span className="sm:hidden">Campaigns</span>
            </TabsTrigger>
            <TabsTrigger value="snippet" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Code className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Install Snippet</span>
              <span className="sm:hidden">Snippet</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Campaigns</h2>
                <p className="text-sm text-muted-foreground">Manage your split test campaigns</p>
              </div>
              <Link to={`/project/${id}/campaign/new`} className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto">
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
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base sm:text-lg truncate">{campaign.name}</CardTitle>
                            <Badge variant={statusVariantMap[campaign.status as CampaignStatus]}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs sm:text-sm">
                            {campaign.variants?.length || 0} variants · Created {new Date(campaign.created_at).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {campaign.status === 'active' ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleStatusChange(campaign.id, 'paused', campaign.name)}
                              disabled={updateCampaign.isPending}
                            >
                              <Pause className="w-4 h-4 sm:mr-1" />
                              <span className="hidden sm:inline">Pause</span>
                            </Button>
                          ) : campaign.status === 'draft' || campaign.status === 'paused' ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleStatusChange(campaign.id, 'active', campaign.name)}
                              disabled={updateCampaign.isPending}
                            >
                              <Play className="w-4 h-4 sm:mr-1" />
                              <span className="hidden sm:inline">Start</span>
                            </Button>
                          ) : null}
                          
                          <Link to={`/project/${id}/campaign/${campaign.id}/edit`}>
                            <Button variant="outline" size="sm">
                              <Pencil className="w-4 h-4 sm:mr-1" />
                              <span className="hidden sm:inline">Edit</span>
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
                              <BarChart3 className="w-4 h-4 sm:mr-1" />
                              <span className="hidden sm:inline">Analytics</span>
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
                <CardTitle className="flex items-center gap-2">
                  <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded">Recommended</span>
                  Instant Redirect Snippet
                </CardTitle>
                <CardDescription>
                  Add this script to the &lt;head&gt; of your website, <strong>before any other scripts</strong>. Shows loading overlay and redirects instantly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Updated snippet with session tracking and deduplication
                  const instantSnippet = `<script>!function(){var d=document,s=localStorage,ss=sessionStorage,k="sf_vk",sk="sf_sk",t="${project.publishable_token}",a="https://collect.splittest.app",q=location.search.slice(1),p=location.pathname,c=ss.getItem("sf_c_"+p);if(c){location.replace(c);return}var sKey=ss.getItem(sk)||(ss.setItem(sk,crypto.randomUUID()),ss.getItem(sk));var l=d.createElement("div");l.id="sf-loader";l.innerHTML='<div style="position:fixed;inset:0;background:#fff;z-index:999999;display:flex;align-items:center;justify-content:center"><div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:sf-spin 1s linear infinite"></div></div><style>@keyframes sf-spin{to{transform:rotate(360deg)}}</style>';d.documentElement.appendChild(l);fetch(a+"/assign?token="+t+"&vk="+(s.getItem(k)||"")+"&sk="+sKey+"&path="+encodeURIComponent(p)+"&lang="+(navigator.language||"en").slice(0,2)+"&oq="+encodeURIComponent(q)).then(r=>r.json()).then(r=>{r.visitorKey&&s.setItem(k,r.visitorKey);if(r.shouldRedirect&&r.url){if(!r.cached)ss.setItem("sf_c_"+p,r.url);location.replace(r.url)}else{l.remove()}}).catch(()=>l.remove())}()</script>`;
                  return (
                    <div className="relative">
                      <pre className="p-4 rounded-lg bg-sidebar text-sidebar-foreground text-sm overflow-x-auto">
                        <code>{instantSnippet}</code>
                      </pre>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute top-2 right-2"
                        onClick={() => {
                          navigator.clipboard.writeText(instantSnippet);
                          toast({ title: 'Copied!', description: 'Snippet copied to clipboard' });
                        }}
                      >
                        Copy
                      </Button>
                      <p className="text-xs text-muted-foreground mt-3">
                        ~650 bytes • Session deduplication • Prevents duplicate assigns on page refresh
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Basic Snippet (No Loading)</CardTitle>
                <CardDescription>
                  Minimal version without loading indicator - fastest to load but may show page briefly
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Basic snippet with session deduplication
                  const minifiedSnippet = `<script>!function(){var s=localStorage,ss=sessionStorage,k="sf_vk",sk="sf_sk",t="${project.publishable_token}",a="https://collect.splittest.app",q=location.search.slice(1),p=location.pathname,c=ss.getItem("sf_c_"+p);if(c){location.replace(c);return}var sKey=ss.getItem(sk)||(ss.setItem(sk,crypto.randomUUID()),ss.getItem(sk));fetch(a+"/assign?token="+t+"&vk="+(s.getItem(k)||"")+"&sk="+sKey+"&path="+encodeURIComponent(p)+"&lang="+(navigator.language||"en").slice(0,2)+"&oq="+encodeURIComponent(q)).then(r=>r.json()).then(d=>{d.visitorKey&&s.setItem(k,d.visitorKey);if(d.shouldRedirect&&d.url){if(!d.cached)ss.setItem("sf_c_"+p,d.url);location.replace(d.url)}}).catch(()=>{})}()</script>`;
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
                        ~500 bytes minified • Session deduplication • No loading indicator
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Project Settings</h2>
                <p className="text-muted-foreground">Configure your project settings</p>
              </div>
              {!isEditingSettings ? (
                <Button variant="outline" onClick={() => setIsEditingSettings(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Settings
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditingSettings(false);
                      if (project) {
                        setEditName(project.name);
                        setEditDomain(project.primary_domain);
                        setEditTimezone(project.timezone || 'UTC');
                        setEditRetention(String(project.data_retention_days || 90));
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!project) return;
                      try {
                        await updateProject.mutateAsync({
                          id: project.id,
                          name: editName,
                          primary_domain: editDomain,
                          timezone: editTimezone,
                          data_retention_days: parseInt(editRetention) || 90,
                        });
                        setIsEditingSettings(false);
                      } catch (error) {
                        // Error toast handled by hook
                      }
                    }}
                    disabled={updateProject.isPending}
                  >
                    {updateProject.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Project Name</label>
                  {isEditingSettings ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="My Project"
                    />
                  ) : (
                    <p className="text-muted-foreground">{project.name}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Primary Domain</label>
                  {isEditingSettings ? (
                    <Input
                      value={editDomain}
                      onChange={(e) => setEditDomain(e.target.value)}
                      placeholder="example.com"
                    />
                  ) : (
                    <p className="text-muted-foreground">{project.primary_domain}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Timezone</label>
                  {isEditingSettings ? (
                    <Select value={editTimezone} onValueChange={setEditTimezone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-muted-foreground">
                      {TIMEZONES.find((tz) => tz.value === project.timezone)?.label || project.timezone}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Data Retention</label>
                  {isEditingSettings ? (
                    <Select value={editRetention} onValueChange={setEditRetention}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select retention period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">180 days</SelectItem>
                        <SelectItem value="365">365 days</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-muted-foreground">{project.data_retention_days} days</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Data Management
                </CardTitle>
                <CardDescription>
                  Export, compress, or clean up your analytics data to reduce storage costs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Export CSV */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV Backup
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Download your data as CSV files before archiving
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['events_raw', 'aggregates_minute', 'sessions'] as const).map((table) => (
                      <Button
                        key={table}
                        variant="outline"
                        size="sm"
                        disabled={isExporting !== null}
                        onClick={async () => {
                          setIsExporting(table);
                          try {
                            const { data, error } = await supabase.functions.invoke('export-archive', {
                              body: { action: 'export', projectId: id, table },
                            });
                            if (error) throw error;
                            if (data?.count === 0 || data?.error === 'No data to export') {
                              toast({ title: 'No data', description: `No ${table} data to export` });
                              return;
                            }
                            // Download as file
                            const blob = new Blob([data], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${table}_${id}_${new Date().toISOString().split('T')[0]}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: 'Export complete', description: `${table} exported successfully` });
                          } catch (error: any) {
                            toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
                          } finally {
                            setIsExporting(null);
                          }
                        }}
                      >
                        {isExporting === table ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3 mr-1" />
                        )}
                        {table.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* Compress */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Archive className="w-4 h-4" />
                    Compress to Daily Summary
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Compress minute-level aggregates into daily summaries, reducing ~95% of rows while keeping key insights
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCompressing}
                    onClick={async () => {
                      setIsCompressing(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('export-archive', {
                          body: { action: 'compress', projectId: id },
                        });
                        if (error) throw error;
                        toast({
                          title: 'Compression complete',
                          description: `${data.minuteRowsProcessed} minute rows → ${data.dailyRowsCreated} daily rows. Deleted ${data.minuteRowsDeleted} old rows.`,
                        });
                      } catch (error: any) {
                        toast({ title: 'Compression failed', description: error.message, variant: 'destructive' });
                      } finally {
                        setIsCompressing(false);
                      }
                    }}
                  >
                    {isCompressing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Archive className="w-4 h-4 mr-2" />
                    )}
                    {isCompressing ? 'Compressing...' : 'Compress Now'}
                  </Button>
                </div>

                <div className="border-t border-border" />

                {/* Cleanup old raw data */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-destructive" />
                    Clean Up Old Data
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Delete raw events and sessions older than 7 days. Make sure to export and compress first!
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isCleaning}
                    onClick={async () => {
                      if (!confirm('Are you sure? This will delete events and sessions older than 7 days. Make sure you have exported and compressed first.')) return;
                      setIsCleaning(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('export-archive', {
                          body: { action: 'cleanup', projectId: id },
                        });
                        if (error) throw error;
                        toast({
                          title: 'Cleanup complete',
                          description: `Deleted ${data.eventsDeleted} events and ${data.sessionsDeleted} sessions`,
                        });
                      } catch (error: any) {
                        toast({ title: 'Cleanup failed', description: error.message, variant: 'destructive' });
                      } finally {
                        setIsCleaning(false);
                      }
                    }}
                  >
                    {isCleaning ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    {isCleaning ? 'Cleaning...' : 'Clean Up Now'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible actions that will permanently affect your project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Delete this project</p>
                    <p className="text-sm text-muted-foreground">
                      Once deleted, all campaigns, variants, and analytics data will be permanently removed.
                    </p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => setDeleteProjectDialogOpen(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Project
                  </Button>
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

      <AlertDialog open={deleteProjectDialogOpen} onOpenChange={setDeleteProjectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project?.name}"? This action cannot be undone and will remove all campaigns, variants, rules, and analytics data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!project) return;
                await deleteProjectMutation.mutateAsync(project.id);
                navigate('/dashboard');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
