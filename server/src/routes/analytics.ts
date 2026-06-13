import { Hono } from 'hono';
import { query, one } from '../db.js';
import { requireAuth, getUserId } from '../auth.js';

const r = new Hono();
r.use('*', requireAuth);

async function userOwnsCampaign(userId: string, campaignId: string) {
  return await one(
    `SELECT c.id FROM campaigns c JOIN projects p ON c.project_id = p.id
     WHERE c.id = $1 AND p.user_id = $2`,
    [campaignId, userId]
  );
}

// GET /analytics/full/:id?range=24h&excludeBots=1
r.get('/full/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const range = c.req.query('range') || '24h';
  const excludeBots = c.req.query('excludeBots') === '1';
  let interval = '24 hours';
  if (range === '7d') interval = '7 days';
  else if (range === '30d') interval = '30 days';
  else if (range === '1h') interval = '1 hour';

  // aggregates (older than 5 min)
  const { rows: aggregates } = await query(
    `SELECT variant_id, minute_ts, country, device, browser, os, lang,
            assigns, redirects_ok, redirects_fail, avg_ttr_ms, unique_visitors
     FROM aggregates_minute
     WHERE campaign_id = $1 AND minute_ts >= now() - $2::interval
           AND minute_ts < now() - interval '5 minutes'`,
    [id, interval]
  );

  // recent events_raw (last 5 minutes for real-time)
  const { rows: recentEvents } = await query(
    `SELECT id, event_type::text, ts, country, device, browser, os, lang, variant_id, time_to_redirect_ms
     FROM events_raw
     WHERE campaign_id = $1 AND ts >= now() - interval '5 minutes'`,
    [id]
  );

  // sessions for unique visitors / UTM / geo
  const botFilter = excludeBots ? `AND (is_bot_suspected IS NULL OR is_bot_suspected = false)` : '';
  const { rows: sessionsData } = await query(
    `SELECT id, utm_source, utm_medium, utm_campaign, gclid, fbclid, referrer,
            visitor_key_hash, is_bot_suspected, session_key, city, region, country,
            isp, is_mobile, is_proxy, started_at, entry_page, exit_page
     FROM sessions
     WHERE campaign_id = $1 AND started_at >= now() - $2::interval ${botFilter}`,
    [id, interval]
  );

  return c.json({ aggregates, recentEvents, sessionsData });
});

// realtime recent events for live view
r.get('/realtime/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const { rows } = await query(
    `SELECT id, event_type::text, ts, country, device, browser, variant_id, session_id
     FROM events_raw
     WHERE campaign_id = $1 AND ts >= now() - interval '10 minutes'
     ORDER BY ts DESC LIMIT 200`,
    [id]
  );
  return c.json({ data: rows });
});

// GET /analytics/campaign/:id?range=24h
r.get('/campaign/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const range = c.req.query('range') || '24h';
  let interval = '24 hours';
  if (range === '7d') interval = '7 days';
  else if (range === '30d') interval = '30 days';
  else if (range === '1h') interval = '1 hour';

  // From aggregates_minute for recent data
  const { rows: variantStats } = await query(
    `SELECT variant_id,
            SUM(assigns)::int AS assigns,
            SUM(redirects_ok)::int AS redirects_ok,
            SUM(redirects_fail)::int AS redirects_fail,
            AVG(NULLIF(avg_ttr_ms,0))::numeric(10,2) AS avg_ttr_ms,
            SUM(unique_visitors)::int AS unique_visitors
     FROM aggregates_minute
     WHERE campaign_id = $1 AND minute_ts >= now() - $2::interval
     GROUP BY variant_id`,
    [id, interval]
  );

  const { rows: timeline } = await query(
    `SELECT date_trunc('minute', minute_ts) AS bucket,
            SUM(assigns)::int AS assigns,
            SUM(redirects_ok)::int AS redirects_ok
     FROM aggregates_minute
     WHERE campaign_id = $1 AND minute_ts >= now() - $2::interval
     GROUP BY bucket ORDER BY bucket ASC`,
    [id, interval]
  );

  return c.json({ variantStats, timeline });
});

// GET /analytics/geo/:campaignId
r.get('/geo/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const { rows } = await query(
    `SELECT country, SUM(assigns)::int AS assigns, SUM(redirects_ok)::int AS redirects_ok
     FROM aggregates_minute
     WHERE campaign_id = $1 AND minute_ts >= now() - interval '7 days'
     GROUP BY country ORDER BY assigns DESC LIMIT 50`,
    [id]
  );
  return c.json({ data: rows });
});

// Events raw (debugging, last 100)
r.get('/events/:campaignId', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('campaignId');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const { rows } = await query(
    `SELECT id, event_type, ts, country, device, browser, os, time_to_redirect_ms, error_message, path
     FROM events_raw WHERE campaign_id = $1 ORDER BY ts DESC LIMIT 200`,
    [id]
  );
  return c.json({ data: rows });
});

// Sessions list
r.get('/sessions/:campaignId', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('campaignId');
  if (!(await userOwnsCampaign(userId, id))) return c.json({ error: 'not_found' }, 404);
  const { rows } = await query(
    `SELECT id, started_at, last_activity_at, country, city, device, browser, os, page_views,
            referrer, utm_source, utm_medium, utm_campaign, bot_score, is_bot_suspected
     FROM sessions WHERE campaign_id = $1 ORDER BY started_at DESC LIMIT 200`,
    [id]
  );
  return c.json({ data: rows });
});

export default r;
