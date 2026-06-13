import { Hono } from 'hono';
import { z } from 'zod';
import { query, one } from '../db.js';
import { requireAuth, getUserId } from '../auth.js';

const r = new Hono();
r.use('*', requireAuth);

async function userOwnsProject(userId: string, projectId: string): Promise<boolean> {
  const row = await one(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [projectId, userId]);
  return !!row;
}

async function userOwnsCampaign(userId: string, campaignId: string): Promise<{ project_id: string } | null> {
  const row = await one<{ project_id: string }>(
    `SELECT c.project_id FROM campaigns c JOIN projects p ON c.project_id = p.id
     WHERE c.id = $1 AND p.user_id = $2`,
    [campaignId, userId]
  );
  return row;
}

// List campaigns (filter by project_id) — includes variants + rules
r.get('/', async (c) => {
  const userId = getUserId(c);
  const projectId = c.req.query('project_id');
  if (!projectId) return c.json({ error: 'project_id_required' }, 400);
  if (!(await userOwnsProject(userId, projectId))) return c.json({ error: 'not_found' }, 404);

  const { rows } = await query(
    `SELECT c.*,
            COALESCE((SELECT json_agg(v.*) FROM variants v WHERE v.campaign_id = c.id), '[]'::json) AS variants,
            (SELECT row_to_json(r) FROM campaign_rules r WHERE r.campaign_id = c.id) AS campaign_rules
     FROM campaigns c
     WHERE c.project_id = $1
     ORDER BY c.created_at DESC`, [projectId]
  );
  return c.json({ data: rows });
});

const CreateCampaignSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  sticky_enabled: z.boolean().optional(),
  respect_dnt: z.boolean().optional(),
  start_at: z.string().datetime().nullable().optional(),
  end_at: z.string().datetime().nullable().optional(),
  priority: z.number().int().optional(),
  bot_action: z.string().optional(),
  bot_threshold: z.number().int().optional(),
  honeypot_url: z.string().nullable().optional(),
  bot_whitelist_ips: z.array(z.string()).optional(),
  bot_whitelist_uas: z.array(z.string()).optional(),
  bot_challenge_enabled: z.boolean().optional(),
  bot_soft_block_delay_ms: z.number().int().optional(),
});

r.post('/', async (c) => {
  const userId = getUserId(c);
  const parsed = CreateCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input', details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  if (!(await userOwnsProject(userId, d.project_id))) return c.json({ error: 'forbidden' }, 403);
  const row = await one(
    `INSERT INTO campaigns (project_id, name, status, sticky_enabled, respect_dnt, start_at, end_at, priority,
       bot_action, bot_threshold, honeypot_url, bot_whitelist_ips, bot_whitelist_uas, bot_challenge_enabled, bot_soft_block_delay_ms)
     VALUES ($1, $2, COALESCE($3::campaign_status, 'draft'), COALESCE($4, TRUE), COALESCE($5, TRUE), $6, $7, COALESCE($8, 0),
       COALESCE($9, 'flag_only'), COALESCE($10, 70), $11, COALESCE($12::text[], '{}'), COALESCE($13::text[], '{}'), COALESCE($14, FALSE), COALESCE($15, 3000))
     RETURNING *`,
    [d.project_id, d.name, d.status, d.sticky_enabled, d.respect_dnt, d.start_at, d.end_at, d.priority,
     d.bot_action, d.bot_threshold, d.honeypot_url, d.bot_whitelist_ips, d.bot_whitelist_uas, d.bot_challenge_enabled, d.bot_soft_block_delay_ms]
  );
  return c.json({ data: row }, 201);
});

r.get('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const owned = await userOwnsCampaign(userId, id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  const row = await one(
    `SELECT c.*,
            COALESCE((SELECT json_agg(v.*) FROM variants v WHERE v.campaign_id = c.id), '[]'::json) AS variants,
            (SELECT row_to_json(r) FROM campaign_rules r WHERE r.campaign_id = c.id) AS campaign_rules,
            row_to_json(p.*) AS projects
     FROM campaigns c JOIN projects p ON c.project_id = p.id
     WHERE c.id = $1`, [id]
  );
  return c.json({ data: row });
});

