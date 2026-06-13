import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  // Gate non-admin
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!(user as any).is_admin) {
      toast.error('Admin access required.');
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  // Load settings + users
  useEffect(() => {
    if (!user || !(user as any).is_admin) return;
    (async () => {
      try {
        const [s, u] = await Promise.all([adminApi.getSettings(), adminApi.listUsers()]);
        setSignupEnabled(!!s.signup_enabled);
        setUsers(u.users || []);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const toggleSignup = async (next: boolean) => {
    setSaving(true);
    try {
      await adminApi.setSetting('signup_enabled', next);
      setSignupEnabled(next);
      toast.success(next ? 'Signup enabled' : 'Signup disabled');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const toggleAdmin = async (u: any) => {
    try {
      const r = await adminApi.updateUser(u.id, { is_admin: !u.is_admin });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: r.user.is_admin } : x));
      toast.success(`${u.email}: admin = ${r.user.is_admin}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const deleteUser = async (u: any) => {
    if (!confirm(`Delete user ${u.email}? This will cascade delete all their projects/campaigns/data.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast.success(`Deleted ${u.email}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
          <h1 className="text-xl font-semibold">Admin Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Signup Control</CardTitle>
            <CardDescription>Toggle public user registration. Existing users can still log in regardless.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="signup-toggle" className="text-base font-medium">Allow new signups</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {signupEnabled ? 'Anyone can register a new account.' : 'New registrations are blocked.'}
                </p>
              </div>
              <Switch
                id="signup-toggle"
                checked={signupEnabled}
                disabled={saving}
                onCheckedChange={toggleSignup}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users ({users.length})</CardTitle>
            <CardDescription>Manage user accounts and admin privileges.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.full_name || '-'}</TableCell>
                    <TableCell>{u.project_count}</TableCell>
                    <TableCell>
                      {u.is_admin ? <Badge>Admin</Badge> : <Badge variant="secondary">User</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAdmin(u)}
                        disabled={u.id === user?.id}
                        title={u.is_admin ? 'Demote to user' : 'Promote to admin'}
                      >
                        {u.is_admin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteUser(u)}
                        disabled={u.id === user?.id}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
