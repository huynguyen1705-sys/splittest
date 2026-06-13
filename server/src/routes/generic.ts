/**
 * Generic /q query endpoint — supports the shim supabase client.
 * Strictly enforces a whitelist of (table, ops) combinations, all scoped to current user.
 */
import { Hono } from 'hono';
import { query, one } from '../db.js';
import { requireAuth, getUserId } from '../auth.js';

const r = new Hono();
r.use('*', requireAuth);

// Whitelisted tables and allowed ops
const TABLES: Record<string, { ops: string[]; scopeColumn?: 'user_id' | 'project_id' | 'campaign_id_via_campaigns' }> = {
  projects: { ops: ['select','insert','update','delete','upsert'], scopeColumn: 'user_id' },
  campaigns: { ops: ['select','update','delete'], scopeColumn: 'project_id' },
  variants: { ops: ['select','insert','update','delete'], scopeColumn: 'campaign_id_via_campaigns' },
  campaign_rules: { ops: ['select','insert','update','delete'], scopeColumn: 'campaign_id_via_campaigns' },
  events_raw: { ops: ['select','insert'], scopeColumn: 'project_id' },
  aggregates_minute: { ops: ['select'], scopeColumn: 'project_id' },
  aggregates_daily: { ops: ['select'], scopeColumn: 'project_id' },
  sessions: { ops: ['select','update'], scopeColumn: 'project_id' },
  visitors: { ops: ['select'], scopeColumn: 'project_id' },
  bot_review_queue: { ops: ['select','update','delete'], scopeColumn: 'project_id' },
};

async function userProjectIds(userId: string): Promise<string[]> {
  const { rows } = await query(`SELECT id FROM projects WHERE user_id = $1`, [userId]);
  return rows.map(r => r.id);
}

async function userCampaignIds(userId: string): Promise<string[]> {
  const { rows } = await query(
    `SELECT c.id FROM campaigns c JOIN projects p ON c.project_id = p.id WHERE p.user_id = $1`, [userId]
  );
  return rows.map(r => r.id);
}

function buildWhere(filters: any[]): { sql: string; vals: any[] } {
  const parts: string[] = []; const vals: any[] = []; let i = 1;
  for (const f of (filters || [])) {
    if (!f || !f.col) continue;
    if (f.col === '__or__' && f.op === 'or') {
      // Parse expression like "is_bot_suspected.is.null,is_bot_suspected.eq.false"
      const ors = String(f.val).split(',').map((e: string) => {
        const m = e.match(/^([\w]+)\.(eq|neq|gt|gte|lt|lte|is|like|ilike)\.(.*)$/);
        if (!m) return null;
        const [, col, op, valRaw] = m;
        let val: any = valRaw;
        if (val === 'null') val = null;
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        if (op === 'is' && val === null) return `${col} IS NULL`;
        if (op === 'is') { vals.push(val); return `${col} IS $${i++}`; }
        const opMap: Record<string, string> = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };
        vals.push(val); return `${col} ${opMap[op]} $${i++}`;
      }).filter(Boolean);
      if (ors.length) parts.push('(' + ors.join(' OR ') + ')');
      continue;
    }
    switch (f.op) {
      case 'eq': vals.push(f.val); parts.push(`${f.col} = $${i++}`); break;
      case 'neq': vals.push(f.val); parts.push(`${f.col} != $${i++}`); break;
      case 'gt': vals.push(f.val); parts.push(`${f.col} > $${i++}`); break;
      case 'gte': vals.push(f.val); parts.push(`${f.col} >= $${i++}`); break;
      case 'lt': vals.push(f.val); parts.push(`${f.col} < $${i++}`); break;
      case 'lte': vals.push(f.val); parts.push(`${f.col} <= $${i++}`); break;
      case 'is':
        if (f.val === null) parts.push(`${f.col} IS NULL`);
        else if (f.val === true) parts.push(`${f.col} IS TRUE`);
        else if (f.val === false) parts.push(`${f.col} IS FALSE`);
        break;
      case 'in':
        if (Array.isArray(f.val) && f.val.length) {
          const placeholders = f.val.map(() => `$${i++}`).join(',');
          parts.push(`${f.col} IN (${placeholders})`); vals.push(...f.val);
        } else { parts.push('FALSE'); }
        break;
      case 'like': vals.push(f.val); parts.push(`${f.col} LIKE $${i++}`); break;
      case 'ilike': vals.push(f.val); parts.push(`${f.col} ILIKE $${i++}`); break;
    }
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', vals };
}

