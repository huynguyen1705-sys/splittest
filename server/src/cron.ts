import { query } from './db.js';

// Aggregate events_raw → aggregates_minute (every minute)
export async function aggregateEvents(): Promise<void> {
  try {
    await query(`
      INSERT INTO aggregates_minute (
        project_id, campaign_id, variant_id, minute_ts,
        country, device, browser, os, lang,
        assigns, redirects_ok, redirects_fail, avg_ttr_ms, unique_visitors, unique_sessions
      )
      SELECT
        project_id, campaign_id, variant_id,
        date_trunc('minute', ts) AS minute_ts,
        COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,''),
        COUNT(*) FILTER (WHERE event_type = 'assign')::int,
        COUNT(*) FILTER (WHERE event_type = 'redirect_ok')::int,
        COUNT(*) FILTER (WHERE event_type = 'redirect_fail')::int,
        AVG(time_to_redirect_ms) FILTER (WHERE event_type = 'redirect_ok'),
        COUNT(DISTINCT visitor_key_hash)::int,
        COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int
      FROM events_raw
      WHERE ts >= now() - interval '2 minutes' AND ts < date_trunc('minute', now())
      GROUP BY project_id, campaign_id, variant_id, date_trunc('minute', ts),
               COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,'')
      ON CONFLICT (project_id, campaign_id, minute_ts,
                   COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,''))
      DO UPDATE SET
        assigns = aggregates_minute.assigns + EXCLUDED.assigns,
        redirects_ok = aggregates_minute.redirects_ok + EXCLUDED.redirects_ok,
        redirects_fail = aggregates_minute.redirects_fail + EXCLUDED.redirects_fail,
        avg_ttr_ms = COALESCE((aggregates_minute.avg_ttr_ms + EXCLUDED.avg_ttr_ms) / 2, EXCLUDED.avg_ttr_ms),
        unique_visitors = GREATEST(aggregates_minute.unique_visitors, EXCLUDED.unique_visitors),
        unique_sessions = GREATEST(aggregates_minute.unique_sessions, EXCLUDED.unique_sessions)
    `);
  } catch (e) {
    console.error('[cron aggregate]', e);
  }
}

// Rollup minute → daily, drop old minute rows
export async function rollupDaily(): Promise<void> {
  try {
    await query(`
      INSERT INTO aggregates_daily (
        project_id, campaign_id, variant_id, day_ts,
        country, device, browser, os, lang,
        assigns, redirects_ok, redirects_fail, avg_ttr_ms, unique_visitors, unique_sessions
      )
      SELECT
        project_id, campaign_id, variant_id,
        (minute_ts AT TIME ZONE 'UTC')::date,
        COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,''),
        SUM(assigns)::int, SUM(redirects_ok)::int, SUM(redirects_fail)::int,
        AVG(NULLIF(avg_ttr_ms,0)),
        MAX(unique_visitors), MAX(unique_sessions)
      FROM aggregates_minute
      WHERE minute_ts < CURRENT_DATE AND minute_ts >= CURRENT_DATE - interval '2 days'
      GROUP BY project_id, campaign_id, variant_id, (minute_ts AT TIME ZONE 'UTC')::date,
               COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,'')
      ON CONFLICT (project_id, campaign_id, day_ts,
                   COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   COALESCE(country,''), COALESCE(device,''), COALESCE(browser,''), COALESCE(os,''), COALESCE(lang,''))
      DO UPDATE SET
        assigns = EXCLUDED.assigns,
        redirects_ok = EXCLUDED.redirects_ok,
        redirects_fail = EXCLUDED.redirects_fail
    `);
    // Keep aggregates_minute 7 days
    await query(`DELETE FROM aggregates_minute WHERE minute_ts < now() - interval '7 days'`);
  } catch (e) { console.error('[cron rollup]', e); }
}

// Drop old event partitions + create future partitions
export async function partitionMaintenance(): Promise<void> {
  try {
    // Create partitions for next 3 days
    for (let i = 0; i < 3; i++) {
      await query(`SELECT create_events_partition((CURRENT_DATE + $1::int))`, [i]);
    }

    // Drop partitions older than retention (default 14 days, take max from any project)
    const { rows: maxRetention } = await query(
      `SELECT COALESCE(MAX(data_retention_days), 14) AS max_days FROM projects`
    );
    const days = maxRetention[0]?.max_days || 14;

    // Find partitions to drop
    const cutoff = new Date(Date.now() - days * 86400_000);
    const { rows: partitions } = await query<{ partition: string }>(
      `SELECT inhrelid::regclass::text AS partition
       FROM pg_inherits
       WHERE inhparent = 'events_raw'::regclass`
    );
    for (const p of partitions) {
      const m = p.partition.match(/events_raw_(\d{4})(\d{2})(\d{2})/);
      if (!m) continue;
      const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      if (date < cutoff) {
        await query(`DROP TABLE IF EXISTS ${p.partition}`);
        console.log('[cron] dropped partition', p.partition);
      }
    }
  } catch (e) { console.error('[cron partition]', e); }
}

// Cleanup expired geo cache + reset tokens
export async function cleanup(): Promise<void> {
  try {
    await query(`DELETE FROM geo_cache WHERE expires_at < now()`);
    await query(`UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL WHERE reset_token_expires_at < now()`);
  } catch (e) { console.error('[cron cleanup]', e); }
}

export function startCron() {
  // Every minute: aggregate
  setInterval(() => { aggregateEvents(); }, 60_000);
  // Every 10 minutes: cleanup geo cache
  setInterval(() => { cleanup(); }, 10 * 60_000);
  // Every hour: partition maintenance + rollup
  setInterval(() => { partitionMaintenance(); rollupDaily(); }, 60 * 60_000);

  // Run once on boot
  setTimeout(() => {
    partitionMaintenance();
    aggregateEvents();
  }, 5000);
}
