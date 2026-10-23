import { describe, expect, it } from 'vitest';
import { parseOpml } from './opmlService';

const wrap = (body: string) => `<?xml version="1.0"?><opml version="2.0"><head><title>t</title></head><body>${body}</body></opml>`;

describe('parseOpml', () => {
  it('parses folders and flat feeds', () => {
    const items = parseOpml(
      wrap(`
        <outline text="Tech">
          <outline type="rss" text="A" xmlUrl="https://a.example/feed" htmlUrl="https://a.example"/>
          <outline type="rss" title="B" xmlUrl="https://b.example/rss"/>
        </outline>
        <outline type="rss" text="C" xmlUrl="https://c.example/atom"/>`),
    );
    expect(items).toEqual([
      {
        title: 'Tech',
        children: [
          { title: 'A', feedUrl: 'https://a.example/feed', siteUrl: 'https://a.example/' },
          { title: 'B', feedUrl: 'https://b.example/rss', siteUrl: undefined },
        ],
      },
      { title: 'C', feedUrl: 'https://c.example/atom', siteUrl: undefined },
    ]);
  });

  it('falls back to "Untitled" when text/title are missing', () => {
    expect(parseOpml(wrap('<outline xmlUrl="https://a.example/f"/>'))[0].title).toBe('Untitled');
  });

  it('drops outlines whose feed URL is not http(s)', () => {
    expect(parseOpml(wrap('<outline text="X" xmlUrl="javascript:alert(1)"/>'))).toEqual([]);
  });

  it('drops a non-http(s) site URL but keeps the feed', () => {
    const [item] = parseOpml(wrap('<outline text="Y" xmlUrl="https://y.example/f" htmlUrl="javascript:alert(1)"/>'));
    expect(item).toMatchObject({ feedUrl: 'https://y.example/f', siteUrl: undefined });
  });

  it('rejects malformed input and documents without <body>', () => {
    expect(() => parseOpml('<opml><body><outline></opml>')).toThrow();
    expect(() => parseOpml('<opml version="2.0"><head/></opml>')).toThrow();
  });

  it('parses the bundled recommended feeds', async () => {
    const { readFileSync } = await import('node:fs');
    const items = parseOpml(readFileSync('docs/recommended-feeds.opml', 'utf8'));
    expect(items.length).toBeGreaterThan(0);
  });
});
