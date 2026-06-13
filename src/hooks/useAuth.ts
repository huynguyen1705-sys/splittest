import { useState, useEffect, useCallback } from 'react';
import { authApi, getToken, setToken, User } from '@/lib/api';

// Compat shim — keep the same surface as the old Supabase-based hook
type Session = { user: User } | null;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(({ user }) => { setUser(user); setSession({ user }); })
      .catch(() => { setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    try {
      const { token, user } = await authApi.signup(email, password, fullName);
      setToken(token); setUser(user); setSession({ user });
      return { data: { user, session: { user } }, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.payload?.error || e.message || 'signup_failed' } };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { token, user } = await authApi.login(email, password);
      setToken(token); setUser(user); setSession({ user });
      return { data: { user, session: { user } }, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.payload?.error || e.message || 'invalid_credentials' } };
    }
  }, []);

  // OAuth not supported in self-hosted; keep signature returning error
  const signInWithGoogle = useCallback(async () => {
    return { data: null, error: { message: 'OAuth not supported in self-hosted build' } };
  }, []);

  const signOut = useCallback(async () => {
    setToken(null); setUser(null); setSession(null);
    return { error: null };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await authApi.forgot(email);
      return { data: { ok: true }, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }, []);

  return { user, session, loading, signUp, signIn, signInWithGoogle, signOut, resetPassword };
}
