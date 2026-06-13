/**
 * Public endpoints called by Cloudflare Worker (or directly by snippet).
 * No JWT auth — uses project's publishable_token.
 */
import { Hono } from 'hono';
import crypto from 'node:crypto';
import { query, one, pool } from '../db.js';

const r = new Hono();

// ============== in-memory caches (10-30s TTL) ==============
const projectCache = new Map<string, { project: { id: string; primary_domain: string }; exp: number }>();
const campaignsCache = new Map<string, { campaigns: any[]; exp: number }>();
const PROJECT_TTL = 60_000; // 60s — project rarely changes
const CAMPAIGN_TTL = 15_000; // 15s — fast propagation of rule changes

function getCachedProject(token: string) {
  const c = projectCache.get(token);
  if (c && c.exp > Date.now()) return c.project;
  return null;
}
function setCachedProject(token: string, project: { id: string; primary_domain: string }) {
  projectCache.set(token, { project, exp: Date.now() + PROJECT_TTL });
  if (projectCache.size > 500) {
    // simple LRU-ish trim
    const now = Date.now();
    for (const [k, v] of projectCache) if (v.exp < now) projectCache.delete(k);
  }
}
function getCachedCampaigns(projectId: string) {
  const c = campaignsCache.get(projectId);
  if (c && c.exp > Date.now()) return c.campaigns;
  return null;
}
function setCachedCampaigns(projectId: string, campaigns: any[]) {
  campaignsCache.set(projectId, { campaigns, exp: Date.now() + CAMPAIGN_TTL });
}
export function invalidateCampaignCache(projectId: string) {
  campaignsCache.delete(projectId);
}

// ============== utils ==============
function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function parseUserAgent(ua: string) {
  const device = /mobile/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop';
  let browser = 'other';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'chrome';
  else if (/firefox/i.test(ua)) browser = 'firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'safari';
  else if (/edg/i.test(ua)) browser = 'edge';
  else if (/opera|opr/i.test(ua)) browser = 'opera';
  let os = 'other';
  if (/windows/i.test(ua)) os = 'windows';
  else if (/mac/i.test(ua)) os = 'macos';
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = 'linux';
  else if (/android/i.test(ua)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  return { device, browser, os };
}

function selectVariant(variants: Array<{ id: string; weight: number }>): string {
  const total = variants.reduce((s, v) => s + (v.weight || 0), 0) || variants.length;
  let r = Math.random() * total;
  for (const v of variants) {
    r -= (v.weight || 0);
    if (r <= 0) return v.id;
  }
  return variants[0].id;
}

function normalizePath(p: string) {
  if (!p) return '/';
  return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p;
}

function isValidHttpUrl(s: string): boolean {
  if (!s || !s.trim()) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function buildFinalUrl(dest: string, path: string, oq: string): string {
  if (!dest) return '';
  if (!isValidHttpUrl(dest.replace('/*', ''))) return '';
  let final = dest;
  try {
    if (final.includes('/*')) {
      const base = final.replace('/*', '');
      const u = new URL(base);
      const vp = path.startsWith('/') ? path.slice(1) : path;
      u.pathname = u.pathname.replace(/\/$/, '') + '/' + vp;
      final = u.toString();
    }
    if (oq) {
      const u = new URL(final);
      const orig = new URLSearchParams(oq);
      orig.forEach((v, k) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); });
      final = u.toString();
    }
  } catch {}
  return final;
}

