/**
 * Stub for supabase.functions.invoke(name, ...) — wires to our endpoints
 * or returns no-op success for jobs that are run by our cron instead.
 */
import { Hono } from 'hono';
import { requireAuth, getUserId } from '../auth.js';
import { aggregateEvents } from '../cron.js';
import { query, one } from '../db.js';

const r = new Hono();

r.post('/:name', async (c) => {
  const name = c.req.param('name');
  const body: any = await c.req.json().catch(() => ({}));

  // Public-ish (no JWT): validate-snippet — checks if site contains token
  if (name === 'validate-snippet') {
    const { url, token } = body || {};
    if (!url || !token) return c.json({ success: false, error: 'url+token required' }, 400);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      const html = await res.text();
      return c.json({ success: true, installed: html.includes(token) });
    } catch (e: any) {
      return c.json({ success: false, error: e?.message || 'fetch_failed' });
    }
  }

  // aggregate-events — trigger cron manually
  if (name === 'aggregate-events') {
    aggregateEvents().catch(e => console.error(e));
    return c.json({ ok: true });
  }

  // cleanup-data — no-op (cron handles)
  if (name === 'cleanup-data') {
    return c.json({ ok: true });
  }

  // export-archive — requires auth
  if (name === 'export-archive') {
    const auth = c.req.header('Authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return c.json({ error: 'unauthorized' }, 401);
    // Verify token inline
    const { verifyToken } = await import('../auth.js');
    const payload = await verifyToken(m[1]);
    if (!payload) return c.json({ error: 'unauthorized' }, 401);

    const { campaignId, format = 'csv' } = body || {};
    if (!campaignId) return c.json({ error: 'campaignId required' }, 400);
    const ok = await one(`SELECT c.id FROM campaigns c JOIN projects p ON c.project_id = p.id
      WHERE c.id = $1 AND p.user_id = $2`, [campaignId, payload.sub]);
    if (!ok) return c.json({ error: 'not_found' }, 404);

    const { rows } = await query(
      `SELECT id, event_type::text, ts, country, city, region, device, browser, os, lang,
              time_to_redirect_ms, error_message, path, referrer
       FROM events_raw WHERE campaign_id = $1 ORDER BY ts DESC LIMIT 10000`,
      [campaignId]
    );

    if (format === 'json') {
      return c.json({ data: rows });
    }
    const header = Object.keys(rows[0] || { id: '' }).join(',');
    const body2 = rows.map(r => Object.values(r).map(v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    return c.json({ data: header + '\n' + body2 });
  }

  return c.json({ error: 'function_not_found' }, 404);
});

export default r;
