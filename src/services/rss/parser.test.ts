import { describe, expect, it } from 'vitest';
import { articleIdFor, parseFeedXml } from './parser';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example</title><link>https://example.com</link><description>d</description>
  <item><title>Good</title><link>https://example.com/good</link><guid>g1</guid>
    <description><![CDATA[<p>Body <img src=x onerror=alert(1)></p>]]></description>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
  <item><title>Evil</title><link>javascript:alert(1)</link><guid>g2</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><link href="javascript:alert(1)"/>
  <entry><title>E1</title><id>urn:1</id><link rel="alternate" href="https://example.com/e1"/>
    <summary>sum</summary><updated>2024-01-01T00:00:00Z</updated></entry>
  <entry><title>E2</title><id>urn:2</id><link href="data:text/html,x"/></entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel><title>R</title><link>https://r.example</link></channel>
  <item><title>R1</title><link>https://r.example/1</link><description>x</description></item>
  <item><title>R2</title><link>javascript:alert(1)</link></item>
</rdf:RDF>`;

describe('parseFeedXml', () => {
  it('parses RSS 2.0 and drops non-http(s) article links', () => {
    const f = parseFeedXml(RSS, 'f1');
    expect(f.title).toBe('Example');
    expect(f.siteUrl).toBe('https://example.com/');
    expect(f.articles.map((a) => a.url)).toEqual(['https://example.com/good', '']);
    expect(f.articles[0].contentSnippet).toBe('Body');
  });

  it('parses Atom and drops unsafe feed/entry links', () => {
    const f = parseFeedXml(ATOM, 'f2');
    expect(f.siteUrl).toBeUndefined();
    expect(f.articles.map((a) => a.url)).toEqual(['https://example.com/e1', '']);
  });

  it('parses RSS 1.0 (RDF) and drops unsafe links', () => {
    const f = parseFeedXml(RDF, 'f3');
    expect(f.articles.map((a) => a.url)).toEqual(['https://r.example/1', '']);
  });

  it('rejects non-feed input', () => {
    expect(() => parseFeedXml('<html></html>', 'x')).toThrow();
    expect(() => parseFeedXml('not xml <<<', 'x')).toThrow();
  });
});

describe('articleIdFor', () => {
  it('is stable and prefers guid over url', () => {
    expect(articleIdFor('f', 'g', 't', 'u1')).toBe(articleIdFor('f', 'g', 't', 'u2'));
    expect(articleIdFor('f', 'g1', 't', 'u')).not.toBe(articleIdFor('f', 'g2', 't', 'u'));
  });
});