// ============== rule matching ==============
function matchesRules(rules: any, ctx: any): boolean {
  if (!rules) return true;
  if (rules.country_in?.length && !rules.country_in.includes(ctx.country)) return false;
  if (rules.device_in?.length && !rules.device_in.includes(ctx.device)) return false;
  if (rules.browser_in?.length && !rules.browser_in.includes(ctx.browser)) return false;
  if (rules.os_in?.length && !rules.os_in.includes(ctx.os)) return false;
  if (rules.lang_in?.length && !rules.lang_in.includes(ctx.lang)) return false;

  if (rules.include_paths?.length) {
    const mode = rules.url_match_mode || 'path_prefix';
    const full = ctx.path + (ctx.query ? '?' + ctx.query : '');
    const ok = rules.include_paths.some((pat: string) => {
      if (!pat) return false;
      switch (mode) {
        case 'exact_path':
          if (ctx.query?.length > 0) return false;
          return normalizePath(ctx.path) === normalizePath(pat.replace(/\*$/, ''));
        case 'path_prefix':
          if (pat.endsWith('*')) return ctx.path.startsWith(pat.slice(0, -1));
          return normalizePath(ctx.path) === normalizePath(pat);
        case 'full_url_prefix':
          if (pat.endsWith('*')) return full.startsWith(pat.slice(0, -1));
          return full === pat || full.startsWith(pat + '?');
        default:
          return false;
      }
    });
    if (!ok) return false;
  }
  return true;
}

// ============== bot detection ==============
const KNOWN_BOTS = ['bot','crawler','spider','headless','phantom','selenium','puppeteer','playwright','webdriver','lighthouse','googlebot','bingbot','yandexbot','baiduspider','duckduckbot','slurp','facebookexternalhit','twitterbot','linkedinbot','whatsapp','telegrambot','applebot','semrushbot','ahrefsbot','mj12bot','dotbot','rogerbot'];
const SUSPICIOUS_UA = [/^mozilla\/5\.0$/i,/^$/,/^curl\//i,/^wget\//i,/^python-requests/i,/^axios\//i,/^node-fetch/i,/^go-http-client/i,/^java\//i];

function detectBot(ua: string, headers: Record<string, string | undefined>, clientSignalsB64?: string) {
  const sig: any = { webdriver: false, noPlugins: false, knownBotUA: false, suspiciousUA: false, missingHeaders: false, automationProps: false };
  const lc = (ua || '').toLowerCase();
  for (const p of KNOWN_BOTS) if (lc.includes(p)) { sig.knownBotUA = true; break; }
  for (const p of SUSPICIOUS_UA) if (p.test(ua || '')) { sig.suspiciousUA = true; break; }
  if (!headers['accept-language'] || !headers['accept-encoding'] || !headers['accept']) sig.missingHeaders = true;
  if (clientSignalsB64) {
    try {
      const parsed = JSON.parse(Buffer.from(clientSignalsB64, 'base64').toString());
      if (parsed.wd === true) sig.webdriver = true;
      if (parsed.pl === 0) sig.noPlugins = true;
      if (parsed.ap === true) sig.automationProps = true;
    } catch {}
  }
  let score = 0;
  if (sig.webdriver) score += 40;
  if (sig.noPlugins) score += 15;
  if (sig.knownBotUA) score += 50;
  if (sig.suspiciousUA) score += 20;
  if (sig.missingHeaders) score += 10;
  if (sig.automationProps) score += 25;
  score = Math.min(score, 100);
  return { score, signals: sig, isSuspected: score >= 70 };
}

function isWhitelisted(ip: string, ua: string, ipsW: string[] = [], uasW: string[] = []): boolean {
  if (ipsW.includes(ip)) return true;
  const lc = (ua || '').toLowerCase();
  for (const p of uasW) if (p && lc.includes(p.toLowerCase())) return true;
  return false;
}

// ============== ASSIGN ==============
r.options('/assign', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'content-type, authorization');
  return c.body(null, 204);
});

