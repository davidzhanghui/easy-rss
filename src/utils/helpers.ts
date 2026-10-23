import type { Language } from '../types';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** FNV-1a hash -> hex, used for stable article ids */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stableArticleId(feedId: string, title: string, url: string): string {
  return `${feedId}:${hashString(`${feedId}|${title}|${url}`)}`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * HTML -> plain text. Uses DOMParser (inert document: no script execution, no
 * resource loading) — never `innerHTML`, even on a detached element, because
 * `<img onerror>` fires there and the input is untrusted feed content.
 */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Return the URL only if it is absolute http(s); otherwise ''. Blocks javascript:/data: links from feeds. */
export function safeHttpUrl(raw?: string | null): string {
  if (!raw) return '';
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

export function timeAgo(ts: number | undefined, justNow: string, lang: Language = 'en'): string {
  if (!ts) return '';
  const locale = lang === 'zh' ? 'zh-CN' : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  try {
    if (min < 1) return justNow;
    if (min < 60) return rtf.format(-min, 'minute');
    const h = Math.floor(min / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    const d = Math.floor(h / 24);
    if (d < 7) return rtf.format(-d, 'day');
  } catch {
    // fall through to absolute date
  }
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function formatFull(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export function faviconFor(siteUrl?: string): string | undefined {
  if (!siteUrl) return undefined;
  try {
    const u = new URL(siteUrl);
    return `${u.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.isContentEditable
  );
}
