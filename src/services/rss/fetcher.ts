/**
 * RSS Fetch Proxy abstraction.
 *
 * Architecture:
 *   RSSFetcher -> (proxy strategy) -> raw XML text -> FeedParser
 *
 * Default chain (VITE_RSS_PROXY=auto):
 *   Browser direct (5s) -> Custom self-hosted proxy, if configured (10s)
 *     -> structured error with per-strategy diagnostics.
 * Public CORS proxies are NOT in the default chain: they rate-limit (429),
 * are unstable, and would leak private subscription URLs/params to third
 * parties. They remain available as explicit opt-in modes for experiments:
 *   VITE_RSS_PROXY=allorigins|corslol|codetabs
 *
 * Circuit breaker: a strategy that fails with a *reachability* error
 * (timeout / network / connection refused) is skipped for the next
 * BREAKER_COOLDOWN_MS, so a dead SSH tunnel or proxy costs one slow attempt
 * instead of 10 seconds per feed per refresh. HTTP-level responses (4xx/5xx)
 * mean "reachable but unhappy" and do NOT trip the breaker.
 *
 * Strategies (swappable without touching business code):
 *   - Browser Fetch (direct)
 *   - Custom self-hosted proxy via VITE_RSS_PROXY_URL (must contain {url})
 *   - Future: Cloudflare Worker / Vercel Function (implement FetchProxy)
 */

export interface FetchProxy {
  name: string;
  /** Per-strategy budget: direct is cheap to fail, proxies may be slower. */
  timeoutMs: number;
  fetchText(url: string, signal: AbortSignal): Promise<string>;
}

export type FetchErrorCode =
  | 'network'
  | 'cors'
  | 'timeout'
  | 'http'
  | 'rateLimited'
  | 'tooLarge';

export type AttemptCode =
  | 'ok'
  | 'cors-or-network'
  | 'connectionRefused'
  | 'timeout'
  | 'http'
  | 'rateLimited'
  | 'tooLarge'
  | 'not-configured'
  | 'skipped';

export interface FetchAttempt {
  strategy: string;
  code: AttemptCode;
  status?: number;
  ms: number;
}

export class FetchError extends Error {
  code: FetchErrorCode;
  status?: number;
  attempts: FetchAttempt[];
  /** Strategy that produced this error (for breaker bookkeeping). */
  strategy?: string;
  /** True when the peer was unreachable (timeout/network/refused). */
  unreachable: boolean;
  constructor(
    code: FetchErrorCode,
    message: string,
    status?: number,
    attempts: FetchAttempt[] = [],
    opts: { strategy?: string; unreachable?: boolean } = {},
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.attempts = attempts;
    this.strategy = opts.strategy;
    this.unreachable = opts.unreachable ?? (code === 'network' || code === 'timeout');
  }
}

/* ---------- Circuit breaker ---------- */

const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
const breakerLastFailure = new Map<string, number>();

function breakerTrips(strategy: string): boolean {
  const last = breakerLastFailure.get(strategy);
  if (last === undefined) return false;
  if (Date.now() - last > BREAKER_COOLDOWN_MS) {
    breakerLastFailure.delete(strategy);
    return false;
  }
  return true;
}

function breakerReport(strategy: string, ok: boolean): void {
  if (ok) breakerLastFailure.delete(strategy);
  else breakerLastFailure.set(strategy, Date.now());
}

/** Test seam / manual reset (e.g. when the user reconfigures the proxy). */
export function resetFetchBreaker(): void {
  breakerLastFailure.clear();
}

/* ---------- Strategies ---------- */

async function readText(res: Response): Promise<string> {
  return res.text();
}

function connectionRefused(e: unknown): boolean {
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  if (typeof code === 'string') {
    return /^(ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ECONNRESET)$/.test(code);
  }
  const msg = String((e as Error)?.message ?? '');
  return /ECONNREFUSED|failed to fetch|networkerror/i.test(msg);
}

function classifyFetchFailure(e: unknown): FetchError {
  if ((e as Error)?.name === 'AbortError') return new FetchError('timeout', 'timeout');
  if (connectionRefused(e)) return new FetchError('network', 'connection refused');
  return new FetchError('network', 'network');
}

class DirectProxy implements FetchProxy {
  name = 'direct';
  timeoutMs = 5000;
  async fetchText(url: string, signal: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await fetch(url, { signal, redirect: 'follow' });
    } catch (e) {
      // NOTE: browsers surface CORS rejections as plain TypeError, identical
      // to offline/DNS failures. Callers label this honestly as
      // "cors-or-network" instead of guessing.
      throw classifyFetchFailure(e);
    }
    if (res.status === 429) throw new FetchError('rateLimited', 'rateLimited', 429);
    if (res.status === 413) throw new FetchError('tooLarge', 'tooLarge', 413);
    if (!res.ok) throw new FetchError('http', `HTTP ${res.status}`, res.status);
    const text = await readText(res);
    if (!text || text.trim().length < 20) throw new FetchError('network', 'network');
    return text;
  }
}

function proxyUrl(base: string, target: string): string {
  return base.replace('{url}', encodeURIComponent(target));
}

class QueryProxy implements FetchProxy {
  name: string;
  timeoutMs = 10000;
  private template: string;
  private extract: (raw: string) => string;
  constructor(name: string, template: string, extract?: (raw: string) => string) {
    this.name = name;
    this.template = template;
    this.extract = extract ?? ((s) => s);
  }
  async fetchText(url: string, signal: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await fetch(proxyUrl(this.template, url), { signal });
    } catch (e) {
      throw classifyFetchFailure(e);
    }
    if (res.status === 429) throw new FetchError('rateLimited', 'rateLimited', 429);
    if (res.status === 413) throw new FetchError('tooLarge', 'tooLarge', 413);
    if (!res.ok) throw new FetchError('http', `HTTP ${res.status}`, res.status);
    const raw = await readText(res);
    try {
      return this.extract(raw);
    } catch {
      throw new FetchError('network', 'network');
    }
  }
}