r.get('/assign', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  const u = new URL(c.req.url);
  const q = u.searchParams;
  const token = q.get('token') || '';
  const visitorKey = q.get('vk') || '';
  const sessionKey = q.get('sk') || '';
  const path = q.get('path') || '/';
  const lang = q.get('lang') || 'en';
  const dnt = q.get('dnt') === '1';
  const originalQuery = q.get('oq') || '';
  const botSignalsParam = q.get('bs') || '';

  // CF passes geo + ip via headers (proxied from Worker)
  const cfCountry = c.req.header('x-cf-country') || 'US';
  const cfCity = c.req.header('x-cf-city') || null;
  const cfRegion = c.req.header('x-cf-region') || null;
  const clientIP = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
  const userAgent = c.req.header('x-original-ua') || c.req.header('user-agent') || '';
  const referrer = c.req.header('x-original-referer') || c.req.header('referer') || '';

  if (!token || !/^[a-f0-9]{48}$/i.test(token)) {
    return c.json({ error: 'invalid_token', shouldRedirect: false }, 401);
  }

  let project = getCachedProject(token);
  if (!project) {
    project = await one<{ id: string; primary_domain: string }>(
      `SELECT id, primary_domain FROM projects WHERE publishable_token = $1`, [token]
    );
    if (!project) return c.json({ error: 'invalid_token', shouldRedirect: false }, 401);
    setCachedProject(token, project);
  }

  const ipHash = sha256(clientIP);
  const { device, browser, os } = parseUserAgent(userAgent);

  // UTM
  const origParams = new URLSearchParams(originalQuery);
  const utmSource = origParams.get('utm_source') || null;
  const utmMedium = origParams.get('utm_medium') || null;
  const utmCampaign = origParams.get('utm_campaign') || null;
  const gclid = origParams.get('gclid') || null;
  const fbclid = origParams.get('fbclid') || null;

  const ctx = { country: cfCountry, device, browser, os, lang, path, query: originalQuery };

  // Active campaigns (with variants + rules) — cached 15s
  let campaigns = getCachedCampaigns(project.id);
  if (!campaigns) {
    const res = await query<any>(
      `SELECT c.id, c.sticky_enabled, c.respect_dnt, c.bot_action, c.bot_threshold, c.honeypot_url,
              c.bot_whitelist_ips, c.bot_whitelist_uas, c.bot_soft_block_delay_ms,
              COALESCE(
                (SELECT json_agg(json_build_object('id', v.id, 'destination_url', v.destination_url, 'weight', v.weight, 'is_control', v.is_control))
                 FROM variants v WHERE v.campaign_id = c.id), '[]'::json
              ) AS variants,
              (SELECT row_to_json(r) FROM campaign_rules r WHERE r.campaign_id = c.id) AS rules
       FROM campaigns c
       WHERE c.project_id = $1 AND c.status = 'active'
       ORDER BY c.priority DESC, c.created_at DESC`,
      [project.id]
    );
    campaigns = res.rows;
    setCachedCampaigns(project.id, campaigns);
  }

  if (!campaigns.length) return c.json({ shouldRedirect: false, reason: 'no_active_campaigns' });

  // Prefer campaigns with specific path rules over catch-all (paths empty).
  // Within same specificity, follow ORDER BY priority DESC, created_at DESC.
  const specific: any[] = [];
  const catchAll: any[] = [];
  for (const camp of campaigns) {
    if (!camp.variants?.length) continue;
    if (camp.rules?.include_paths?.length) specific.push(camp);
    else catchAll.push(camp);
  }
  let matched: any = null;
  for (const camp of [...specific, ...catchAll]) {
    if (matchesRules(camp.rules, ctx)) { matched = camp; break; }
  }
  if (!matched) return c.json({ shouldRedirect: false, reason: 'no_matching_rules' });

  // Bot detection
  const bot = detectBot(userAgent, {
    'accept-language': c.req.header('accept-language'),
    'accept-encoding': c.req.header('accept-encoding'),
    'accept': c.req.header('accept'),
  }, botSignalsParam);

  const whitelisted = isWhitelisted(clientIP, userAgent, matched.bot_whitelist_ips || [], matched.bot_whitelist_uas || []);
  let botAction: any = { action: 'allow', reason: 'whitelisted' };
  if (!whitelisted) {
    const score = bot.score;
    const thresh = matched.bot_threshold || 70;
    if (score < thresh) botAction = { action: 'allow', reason: 'below_threshold' };
    else switch (matched.bot_action || 'flag_only') {
      case 'block': botAction = { action: 'block', reason: 'blocked' }; break;
      case 'soft_block': botAction = { action: 'soft_block', reason: 'soft_blocked', delay: matched.bot_soft_block_delay_ms || 3000 }; break;
      case 'redirect_honeypot': botAction = matched.honeypot_url ? { action: 'honeypot', url: matched.honeypot_url } : { action: 'allow_flagged' }; break;
      default: botAction = { action: 'allow_flagged' };
    }
  }

  if (botAction.action === 'block') {
    return c.json({ shouldRedirect: false, reason: 'bot_detected', botScore: bot.score });
  }
  if (botAction.action === 'honeypot' && botAction.url) {
    if (!isValidHttpUrl(botAction.url)) return c.json({ shouldRedirect: false, error: 'invalid_honeypot' }, 500);
    return c.json({ shouldRedirect: true, url: botAction.url, reason: 'honeypot_redirect', botScore: bot.score });
  }

  // DNT
  if (matched.respect_dnt && dnt) {
    const vid = selectVariant(matched.variants);
    const v = matched.variants.find((x: any) => x.id === vid);
    return c.json({
      shouldRedirect: true, url: buildFinalUrl(v?.destination_url || '', path, originalQuery),
      campaignId: matched.id, variantId: vid, dnt: true,
    });
  }

  const actualVK = visitorKey || crypto.randomUUID();
  const vkHash = sha256(actualVK);
  const sessionWindow = 30 * 60 * 1000;
  const wk = Math.floor(Date.now() / sessionWindow).toString();
  const sessionId = sha256(vkHash + wk);

  // Check existing assign this session
  const existing = await one<{ variant_id: string }>(
    `SELECT variant_id FROM events_raw
     WHERE campaign_id = $1 AND visitor_key_hash = $2 AND session_id = $3 AND event_type = 'assign'
     ORDER BY ts DESC LIMIT 1`,
    [matched.id, vkHash, sessionId]
  );
  if (existing) {
    const v = matched.variants.find((x: any) => x.id === existing.variant_id);
    return c.json({
      shouldRedirect: true, url: buildFinalUrl(v?.destination_url || '', path, originalQuery),
      campaignId: matched.id, variantId: existing.variant_id, visitorKey: actualVK, cached: true, ttl: 86400,
      ...(botAction.action === 'soft_block' && { softBlockDelay: botAction.delay }),
    });
  }

  // Get/create visitor + assignment
  const client = await pool.connect();
  let selectedVid: string;
  try {
    const ev = await client.query(
      `INSERT INTO visitors (project_id, visitor_key_hash)
       VALUES ($1, $2)
       ON CONFLICT (project_id, visitor_key_hash)
       DO UPDATE SET last_seen_at = now()
       RETURNING id`,
      [project.id, vkHash]
    );
    const visitorId = ev.rows[0].id;

    if (matched.sticky_enabled) {
      const ea = await client.query(
        `SELECT variant_id FROM assignments WHERE campaign_id = $1 AND visitor_id = $2 LIMIT 1`,
        [matched.id, visitorId]
      );
      if (ea.rows.length) {
        selectedVid = ea.rows[0].variant_id;
      } else {
        selectedVid = selectVariant(matched.variants);
        await client.query(
          `INSERT INTO assignments (campaign_id, visitor_id, variant_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (campaign_id, visitor_id) DO NOTHING`,
          [matched.id, visitorId, selectedVid]
        );
      }
    } else {
      selectedVid = selectVariant(matched.variants);
    }

    const v = matched.variants.find((x: any) => x.id === selectedVid);
    const finalUrl = buildFinalUrl(v?.destination_url || '', path, originalQuery);

    // Log event + session in parallel (after response)
    Promise.all([
      client.query(
        `INSERT INTO events_raw (project_id, campaign_id, variant_id, event_type, country, city, region, device, browser, os, lang, visitor_key_hash, session_id, ip_hash, path, referrer, user_agent)
         VALUES ($1, $2, $3, 'assign', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [project.id, matched.id, selectedVid, cfCountry, cfCity, cfRegion, device, browser, os, lang,
         vkHash, sessionId, ipHash, path, referrer.slice(0, 500), userAgent.slice(0, 500)]
      ),
      client.query(
        `INSERT INTO sessions (project_id, campaign_id, visitor_key_hash, session_key, entry_page, exit_page,
           country, city, region, device, browser, os, referrer, utm_source, utm_medium, utm_campaign, gclid, fbclid,
           last_activity_at, bot_score, bot_signals, is_bot_suspected)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), $18, $19, $20)
         ON CONFLICT (project_id, session_key)
         DO UPDATE SET last_activity_at = now(), page_views = sessions.page_views + 1, exit_page = EXCLUDED.exit_page`,
        [project.id, matched.id, vkHash, sessionKey || sessionId, path,
         cfCountry, cfCity, cfRegion, device, browser, os, referrer.slice(0, 500),
         utmSource, utmMedium, utmCampaign, gclid, fbclid,
         bot.score, JSON.stringify(bot.signals), bot.isSuspected || botAction.action !== 'allow']
      ),
    ]).catch(e => console.error('[assign log]', e)).finally(() => client.release());

    return c.json({
      shouldRedirect: true, url: finalUrl, campaignId: matched.id, variantId: selectedVid,
      visitorKey: actualVK, sessionId, cached: false, ttl: 86400,
      ...(botAction.action === 'soft_block' && { softBlockDelay: botAction.delay }),
      ...(bot.isSuspected && { botScore: bot.score }),
    });
  } catch (e) {
    client.release();
    console.error('[assign]', e);
    return c.json({ error: 'internal', shouldRedirect: false }, 500);
  }
});

// ============== COLLECT (track events: redirect_ok/redirect_fail/goal) ==============
r.options('/event', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'content-type');
  return c.body(null, 204);
});

r.post('/event', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  const body: any = await c.req.json().catch(() => ({}));
  const token = body.token || '';
  if (!token || !/^[a-f0-9]{48}$/i.test(token)) return c.json({ ok: false, error: 'invalid_token' }, 401);
  const project = await one<{ id: string }>(`SELECT id FROM projects WHERE publishable_token = $1`, [token]);
  if (!project) return c.json({ ok: false, error: 'invalid_token' }, 401);

  const eventType = body.event_type || 'redirect_ok';
  if (!['assign','redirect_ok','redirect_fail','goal'].includes(eventType)) return c.json({ ok: false, error: 'invalid_type' }, 400);

  await query(
    `INSERT INTO events_raw (project_id, campaign_id, variant_id, event_type,
       country, city, region, device, browser, os, lang,
       time_to_redirect_ms, error_message, visitor_key_hash, session_id, ip_hash, path, referrer, user_agent, meta_json)
     VALUES ($1,$2,$3,$4::event_type,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      project.id,
      body.campaign_id || null,
      body.variant_id || null,
      eventType,
      body.country || c.req.header('x-cf-country') || null,
      body.city || null,
      body.region || null,
      body.device || null,
      body.browser || null,
      body.os || null,
      body.lang || null,
      body.time_to_redirect_ms || null,
      body.error_message || null,
      body.visitor_key_hash || null,
      body.session_id || null,
      body.ip_hash || null,
      (body.path || '').slice(0, 500),
      (body.referrer || '').slice(0, 500),
      (body.user_agent || c.req.header('x-original-ua') || '').slice(0, 500),
      body.meta_json || {},
    ]
  );

  return c.json({ ok: true });
});

// ============== validate snippet ==============
r.post('/validate', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  const { url, token } = await c.req.json().catch(() => ({} as any));
  if (!url || !token) return c.json({ success: false, error: 'url+token required' }, 400);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    const html = await res.text();
    const found = html.includes(token);
    return c.json({ success: true, installed: found });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'fetch_failed' }, 200);
  }
});

export default r;
