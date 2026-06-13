/**
 * SplitTest Cloudflare Worker — edge proxy.
 * Adds CF geo headers + caches snippet (/snippet.js) at edge.
 *
 * Endpoints exposed at collect.splittest.app:
 *   GET  /assign?token=...&vk=...&path=...&lang=...&dnt=...&oq=...&bs=...
 *   POST /event   { token, event_type, ... }
 *   POST /validate { url, token }
 *   GET  /snippet.js?token=...  (cached 1h, returns JS)
 *   GET  /health
 */

export interface Env {
  API_BASE: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Max-Age': '86400',
};

function withCors(headers: HeadersInit = {}): HeadersInit {
  return { ...CORS, ...(headers as any) };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: withCors() });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, worker: 'collector' }), {
        headers: withCors({ 'content-type': 'application/json' }),
      });
    }

    // ---- snippet.js (cached) ----
    if (url.pathname === '/snippet.js') {
      const token = url.searchParams.get('token') || '';
      if (!/^[a-f0-9]{48}$/i.test(token)) {
        return new Response('// invalid token', {
          status: 400, headers: withCors({ 'content-type': 'application/javascript' }),
        });
      }
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      let cached = await cache.match(cacheKey);
      if (cached) return cached;
      const js = buildSnippetJs(token);
      const res = new Response(js, {
        headers: withCors({
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=300, s-maxage=300',
        }),
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    // ---- proxy to API ----
    if (url.pathname === '/assign' || url.pathname === '/event' || url.pathname === '/validate') {
      const apiUrl = env.API_BASE.replace(/\/$/, '') + '/collect' + url.pathname + url.search;
      const cf = (req as any).cf || {};

      const fwdHeaders = new Headers(req.headers);
      // Add CF geo for backend
      fwdHeaders.set('x-cf-country', cf.country || 'XX');
      if (cf.region) fwdHeaders.set('x-cf-region', cf.region);
      if (cf.city) fwdHeaders.set('x-cf-city', cf.city);
      const ip = req.headers.get('cf-connecting-ip') || '';
      if (ip) fwdHeaders.set('x-real-ip', ip);
      const ua = req.headers.get('user-agent') || '';
      if (ua) fwdHeaders.set('x-original-ua', ua);
      const ref = req.headers.get('referer') || '';
      if (ref) fwdHeaders.set('x-original-referer', ref);

      // Strip hop-by-hop
      fwdHeaders.delete('host');
      fwdHeaders.delete('connection');

      try {
        const apiRes = await fetch(apiUrl, {
          method: req.method,
          headers: fwdHeaders,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
        });
        const body = await apiRes.arrayBuffer();
        return new Response(body, {
          status: apiRes.status,
          headers: withCors({ 'content-type': apiRes.headers.get('content-type') || 'application/json' }),
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'upstream_failed', shouldRedirect: false }), {
          status: 502, headers: withCors({ 'content-type': 'application/json' }),
        });
      }
    }

    return new Response('not found', { status: 404, headers: withCors() });
  },
};

// ---------- snippet code ----------
function buildSnippetJs(token: string): string {
  // Snippet runs on customer site; it loads minimally, calls /assign, then redirects.
  return `/*! SplitTest snippet */
(function(){
  var ENDPOINT='https://collect.splittest.app/assign';
  var EVENT_URL='https://collect.splittest.app/event';
  var TOKEN='${token}';

  function getCookie(n){ var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]*)')); return m?decodeURIComponent(m[1]):''; }
  function setCookie(n,v,d){ var x=new Date(Date.now()+d*864e5).toUTCString(); document.cookie=n+'='+encodeURIComponent(v)+'; expires='+x+'; path=/; SameSite=Lax'; }
  function uuid(){ return (crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;var v=c=='x'?r:(r&0x3|0x8);return v.toString(16);}))); }
  function botSig(){
    try {
      var s = { wd: !!navigator.webdriver, pl: (navigator.plugins||{length:0}).length, ap: !!(window.callPhantom||window._phantom||(navigator.languages&&navigator.languages.length===0)) };
      return btoa(JSON.stringify(s));
    } catch(e) { return ''; }
  }

  var vk = getCookie('_sv') || uuid();
  setCookie('_sv', vk, 365);
  var sk = sessionStorage.getItem('_ss') || uuid();
  try { sessionStorage.setItem('_ss', sk); } catch(e){}

  var lang = (navigator.language || 'en').slice(0,5);
  var dnt = (navigator.doNotTrack==='1' || window.doNotTrack==='1') ? '1' : '0';
  var path = location.pathname || '/';
  var oq = location.search.replace(/^\\?/,'');

  var qs = '?token='+encodeURIComponent(TOKEN)
    + '&vk='+encodeURIComponent(vk)
    + '&sk='+encodeURIComponent(sk)
    + '&path='+encodeURIComponent(path)
    + '&lang='+encodeURIComponent(lang)
    + '&dnt='+dnt
    + '&oq='+encodeURIComponent(oq)
    + '&bs='+encodeURIComponent(botSig());

  var t0 = Date.now();
  fetch(ENDPOINT + qs, { credentials: 'omit', cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.shouldRedirect && d.url) {
        var elapsed = Date.now() - t0;
        // beacon event then redirect
        try {
          navigator.sendBeacon(EVENT_URL, JSON.stringify({
            token: TOKEN, event_type: 'redirect_ok', campaign_id: d.campaignId, variant_id: d.variantId,
            time_to_redirect_ms: elapsed, lang: lang, path: path, visitor_key_hash: vk, session_id: d.sessionId
          }));
        } catch(e){}
        if (d.softBlockDelay) setTimeout(function(){ location.href = d.url; }, d.softBlockDelay);
        else location.replace(d.url);
      }
    })
    .catch(function(e){
      try {
        navigator.sendBeacon(EVENT_URL, JSON.stringify({
          token: TOKEN, event_type: 'redirect_fail', error_message: String(e).slice(0,200), path: path
        }));
      } catch(_) {}
    });
})();`;
}
