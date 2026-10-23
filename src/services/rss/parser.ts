import type { ParsedArticle, ParsedFeed } from '../../types';
import { hashString, safeHttpUrl, stableArticleId, stripHtml, truncate } from '../../utils/helpers';

export class ParseError extends Error {
  constructor(message = 'parse') {
    super(message);
  }
}

function childText(item: Element, tag: string): string | undefined {
  for (const child of Array.from(item.children)) {
    if (child.tagName.toLowerCase() === tag.toLowerCase() || child.tagName === tag) {
      const t = child.textContent?.trim();
      if (t) return t;
    }
  }
  return undefined;
}

function attrOf(item: Element, tag: string, attr: string): string | undefined {
  for (const child of Array.from(item.children)) {
    if (child.tagName.toLowerCase() === tag.toLowerCase() || child.tagName === tag) {
      const v = child.getAttribute(attr)?.trim();
      if (v) return v;
    }
  }
  return undefined;
}

function parseDate(raw?: string): number | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : t;
}

function firstImageFromHtml(html?: string): string | undefined {
  if (!html) return undefined;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

function snippetOf(content?: string, description?: string): string | undefined {
  const src = content || description || '';
  if (!src) return undefined;
  const plain = /^\s*</.test(src) ? stripHtml(src) : src.replace(/\s+/g, ' ').trim();
  return plain ? truncate(plain, 200) : undefined;
}

function atomLink(item: Element): string | undefined {
  const links = Array.from(item.getElementsByTagName('link'));
  if (links.length === 0) return undefined;
  const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate' && l.getAttribute('href'));
  return (alt ?? links[0]).getAttribute('href') ?? undefined;
}

/**
 * Parse RSS 2.0 / RSS 1.0 (RDF) / Atom into a normalized ParsedFeed.
 * Article ids are generated later by `articleIdFor` (guid > link > hash).
 */
export function parseFeedXml(xml: string, feedId: string): ParsedFeed {
  const feed = parseFeedXmlRaw(xml, feedId);
  // Feeds are untrusted: only absolute http(s) URLs may reach href attributes.
  return {
    ...feed,
    siteUrl: safeHttpUrl(feed.siteUrl) || undefined,
    articles: feed.articles.map((a) => ({ ...a, url: safeHttpUrl(a.url) })),
  };
}

function parseFeedXmlRaw(xml: string, feedId: string): ParsedFeed {
  void feedId; // kept in the signature: callers hash it into article ids
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new ParseError('parse');

  const root = doc.documentElement;
  const rootName = root.tagName.toLowerCase();

  if (rootName === 'feed' || root.namespaceURI === 'http://www.w3.org/2005/Atom') {
    return parseAtom(doc);
  }
  if (rootName === 'rdf:rdf' || rootName === 'rdf' || xml.includes('<rdf:RDF')) {
    return parseRdf(doc);
  }
  if (rootName === 'rss' || doc.getElementsByTagName('channel').length > 0) {
    return parseRss2(doc);
  }
  throw new ParseError('parse');
}

function feedIcon(doc: Document, siteUrl?: string): string | undefined {
  // RSS <image><url>…</url></image> lives inside <channel>
  const channels = doc.getElementsByTagName('channel');
  if (channels.length > 0) {
    const imgs = channels[0].getElementsByTagName('image');
    if (imgs.length > 0) {
      const u = imgs[0].getElementsByTagName('url')[0]?.textContent?.trim();
      if (u) return u;
    }
  }
  if (siteUrl) {
    try {
      return `${new URL(siteUrl).origin}/favicon.ico`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseRss2(doc: Document): ParsedFeed {
  const channels = doc.getElementsByTagName('channel');
  if (channels.length === 0) throw new ParseError('parse');
  const ch = channels[0];
  const get = (tag: string) => {
    const els = ch.getElementsByTagName(tag);
    for (const el of Array.from(els)) {
      if (el.parentElement === ch) return el.textContent?.trim() || undefined;
    }
    return undefined;
  };
  const title = get('title') || 'Untitled Feed';
  const siteUrl = get('link');
  const description = get('description');
  const icon = feedIcon(doc, siteUrl);

  const items = Array.from(doc.getElementsByTagName('item'));
  const articles: ParsedArticle[] = items
    .map((item, idx) => {
      const titleEl = childText(item, 'title') || 'Untitled';
      const link = childText(item, 'link') || attrOf(item, 'link', 'href') || '';
      const guid = childText(item, 'guid') || link || `${titleEl}-${idx}`;
      // content:encoded > content > description
      const contentEncoded = Array.from(item.getElementsByTagName('encoded'))[0]?.textContent?.trim();
      const contentNs = Array.from(item.childNodes).find(
        (n) => n instanceof Element && n.tagName.toLowerCase().includes('content'),
      ) as Element | undefined;
      const descriptionText = childText(item, 'description');
      const content = contentEncoded || contentNs?.textContent?.trim() || descriptionText;
      const author =
        childText(item, 'dc:creator') || childText(item, 'creator') || childText(item, 'author') || undefined;
      const pubRaw = childText(item, 'pubDate') || childText(item, 'dc:date') || childText(item, 'date');
      const enclosure = attrOf(item, 'enclosure', 'url');
      const mediaContent = attrOf(item, 'media:content', 'url') || attrOf(item, 'content', 'url');
      const mediaThumb = attrOf(item, 'media:thumbnail', 'url');
      const image =
        mediaContent ||
        mediaThumb ||
        (enclosure && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(enclosure) ? enclosure : undefined) ||
        firstImageFromHtml(content) ||
        firstImageFromHtml(descriptionText);
      const url = safeHttpUrl(link) || safeHttpUrl(guid);
      return {
        guid,
        title: titleEl,
        url,
        author,
        content,
        contentSnippet: snippetOf(content, descriptionText),
        publishedAt: parseDate(pubRaw),
        image,
      };
    })
    .map((a) => ({ ...a, guid: a.guid || a.url }));

  return {
    title,
    description,
    siteUrl,
    icon,
    articles: articles.map((a) => ({ ...a, guid: a.guid })),
  };
}

function parseAtom(doc: Document): ParsedFeed {
  const title = doc.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled Feed';
  const subtitle = doc.getElementsByTagName('subtitle')[0]?.textContent?.trim();
  const topLinks = Array.from(doc.documentElement.children).filter((c) => c.tagName.toLowerCase() === 'link');
  const siteUrl =
    topLinks.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate')?.getAttribute('href') ??
    topLinks[0]?.getAttribute('href') ??
    undefined;
  const iconRaw =
    doc.getElementsByTagName('icon')[0]?.textContent?.trim() ||
    doc.getElementsByTagName('logo')[0]?.textContent?.trim();
  const icon =
    iconRaw ||
    (siteUrl
      ? (() => {
          try {
            return `${new URL(siteUrl).origin}/favicon.ico`;
          } catch {
            return undefined;
          }
        })()
      : undefined);

  const entries = Array.from(doc.getElementsByTagName('entry'));
  const articles: ParsedArticle[] = entries.map((entry) => {
    const eTitle = entry.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
    const id = entry.getElementsByTagName('id')[0]?.textContent?.trim() || '';
    const url = atomLink(entry) || id;
    const authorEl = entry.getElementsByTagName('author')[0];
    const author =
      authorEl?.getElementsByTagName('name')[0]?.textContent?.trim() ||
      entry.getElementsByTagName('name')[0]?.textContent?.trim();
    const contentEl = entry.getElementsByTagName('content')[0];
    const summaryEl = entry.getElementsByTagName('summary')[0];
    const content = contentEl?.textContent?.trim() || summaryEl?.textContent?.trim();
    const summary = summaryEl?.textContent?.trim();
    const pubRaw =
      entry.getElementsByTagName('published')[0]?.textContent?.trim() ||
      entry.getElementsByTagName('updated')[0]?.textContent?.trim();
    const mediaUrl = (() => {
      for (const child of Array.from(entry.children)) {
        const t = child.tagName.toLowerCase();
        if (t === 'media:content' || t === 'media:thumbnail' || t === 'enclosure') {
          const u = child.getAttribute('url');
          if (u) return u;
        }
      }
      return undefined;
    })();
    const guid = id || url || eTitle;
    return {
      guid,
      title: eTitle,
      url,
      author,
      content,
      contentSnippet: snippetOf(content, summary),
      publishedAt: parseDate(pubRaw),
      image: mediaUrl || firstImageFromHtml(content) || firstImageFromHtml(summary),
    };
  });

  return { title, description: subtitle, siteUrl, icon, articles };
}

function parseRdf(doc: Document): ParsedFeed {
  // RSS 1.0 / RDF: channel + item elements
  const channels = doc.getElementsByTagName('channel');
  const ch = channels[0];
  const title = ch?.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled Feed';
  const siteUrl = ch?.getElementsByTagName('link')[0]?.textContent?.trim();
  const description = ch?.getElementsByTagName('description')[0]?.textContent?.trim();
  const items = Array.from(doc.getElementsByTagName('item'));
  const articles: ParsedArticle[] = items.map((item) => {
    const t = item.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
    const link = item.getElementsByTagName('link')[0]?.textContent?.trim() || '';
    const author =
      item.getElementsByTagName('dc:creator')[0]?.textContent?.trim() ||
      item.getElementsByTagName('creator')[0]?.textContent?.trim();
    const desc = item.getElementsByTagName('description')[0]?.textContent?.trim();
    const pubRaw =
      item.getElementsByTagName('dc:date')[0]?.textContent?.trim() ||
      item.getElementsByTagName('date')[0]?.textContent?.trim();
    const guid = link || t;
    return {
      guid,
      title: t,
      url: link || guid,
      author,
      content: desc,
      contentSnippet: snippetOf(desc, undefined),
      publishedAt: parseDate(pubRaw),
      image: firstImageFromHtml(desc),
    };
  });
  const icon = siteUrl
    ? (() => {
        try {
          return `${new URL(siteUrl).origin}/favicon.ico`;
        } catch {
          return undefined;
        }
      })()
    : undefined;
  return { title, description, siteUrl, icon, articles };
}

/** Build a stable dedup id: guid > link > hash(feedId+title+url) */
export function articleIdFor(feedId: string, guid: string, title: string, url: string): string {
  const key = (guid || url || title).trim();
  if (key && (guid || url)) return `${feedId}:${hashString(key)}`;
  return stableArticleId(feedId, title, url);
}

export function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u) throw new ParseError('empty-url');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}
