/**
 * SplitTest API client — replaces Supabase client.
 * All requests go to VITE_API_URL with Bearer JWT.
 */

const API_URL = (import.meta as any).env.VITE_API_URL || '/api';
const TOKEN_KEY = 'splittest_token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export interface ApiError extends Error {
  status: number;
  payload?: any;
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const tok = getToken();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const res = await fetch(API_URL + path, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'request_failed') as ApiError;
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any) => request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(p: string, body?: any) => request<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(p: string, body?: any) => request<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
};

// ---------- Typed helpers ----------

export type User = { id: string; email: string; full_name?: string | null; avatar_url?: string | null; is_admin?: boolean; created_at?: string };

export const authApi = {
  signup: (email: string, password: string, full_name?: string) =>
    api.post<{ token: string; user: User }>('/auth/signup', { email, password, full_name }),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  me: () => api.get<{ user: User }>('/auth/me'),
  forgot: (email: string) => api.post<{ ok: true }>('/auth/forgot-password', { email }),
  reset: (token: string, password: string) => api.post<{ ok: true }>('/auth/reset-password', { token, password }),
};

export const projectsApi = {
  list: () => api.get<{ data: any[] }>('/projects'),
  get: (id: string) => api.get<{ data: any }>(`/projects/${id}`),
  create: (body: any) => api.post<{ data: any }>('/projects', body),
  update: (id: string, body: any) => api.patch<{ data: any }>(`/projects/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`/projects/${id}`),
};

export const campaignsApi = {
  list: (projectId: string) => api.get<{ data: any[] }>(`/campaigns?project_id=${projectId}`),
  get: (id: string) => api.get<{ data: any }>(`/campaigns/${id}`),
  create: (body: any) => api.post<{ data: any }>('/campaigns', body),
  update: (id: string, body: any) => api.patch<{ data: any }>(`/campaigns/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`/campaigns/${id}`),

  variants: {
    list: (campaignId: string) => api.get<{ data: any[] }>(`/campaigns/${campaignId}/variants`),
    create: (campaignId: string, body: any) => api.post<{ data: any }>(`/campaigns/${campaignId}/variants`, body),
    update: (campaignId: string, variantId: string, body: any) =>
      api.patch<{ data: any }>(`/campaigns/${campaignId}/variants/${variantId}`, body),
    remove: (campaignId: string, variantId: string) => api.delete(`/campaigns/${campaignId}/variants/${variantId}`),
  },

  rules: {
    get: (campaignId: string) => api.get<{ data: any }>(`/campaigns/${campaignId}/rules`),
    set: (campaignId: string, body: any) => api.put<{ data: any }>(`/campaigns/${campaignId}/rules`, body),
  },
};

export const publicApi = {
  config: () => api.get<{ signup_enabled: boolean }>('/auth/public-config'),
};

export const adminApi = {
  getSettings: () => api.get<Record<string, any>>('/admin/settings'),
  setSetting: (key: string, value: any) => api.put<{ ok: true }>(`/admin/settings/${key}`, { value }),
  listUsers: () => api.get<{ users: any[] }>('/admin/users'),
  updateUser: (id: string, body: any) => api.patch<{ user: any }>(`/admin/users/${id}`, body),
  deleteUser: (id: string) => api.delete<{ ok: true }>(`/admin/users/${id}`),
};

export const analyticsApi = {
  campaign: (id: string, range = '24h') => api.get<{ variantStats: any[]; timeline: any[] }>(`/analytics/campaign/${id}?range=${range}`),
  geo: (id: string) => api.get<{ data: any[] }>(`/analytics/geo/${id}`),
  events: (id: string) => api.get<{ data: any[] }>(`/analytics/events/${id}`),
  sessions: (id: string) => api.get<{ data: any[] }>(`/analytics/sessions/${id}`),
};
