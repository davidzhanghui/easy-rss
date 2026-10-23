import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchError, fetchFeedXml, resetFetchBreaker } from './fetcher';

const XML = '<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>';
const ok = (body: string) => new Response(body, { status: 200 });

beforeEach(() => {
  resetFetchBreaker();
  vi.stubEnv('VITE_RSS_PROXY', 'auto');
  vi.stubEnv('VITE_RSS_PROXY_URL', 'https://proxy.test/?url={url}');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchFeedXml', () => {
  it('uses the direct strategy first', async () => {
    const f = vi.fn().mockResolvedValue(ok(XML));
    vi.stubGlobal('fetch', f);
    const r = await fetchFeedXml('https://example.com/feed');
    expect(r.viaProxy).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('falls back to the custom proxy with an encoded target URL', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok(XML));
    vi.stubGlobal('fetch', f);
    const r = await fetchFeedXml('https://example.com/feed?a=1&b=2');
    expect(r.viaProxy).toBe('custom');
    expect(f.mock.calls[1][0]).toBe(
      `https://proxy.test/?url=${encodeURIComponent('https://example.com/feed?a=1&b=2')}`,
    );
  });

  it('opens the circuit breaker after an unreachable proxy', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    await expect(fetchFeedXml('https://example.com/a')).rejects.toBeInstanceOf(FetchError);
    expect(f).toHaveBeenCalledTimes(2); // direct + custom
    f.mockClear();
    const err = await fetchFeedXml('https://example.com/b').catch((e: FetchError) => e);
    expect(f).toHaveBeenCalledTimes(1); // custom is skipped now
    expect((err as FetchError).attempts.some((a) => a.strategy === 'custom' && a.code === 'skipped')).toBe(true);
  });

  it('rejects HTML that is not a feed', async () => {
    vi.stubEnv('VITE_RSS_PROXY_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('<html><body>login wall please sign in</body></html>')));
    await expect(fetchFeedXml('https://example.com/x')).rejects.toMatchObject({ code: 'cors' });
  });
});
