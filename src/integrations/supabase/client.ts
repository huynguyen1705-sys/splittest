/**
 * Compatibility shim — replaces the old Supabase client with calls to our self-hosted API.
 * Provides a minimal supabase-like surface so existing code keeps compiling without rewrites.
 *
 * Notes:
 *  - `.from(...).select/insert/update/delete/upsert/order/...` returns a builder that proxies to /api endpoints.
 *  - `.auth.*` is replaced by the new JWT-based useAuth hook; remaining call sites are stubs.
 *  - `.functions.invoke(name, {...})` routes to /api/functions/<name>.
 *  - `.channel(...)` returns a no-op (we use polling instead of realtime).
 */

import { api, getToken } from '@/lib/api';

const NOOP = () => {};

// Map of supabase table → API endpoint resolver (used for the most-common queries)
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

type Filter = { col: string; op: string; val: any };

function buildQuery(tbl: string, op: Op, fields: any, filters: Filter[], order?: { col: string; asc: boolean }, limit?: number, range?: { from: number; to: number }) {
  const qs = new URLSearchParams({ table: tbl, op });
  if (filters.length) qs.set('filters', JSON.stringify(filters));
  if (order) qs.set('order', `${order.col}:${order.asc ? 'asc' : 'desc'}`);
  if (typeof limit === 'number') qs.set('limit', String(limit));
  if (range) qs.set('range', `${range.from}-${range.to}`);
  if (fields && (op === 'insert' || op === 'update' || op === 'upsert')) qs.set('payload', JSON.stringify(fields));
  if (fields && op === 'select') qs.set('select', String(fields));
  return qs;
}

function tableBuilder(tbl: string) {
  const state: any = { op: 'select' as Op, fields: '*', filters: [] as Filter[], order: undefined, limit: undefined, range: undefined, payload: undefined, onConflict: undefined };

  function exec(): Promise<{ data: any; error: any }> {
    const qs = new URLSearchParams({ table: tbl, op: state.op });
    qs.set('filters', JSON.stringify(state.filters));
    if (state.order) qs.set('order', `${state.order.col}:${state.order.asc ? 'asc' : 'desc'}`);
    if (typeof state.limit === 'number') qs.set('limit', String(state.limit));
    if (state.range) qs.set('range', `${state.range.from}-${state.range.to}`);
    if (state.select) qs.set('select', String(state.select));
    if (state.onConflict) qs.set('onConflict', state.onConflict);
    const url = `/q?${qs.toString()}`;
    const init: any = { method: 'POST', body: JSON.stringify(state.payload ?? null) };
    return api.post(url, state.payload ?? null).then(d => ({ data: d?.data ?? d, error: null })).catch(error => ({ data: null, error }));
  }

  const b: any = {
    select(fields = '*') { state.op = state.op === 'select' ? 'select' : state.op; state.select = fields; return b; },
    insert(payload: any) { state.op = 'insert'; state.payload = payload; return b; },
    update(payload: any) { state.op = 'update'; state.payload = payload; return b; },
    upsert(payload: any, opts?: { onConflict?: string }) { state.op = 'upsert'; state.payload = payload; if (opts?.onConflict) state.onConflict = opts.onConflict; return b; },
    delete() { state.op = 'delete'; return b; },
    eq(col: string, val: any) { state.filters.push({ col, op: 'eq', val }); return b; },
    neq(col: string, val: any) { state.filters.push({ col, op: 'neq', val }); return b; },
    gt(col: string, val: any) { state.filters.push({ col, op: 'gt', val }); return b; },
    gte(col: string, val: any) { state.filters.push({ col, op: 'gte', val }); return b; },
    lt(col: string, val: any) { state.filters.push({ col, op: 'lt', val }); return b; },
    lte(col: string, val: any) { state.filters.push({ col, op: 'lte', val }); return b; },
    like(col: string, val: any) { state.filters.push({ col, op: 'like', val }); return b; },
    ilike(col: string, val: any) { state.filters.push({ col, op: 'ilike', val }); return b; },
    in(col: string, val: any) { state.filters.push({ col, op: 'in', val }); return b; },
    is(col: string, val: any) { state.filters.push({ col, op: 'is', val }); return b; },
    or(expr: string) { state.filters.push({ col: '__or__', op: 'or', val: expr }); return b; },
    order(col: string, opts?: { ascending?: boolean }) { state.order = { col, asc: opts?.ascending !== false }; return b; },
    limit(n: number) { state.limit = n; return b; },
    range(from: number, to: number) { state.range = { from, to }; return b; },
    single() { state.limit = 1; return exec().then((r) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })); },
    maybeSingle() { state.limit = 1; return exec().then((r) => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })); },
    then(resolve: any, reject?: any) { return exec().then(resolve, reject); },
  };
  return b;
}

export const supabase = {
  from: (tbl: string) => tableBuilder(tbl),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: NOOP } } }),
    signUp: async () => ({ data: null, error: { message: 'Use useAuth().signUp() in new API' } }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Use useAuth().signIn()' } }),
    signInWithOAuth: async () => ({ data: null, error: { message: 'OAuth not supported in self-hosted build' } }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ data: null, error: null }),
  },
  functions: {
    invoke: async (name: string, opts?: { body?: any }) => {
      try {
        const data = await api.post(`/functions/${name}`, opts?.body || {});
        return { data, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'invoke_failed' } };
      }
    },
  },
  channel: (_name: string) => ({
    on: (_evt: string, _filter: any, _cb: any) => ({
      subscribe: (cb?: any) => { try { cb && cb('CLOSED'); } catch {} return { unsubscribe: NOOP }; },
    }),
    subscribe: (cb?: any) => { try { cb && cb('CLOSED'); } catch {} return { unsubscribe: NOOP }; },
  }),
  removeChannel: NOOP,
};
