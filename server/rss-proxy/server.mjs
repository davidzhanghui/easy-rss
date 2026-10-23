/**
 * rss-proxy — zero-dependency transparent RSS/Atom fetch proxy.
 *
 * Purpose: let a browser-only RSS reader fetch feeds that lack CORS headers.
 * Listens on 127.0.0.1 and is meant to sit behind nginx (TLS + path routing).
 *
 *   GET /?url=<encoded target>          + token via ONE of:
 *        header  x-proxy-token: <secret>   (preferred: not written to access logs)
 *        header  Authorization: Bearer <secret>
 *        query   ?token=<secret>           (what the browser URL template uses)
 *     -> 200 + upstream body, Content-Type preserved, CORS header added
 *   GET /healthz -> 200 ok (no auth, for systemd/nginx checks)
 *
 * Safety (this is reachable from the internet, so no open-proxy shortcuts):
 *   - shared-secret token (env RSS_PROXY_TOKEN, required), constant-time compare
 *   - GET only, http/https only
 *   - SSRF: every address a hostname resolves to must be public unicast, and the
 *     socket connects to the SAME vetted address (no DNS-rebinding window);
 *     every redirect hop is re-validated
 *   - 15s upstream timeout, 5MB body cap
 *
 * Env:
 *   RSS_PROXY_PORT          default 8765
 *   RSS_PROXY_TOKEN         required
 *   RSS_PROXY_ALLOW_ORIGIN  CORS allow-origin, default '*'. Set it to your app's
 *                           origin (e.g. https://rss.example.com) to stop other
 *                           websites from using a leaked token from a browser.
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { hostIsPublic, pinnedLookup } from './ssrf.mjs';

const PORT = Number(process.env.RSS_PROXY_PORT || 8765);
const TOKEN = process.env.RSS_PROXY_TOKEN || '';
const ALLOW_ORIGIN = process.env.RSS_PROXY_ALLOW_ORIGIN || '*';
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_HOPS = 5;

if (!TOKEN) {
  console.error('[rss-proxy] FATAL: RSS_PROXY_TOKEN is not set');
  process.exit(1);
}

const digest = (s) => crypto.createHash('sha256').update(s).digest();
const TOKEN_DIGEST = digest(TOKEN);

/** Constant-time token check (hash first so lengths always match). */
function tokenOk(candidate) {
  return typeof candidate === 'string' && crypto.timingSafeEqual(digest(candidate), TOKEN_DIGEST);
}

function presentedToken(req, u) {
  const h = req.headers['x-proxy-token'];
  if (typeof h === 'string' && h) return h;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return u.searchParams.get('token') || '';
}

function corsHeaders() {
  const h = { 'access-control-allow-origin': ALLOW_ORIGIN };
  if (ALLOW_ORIGIN !== '*') h.vary = 'Origin';
  return h;
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : String(body);
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...corsHeaders(),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

/** One GET with connect-time IP pinning. Resolves with the IncomingMessage. */
function requestPinned(urlStr, signal) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      {
        method: 'GET',
        lookup: pinnedLookup,
        signal,
        headers: {
          'user-agent': 'easy-rss-proxy/1.0 (+local rss reader)',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'accept-encoding': 'identity', // raw http(s).request does not decompress
        },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://proxy');
    if (u.pathname === '/healthz') return send(res, 200, 'ok');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders(),
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'x-proxy-token, authorization',
        'content-length': '0',
      });
      return res.end();
    }
    if (req.method !== 'GET') return send(res, 405, 'method not allowed');
    if (!tokenOk(presentedToken(req, u))) return send(res, 403, 'forbidden');

    const target = (u.searchParams.get('url') || '').trim();
    if (!target) return send(res, 400, 'missing url');
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return send(res, 400, 'bad url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return send(res, 400, 'only http/https allowed');
    }
    // Early, cheap rejection (also the ONLY check for IP-literal hosts, which
    // skip DNS). Hostnames are re-vetted and pinned again at connect time.
    if (!(await hostIsPublic(parsed.hostname))) {
      console.warn(`[rss-proxy] blocked host: ${parsed.hostname}`);
      return send(res, 403, 'blocked host');
    }

    // Manual redirect following: EVERY hop is re-validated (protocol +
    // resolved IP), so a 302 to an internal/metadata address cannot bypass
    // the SSRF check. Max MAX_HOPS hops.
    let current = target;
    let upstream = null;
    let currentCtrl = null;
    const abortCurrent = () => {
      try {
        currentCtrl?.abort();
      } catch {
        /* already settled */
      }
    };
    req.on('close', abortCurrent);
    try {
      for (let hop = 0; hop <= MAX_HOPS; hop++) {
        currentCtrl = new AbortController();
        const timer = setTimeout(() => currentCtrl.abort(), TIMEOUT_MS);
        try {
          upstream = await requestPinned(current, currentCtrl.signal);
        } catch (e) {
          clearTimeout(timer);
          if (e?.code === 'EBLOCKED') {
            console.warn(`[rss-proxy] blocked at connect: ${new URL(current).hostname}`);
            return send(res, 403, 'blocked host');
          }
          console.warn(`[rss-proxy] upstream error ${parsed.hostname}: ${e.message}`);
          return send(res, 502, 'upstream fetch failed');
        }
        // Keep the timer running while the body streams; cleared on completion.
        upstream.once('end', () => clearTimeout(timer));
        upstream.once('error', () => clearTimeout(timer));

        const status = upstream.statusCode || 0;
        if (![301, 302, 303, 307, 308].includes(status)) break;
        upstream.resume(); // discard redirect body
        clearTimeout(timer);
        if (hop === MAX_HOPS) return send(res, 502, 'too many redirects');
        let next;
        try {
          next = new URL(upstream.headers.location || '', current);
        } catch {
          return send(res, 502, 'bad redirect location');
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          return send(res, 403, 'redirect to disallowed protocol');
        }
        if (!(await hostIsPublic(next.hostname))) {
          console.warn(`[rss-proxy] blocked redirect target: ${next.hostname}`);
          return send(res, 403, 'blocked redirect target');
        }
        current = next.toString();
        upstream = null;
      }
    } finally {
      req.off('close', abortCurrent);
    }
    if (!upstream) return send(res, 502, 'upstream fetch failed');
    const status = upstream.statusCode || 502;
    if (status < 200 || status >= 300) {
      upstream.resume();
      return send(res, status, `upstream http ${status}`);
    }
    const declared = Number(upstream.headers['content-length'] || 0);
    if (declared > MAX_BYTES) {
      upstream.destroy();
      return send(res, 413, 'upstream body too large');
    }

    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of upstream) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          upstream.destroy();
          return send(res, 413, 'upstream body too large');
        }
        chunks.push(chunk);
      }
    } catch {
      return send(res, 502, 'upstream body error');
    }
    const body = Buffer.concat(chunks);
    res.writeHead(200, {
      'content-type': upstream.headers['content-type'] || 'application/octet-stream',
      ...corsHeaders(),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-length': body.length,
    });
    res.end(body);
    console.log(`[rss-proxy] 200 ${body.length}B ${parsed.hostname}`);
  } catch (e) {
    console.error(`[rss-proxy] handler error: ${e.message}`);
    try {
      send(res, 500, 'internal error');
    } catch {
      /* socket already gone */
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[rss-proxy] listening on 127.0.0.1:${PORT}`);
});
