import { Hono } from 'hono';
import { z } from 'zod';
import { query, one } from '../db.js';
import { requireAuth, getUserId } from '../auth.js';

const r = new Hono();
r.use('*', requireAuth);

r.get('/', async (c) => {
  const userId = getUserId(c);
  const { rows } = await query(
    `SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC`, [userId]
  );
  return c.json({ data: rows });
});

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  primary_domain: z.string().min(1).max(200),
  timezone: z.string().optional(),
  data_retention_days: z.number().int().min(1).max(365).optional(),
});

r.post('/', async (c) => {
  const userId = getUserId(c);
  const parsed = CreateProjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input', details: parsed.error.flatten() }, 400);
  const { name, primary_domain, timezone, data_retention_days } = parsed.data;
  const row = await one(
    `INSERT INTO projects (user_id, name, primary_domain, timezone, data_retention_days)
     VALUES ($1, $2, $3, COALESCE($4, 'UTC'), COALESCE($5, 14))
     RETURNING *`,
    [userId, name, primary_domain, timezone || null, data_retention_days || null]
  );
  return c.json({ data: row }, 201);
});

r.get('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const row = await one(`SELECT * FROM projects WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: row });
});

const UpdateProjectSchema = CreateProjectSchema.partial();
r.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const parsed = UpdateProjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const owned = await one(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!owned) return c.json({ error: 'not_found' }, 404);

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return c.json({ error: 'no_fields' }, 400);
  values.push(id);
  const row = await one(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return c.json({ data: row });
});

r.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const { rowCount } = await query(`DELETE FROM projects WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rowCount) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

export default r;
