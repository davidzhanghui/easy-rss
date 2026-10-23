import { FeedRepository, FolderRepository } from '../../db/database';
import { safeHttpUrl, uid } from '../../utils/helpers';

/** OPMLService — import/export subscriptions, preserving folder structure. */
export interface OpmlItem {
  title: string;
  feedUrl?: string;
  siteUrl?: string;
  children?: OpmlItem[];
}

export function parseOpml(xml: string): OpmlItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('parse');
  const body = doc.getElementsByTagName('body')[0];
  if (!body) throw new Error('parse');
  const walk = (el: Element): OpmlItem[] => {
    const out: OpmlItem[] = [];
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== 'outline') continue;
      const title = child.getAttribute('text') || child.getAttribute('title') || 'Untitled';
      // OPML files are untrusted input too: only absolute http(s) URLs survive.
      const feedUrl = safeHttpUrl(child.getAttribute('xmlUrl')) || undefined;
      const siteUrl = safeHttpUrl(child.getAttribute('htmlUrl')) || undefined;
      const sub = Array.from(child.children).filter((c) => c.tagName.toLowerCase() === 'outline');
      if (feedUrl) {
        out.push({ title, feedUrl, siteUrl });
        // Some OPML nests feeds under a folder outline AND lists them flat; handle both.
        for (const s of sub) out.push(...walk(s));
      } else if (sub.length > 0) {
        out.push({ title, children: walk(child) });
      }
    }
    return out;
  };
  return walk(body);
}

export async function importOpmlItems(items: OpmlItem[]): Promise<{ feeds: number; folders: number }> {
  let feeds = 0;
  let folders = 0;
  for (const item of items) {
    if (item.children) {
      const folderId = uid('folder');
      await FolderRepository.put({ id: folderId, name: item.title, createdAt: Date.now() });
      folders++;
      for (const child of item.children) {
        if (!child.feedUrl) continue;
        const exists = await FeedRepository.getByUrl(child.feedUrl);
        if (exists) continue;
        const now = Date.now();
        await FeedRepository.put({
          id: uid('feed'),
          title: child.title,
          url: child.feedUrl,
          siteUrl: child.siteUrl,
          folderId,
          createdAt: now,
          updatedAt: now,
        });
        feeds++;
      }
    } else if (item.feedUrl) {
      const exists = await FeedRepository.getByUrl(item.feedUrl);
      if (exists) continue;
      const now = Date.now();
      await FeedRepository.put({
        id: uid('feed'),
        title: item.title,
        url: item.feedUrl,
        siteUrl: item.siteUrl,
        createdAt: now,
        updatedAt: now,
      });
      feeds++;
    }
  }
  return { feeds, folders };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function buildOpml(): Promise<string> {
  const [feeds, folders] = await Promise.all([FeedRepository.all(), FolderRepository.all()]);
  const byFolder = new Map<string | undefined, typeof feeds>();
  for (const f of feeds) {
    const k = f.folderId ?? undefined;
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(f);
  }
  let body = '';
  for (const folder of folders) {
    const list = byFolder.get(folder.id) ?? [];
    body += `    <outline text="${esc(folder.name)}" title="${esc(folder.name)}">\n`;
    for (const f of list) {
      body += `      <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}"${f.siteUrl ? ` htmlUrl="${esc(f.siteUrl)}"` : ''}/>\n`;
    }
    body += '    </outline>\n';
  }
  for (const f of byFolder.get(undefined) ?? []) {
    body += `    <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}"${f.siteUrl ? ` htmlUrl="${esc(f.siteUrl)}"` : ''}/>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>EasyRSS Subscriptions</title></head>\n  <body>\n${body}  </body>\n</opml>\n`;
}

export function downloadText(filename: string, text: string, mime = 'text/xml'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
