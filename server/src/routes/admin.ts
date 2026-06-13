/**
 * Admin-only endpoints for app settings + user management.
 * Mounted at /admin. Requires JWT + is_admin = true.
 */
import { Hono } from 'hono';
import { query, one } from '../db.js';
import { requireAuth, getUserId } from '../auth.js';

const r = new Hono();
r.use('*', requireAuth);
r.use('*', async (c, next) => {
  const userId = getUserId(c);
  const u = await one<{ is_admin: boolean }>(`SELECT is_admin FROM users WHERE id = $1`, [userId]);
  if (!u || !u.is_admin) return c.json({ error: 'forbidden' }, 403);
  await next();
});

// GET /admin/settings — return all settings as key→value object
r.get('/settings', async (c) => {
  const { rows } = await query<{ key: string; value: any }>(`SELECT key, value FROM app_settings`);
  const out: Record<string, any> = {};
  for (const r of rows) out[r.key] = r.value;
  return c.json(out);
});

// PUT /admin/settings/:key — upsert single setting
r.put('/settings/:key', async (c) => {
  const key = c.req.param('key');
  const body: any = await c.req.json().catch(() => null);
  if (!body || typeof body.value === 'undefined') return c.json({ error: 'value_required' }, 400);
  const userId = getUserId(c);
  await query(
    `INSERT INTO app_settings(key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(body.value), userId]
  );
  return c.json({ ok: true });
});

// GET /admin/users — list users
r.get('/users', async (c) => {
  const { rows } = await query(
    `SELECT id, email, full_name, is_admin, email_verified, created_at,
       (SELECT COUNT(*) FROM projects WHERE user_id = users.id) AS project_count
     FROM users ORDER BY created_at DESC LIMIT 200`
  );
  return c.json({ users: rows });
});

// PATCH /admin/users/:id — toggle is_admin
r.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body: any = await c.req.json().catch(() => ({}));
  const sets: string[] = []; const vals: any[] = [];
  if (typeof body.is_admin === 'boolean') { vals.push(body.is_admin); sets.push(`is_admin = $${vals.length}`); }
  if (!sets.length) return c.json({ error: 'no_fields' }, 400);
  vals.push(id);
  const row = await one(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING id, email, is_admin`, vals);
  return c.json({ user: row });
});

// DELETE /admin/users/:id — delete user (cascade projects/campaigns/etc.)
r.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const me = getUserId(c);
  if (id === me) return c.json({ error: 'cannot_delete_self' }, 400);
  await query(`DELETE FROM users WHERE id = $1`, [id]);
  return c.json({ ok: true });
});

export default r;