function proxyMode(): string {
  return (import.meta.env.VITE_RSS_PROXY as string) || 'auto';
}

function customProxyUrl(): string | undefined {
  return import.meta.env.VITE_RSS_PROXY_URL as string | undefined;
}

function buildProxies(): FetchProxy[] {
  const mode = proxyMode();
  const customUrl = customProxyUrl();
  const allorigins = new QueryProxy('allorigins', 'https://api.allorigins.win/raw?url={url}');
  // NOTE: corsproxy.io now requires an API key for anonymous use (HTTP 401),
  // so it is no longer offered. cors.lol is a compatible raw-passthrough
  // alternative with the same ?url= semantics.
  const corslol = new QueryProxy('corslol', 'https://api.cors.lol/?url={url}');
  const codetabs = new QueryProxy('codetabs', 'https://api.codetabs.com/v1/proxy?quest={url}');
  const direct = new DirectProxy();

  if (mode === 'direct') return [direct];
  if (mode === 'allorigins') return [direct, allorigins];
  if (mode === 'corslol') return [direct, corslol];
  if (mode === 'codetabs') return [direct, codetabs];
  if (mode === 'custom' && customUrl) return [new QueryProxy('custom', customUrl), direct];
  // auto: browser direct first, then self-hosted proxy if configured.
  // Public proxies are deliberately excluded (privacy + reliability).
  const chain: FetchProxy[] = [direct];
  if (customUrl) chain.push(new QueryProxy('custom', customUrl));
  return chain;
}

export function isCustomProxyConfigured(): boolean {
  return !!customProxyUrl();
}

export interface FetchResult {
  xml: string;
  viaProxy: string | null;
  attempts: FetchAttempt[];
}

function looksLikeFeed(xml: string): boolean {
  return /<(rss|feed|rdf:RDF|channel)[\s>]/i.test(xml.slice(0, 4000));
}

function attemptCodeFor(err: FetchError, isDirect: boolean): AttemptCode {
  if (err.code === 'rateLimited') return 'rateLimited';
  if (err.code === 'tooLarge') return 'tooLarge';
  if (err.code === 'timeout') return 'timeout';
  if (err.code === 'http') return 'http';
  if (err.code === 'network') return connectionRefused(err) ? 'connectionRefused' : isDirect ? 'cors-or-network' : 'http';
  return isDirect ? 'cors-or-network' : 'http';
}

/** Run a single strategy under its own timeout + breaker bookkeeping. */
async function tryStrategy(
  p: FetchProxy,
  targetUrl: string,
  attempts: FetchAttempt[],
  errors: FetchError[],
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), p.timeoutMs);
  const t0 = Date.now();
  const record = (code: AttemptCode, status?: number) => {
    attempts.push({ strategy: p.name, code, status, ms: Date.now() - t0 });
  };
  try {
    const xml = await p.fetchText(targetUrl, ctrl.signal);
    window.clearTimeout(timer);
    if (!looksLikeFeed(xml)) {
      // Direct fetch returned HTML (a web page, login wall, or an
      // opaque CORS-blocked redirect) instead of feed XML.
      record(p.name === 'direct' ? 'cors-or-network' : 'http');
      const err = new FetchError('cors', 'cors', undefined, [], { strategy: p.name, unreachable: false });
      errors.push(err);
      return null;
    }
    record('ok');
    breakerReport(p.name, true);
    return xml;
  } catch (e) {
    window.clearTimeout(timer);
    const err = e instanceof FetchError ? e : new FetchError('network', 'network');
    err.strategy = p.name;
    errors.push(err);
    record(attemptCodeFor(err, p.name === 'direct'));
    if (err.unreachable && p.name !== 'direct') breakerReport(p.name, false);
    return null;
  }
}

/**
 * Try strategies in order; throws FetchError carrying per-strategy
 * diagnostics (attempts) so the UI can show exactly what happened.
 * Strategies whose breaker is open are skipped (recorded as 'skipped').
 * Worst case in auto mode: ~5s direct + ~10s custom ≈ 15s total,
 * and only until the custom proxy trips the breaker.
 */
export async function fetchFeedXml(targetUrl: string): Promise<FetchResult> {
  const proxies = buildProxies();
  const attempts: FetchAttempt[] = [];
  const errors: FetchError[] = [];

  for (const p of proxies) {
    if (breakerTrips(p.name)) {
      attempts.push({ strategy: p.name, code: 'skipped', ms: 0 });
      continue;
    }
    const xml = await tryStrategy(p, targetUrl, attempts, errors);
    if (xml !== null) return { xml, viaProxy: p.name === 'direct' ? null : p.name, attempts };
  }

  // Hint when the user could fix it themselves by configuring a proxy.
  if (proxyMode() === 'auto' && !isCustomProxyConfigured()) {
    attempts.push({ strategy: 'custom', code: 'not-configured', ms: 0 });
  }

  // Precedence: the most actionable failure wins.
  const pick = (code: FetchErrorCode) => errors.find((e) => e.code === code);
  const winner =
    pick('tooLarge') ??
    pick('rateLimited') ??
    pick('timeout') ??
    pick('http') ??
    pick('cors') ??
    errors[0] ??
    new FetchError('network', 'network');
  throw new FetchError(winner.code, winner.message, winner.status, attempts, {
    strategy: winner.strategy,
    unreachable: winner.unreachable,
  });
}