const UpdateCampaignSchema = CreateCampaignSchema.partial().omit({ project_id: true });
r.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const parsed = UpdateCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const owned = await userOwnsCampaign(userId, id);
  if (!owned) return c.json({ error: 'not_found' }, 404);

  const fields: string[] = []; const values: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'status') {
      fields.push(`status = $${i++}::campaign_status`);
    } else {
      fields.push(`${k} = $${i++}`);
    }
    values.push(v);
  }
  if (!fields.length) return c.json({ error: 'no_fields' }, 400);
  values.push(id);
  const row = await one(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return c.json({ data: row });
});

r.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const owned = await userOwnsCampaign(userId, id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  await query(`DELETE FROM campaigns WHERE id = $1`, [id]);
  return c.json({ ok: true });
});

// ----- Variants -----
const VariantSchema = z.object({
  name: z.string().min(1).max(120),
  destination_url: z.string().url(),
  weight: z.number().int().min(0).max(100).optional(),
  is_control: z.boolean().optional(),
});

r.get('/:id/variants', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const { rows } = await query(`SELECT * FROM variants WHERE campaign_id = $1 ORDER BY created_at ASC`, [id]);
  return c.json({ data: rows });
});

r.post('/:id/variants', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'forbidden' }, 403);
  const parsed = VariantSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const v = parsed.data;
  const row = await one(
    `INSERT INTO variants (campaign_id, name, destination_url, weight, is_control)
     VALUES ($1, $2, $3, COALESCE($4, 50), COALESCE($5, FALSE)) RETURNING *`,
    [id, v.name, v.destination_url, v.weight, v.is_control]
  );
  return c.json({ data: row }, 201);
});

r.patch('/:id/variants/:variantId', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const variantId = c.req.param('variantId');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'forbidden' }, 403);
  const parsed = VariantSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const fields: string[] = []; const values: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    fields.push(`${k} = $${i++}`); values.push(v);
  }
  if (!fields.length) return c.json({ error: 'no_fields' }, 400);
  values.push(variantId, id);
  const row = await one(`UPDATE variants SET ${fields.join(', ')} WHERE id = $${i} AND campaign_id = $${i+1} RETURNING *`, values);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: row });
});

r.delete('/:id/variants/:variantId', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const variantId = c.req.param('variantId');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'forbidden' }, 403);
  const { rowCount } = await query(`DELETE FROM variants WHERE id = $1 AND campaign_id = $2`, [variantId, id]);
  if (!rowCount) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ----- Campaign Rules -----
const RulesSchema = z.object({
  country_in: z.array(z.string()).optional(),
  device_in: z.array(z.string()).optional(),
  browser_in: z.array(z.string()).optional(),
  os_in: z.array(z.string()).optional(),
  lang_in: z.array(z.string()).optional(),
  include_paths: z.array(z.string()).optional(),
  url_match_mode: z.string().optional(),
});

r.get('/:id/rules', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const row = await one(`SELECT * FROM campaign_rules WHERE campaign_id = $1`, [id]);
  return c.json({ data: row });
});

r.put('/:id/rules', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'forbidden' }, 403);
  const parsed = RulesSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const d = parsed.data;
  const row = await one(
    `INSERT INTO campaign_rules (campaign_id, country_in, device_in, browser_in, os_in, lang_in, include_paths, url_match_mode)
     VALUES ($1, COALESCE($2::text[], '{}'::text[]), COALESCE($3::text[], '{}'::text[]), COALESCE($4::text[], '{}'::text[]), COALESCE($5::text[], '{}'::text[]), COALESCE($6::text[], '{}'::text[]), COALESCE($7::text[], '{}'::text[]), COALESCE($8, 'path_prefix'))
     ON CONFLICT (campaign_id) DO UPDATE SET
       country_in = EXCLUDED.country_in,
       device_in = EXCLUDED.device_in,
       browser_in = EXCLUDED.browser_in,
       os_in = EXCLUDED.os_in,
       lang_in = EXCLUDED.lang_in,
       include_paths = EXCLUDED.include_paths,
       url_match_mode = EXCLUDED.url_match_mode
     RETURNING *`,
    [id, d.country_in, d.device_in, d.browser_in, d.os_in, d.lang_in, d.include_paths, d.url_match_mode]
  );
  return c.json({ data: row });
});

export default r;
