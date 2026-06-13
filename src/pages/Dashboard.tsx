import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, FolderOpen, Globe, LogOut, MoreVertical, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDomain, setNewProjectDomain] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await deleteProject.mutateAsync(projectToDelete.id);
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  // Helper to extract and format domain from URL
  const formatDomain = (url: string) => {
    try {
      // Remove protocol if present
      let domain = url.replace(/^https?:\/\//, '');
      // Remove path and query params
      domain = domain.split('/')[0].split('?')[0];
      return domain;
    } catch {
      return url;
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !newProjectDomain) return;
    
    await createProject.mutateAsync({
      name: newProjectName,
      primary_domain: newProjectDomain,
    });
    setNewProjectName('');
    setNewProjectDomain('');
    setDialogOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">S</span>
            </div>
            <span className="text-lg sm:text-xl font-semibold">SplitTest</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title={user?.email}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Projects</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your websites and split tests</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="mx-4 sm:mx-auto max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    placeholder="My Website"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Primary Domain</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={newProjectDomain}
                    onChange={(e) => setNewProjectDomain(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createProject.isPending}>
                  {createProject.isPending ? 'Creating...' : 'Create Project'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : projects?.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6">Create your first project to start split testing</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {projects?.map((project) => (
              <Card key={project.id} className="hover:shadow-medium transition-all duration-200 hover:-translate-y-1 h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Link to={`/project/${project.id}`} className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                      <Globe className="w-5 h-5 text-accent-foreground" />
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setProjectToDelete({ id: project.id, name: project.name });
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Link to={`/project/${project.id}`}>
                    <CardTitle className="mt-4 hover:text-primary transition-colors">{project.name}</CardTitle>
                  </Link>
                  <CardDescription className="truncate">{formatDomain(project.primary_domain)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to={`/project/${project.id}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Created {new Date(project.created_at).toLocaleDateString()}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be undone and will remove all campaigns, variants, and analytics data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