r.post('/', async (c) => {
  const userId = getUserId(c);
  const url = new URL(c.req.url);
  const tbl = url.searchParams.get('table') || '';
  const op = url.searchParams.get('op') || 'select';
  const cfg = TABLES[tbl];
  if (!cfg) return c.json({ error: 'table_not_allowed', data: null });
  if (!cfg.ops.includes(op)) return c.json({ error: 'op_not_allowed', data: null });

  let filters: any[] = [];
  try { filters = JSON.parse(url.searchParams.get('filters') || '[]'); } catch {}

  // Add scope filter
  if (cfg.scopeColumn === 'user_id') {
    filters = [...filters, { col: 'user_id', op: 'eq', val: userId }];
  } else if (cfg.scopeColumn === 'project_id') {
    const pids = await userProjectIds(userId);
    if (!pids.length) return c.json({ data: [], error: null });
    filters = [...filters, { col: 'project_id', op: 'in', val: pids }];
  } else if (cfg.scopeColumn === 'campaign_id_via_campaigns') {
    const cids = await userCampaignIds(userId);
    if (!cids.length) return c.json({ data: [], error: null });
    filters = [...filters, { col: 'campaign_id', op: 'in', val: cids }];
  }

  const payload = await c.req.json().catch(() => null);
  const order = url.searchParams.get('order');
  const limit = parseInt(url.searchParams.get('limit') || '0', 10);

  try {
    if (op === 'select') {
      const { sql: where, vals } = buildWhere(filters);
      let q = `SELECT * FROM ${tbl} ${where}`;
      if (order) {
        const [col, dir] = order.split(':');
        q += ` ORDER BY ${col} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
      }
      if (limit > 0) q += ` LIMIT ${limit}`;
      const { rows } = await query(q, vals);
      return c.json({ data: rows, error: null });
    }

    if (op === 'insert' || op === 'upsert') {
      const rows = Array.isArray(payload) ? payload : [payload];
      const out: any[] = [];
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(',');
        let q = `INSERT INTO ${tbl} (${cols.join(',')}) VALUES (${placeholders})`;
        if (op === 'upsert') {
          const oc = url.searchParams.get('onConflict');
          if (oc) {
            const upd = cols.filter(k => !oc.split(',').includes(k)).map(k => `${k} = EXCLUDED.${k}`).join(', ');
            q += ` ON CONFLICT (${oc}) DO UPDATE SET ${upd}`;
          } else {
            q += ` ON CONFLICT DO NOTHING`;
          }
        }
        q += ` RETURNING *`;
        const r = await one(q, vals);
        if (r) out.push(r);
      }
      return c.json({ data: rows.length === 1 ? out[0] : out, error: null });
    }

    if (op === 'update') {
      if (!payload) return c.json({ error: 'no_payload', data: null });
      const cols = Object.keys(payload);
      const vals = Object.values(payload);
      const sets = cols.map((k, idx) => `${k} = $${idx + 1}`).join(', ');
      const { sql: where, vals: wvals } = buildWhere(filters);
      if (!where) return c.json({ error: 'where_required', data: null });
      const allVals = [...vals, ...wvals];
      // shift placeholders in where since we already used $1..$N
      let offset = vals.length;
      let shifted = where.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + offset}`);
      const q = `UPDATE ${tbl} SET ${sets} ${shifted} RETURNING *`;
      const { rows } = await query(q, allVals);
      return c.json({ data: rows.length === 1 ? rows[0] : rows, error: null });
    }

    if (op === 'delete') {
      const { sql: where, vals } = buildWhere(filters);
      if (!where) return c.json({ error: 'where_required', data: null });
      await query(`DELETE FROM ${tbl} ${where}`, vals);
      return c.json({ data: null, error: null });
    }

    return c.json({ error: 'unknown_op', data: null });
  } catch (e: any) {
    console.error('[generic]', e);
    return c.json({ error: e.message || 'query_failed', data: null }, 200);
  }
});

export default r;
