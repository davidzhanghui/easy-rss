import Dexie, { type Collection, type Table } from 'dexie';
import type { Article, Feed, Folder } from '../types';

/**
 * IndexedDB rejects booleans as index keys, so storing `isRead: true` leaves
 * the isRead / isStarred / isReadLater indexes permanently EMPTY (the old
 * full-scan behaviour grew out of that). Flags are therefore stored as 0/1
 * numbers and converted back to booleans at the repository boundary.
 */
type ArticleWire = {
  [K in keyof Article]: K extends 'isRead' | 'isStarred' | 'isReadLater' ? 0 | 1 : Article[K];
};

function toWire(a: Article): ArticleWire {
  return { ...a, isRead: a.isRead ? 1 : 0, isStarred: a.isStarred ? 1 : 0, isReadLater: a.isReadLater ? 1 : 0 };
}

function toWirePatch(patch: Partial<Article>): Partial<ArticleWire> {
  return {
    ...(patch as Partial<ArticleWire>),
    ...(patch.isRead !== undefined ? { isRead: patch.isRead ? 1 : 0 } : {}),
    ...(patch.isStarred !== undefined ? { isStarred: patch.isStarred ? 1 : 0 } : {}),
    ...(patch.isReadLater !== undefined ? { isReadLater: patch.isReadLater ? 1 : 0 } : {}),
  } as Partial<ArticleWire>;
}

/** Numbers (and legacy booleans) come out as proper booleans. */
function fromWire(a: ArticleWire): Article {
  return { ...a, isRead: !!a.isRead, isStarred: !!a.isStarred, isReadLater: !!a.isReadLater } as Article;
}

class ReaderDB extends Dexie {
  feeds!: Table<Feed, string>;
  folders!: Table<Folder, string>;
  articles!: Table<Article, string>;

  constructor() {
    super('easy-rss-db');
    this.version(3).stores({
      // IndexedDB schema + indexes for feedId / time / flags
      feeds: '&id, folderId, url, updatedAt, createdAt',
      folders: '&id, createdAt',
      articles: '&id, feedId, publishedAt, isRead, isStarred, isReadLater, createdAt, [feedId+publishedAt], [feedId+isRead]',
    });
    // v4: flag fields normalized to 0/1 so the flag indexes are actually
    // populated (see toWire). One-time pass over existing rows; the upgrade
    // transaction aborts and rolls back as a whole if anything throws.
    this.version(4)
      .stores({
        feeds: '&id, folderId, url, updatedAt, createdAt',
        folders: '&id, createdAt',
        articles: '&id, feedId, publishedAt, isRead, isStarred, isReadLater, createdAt, [feedId+publishedAt], [feedId+isRead]',
      })
      .upgrade(async (tx) => {
        await tx
          .table<Article, string>('articles')
          .toCollection()
          .modify((a) => {
            (a as unknown as ArticleWire).isRead = a.isRead ? 1 : 0;
            (a as unknown as ArticleWire).isStarred = a.isStarred ? 1 : 0;
            (a as unknown as ArticleWire).isReadLater = a.isReadLater ? 1 : 0;
          });
      });
    // v5: flag-only indexes order by primary key (article id), NOT by time —
    // so [flag+publishedAt] compound indexes give the flag views a proper
    // newest-first (or oldest-first) cursor. Index-only upgrade, no rewrite.
    this.version(5).stores({
      feeds: '&id, folderId, url, updatedAt, createdAt',
      folders: '&id, createdAt',
      articles:
        '&id, feedId, publishedAt, isRead, isStarred, isReadLater, createdAt, ' +
        '[feedId+publishedAt], [feedId+isRead], [isRead+publishedAt], [isStarred+publishedAt], [isReadLater+publishedAt]',
    });
  }
}

export const db = new ReaderDB();

/** Flag value used in queries/multiEntry-free filters against stored rows. */
export const FLAG_ON = 1;
export const FLAG_OFF = 0;

/* ---------- FeedRepository ---------- */

export const FeedRepository = {
  async all(): Promise<Feed[]> {
    return db.feeds.orderBy('createdAt').toArray();
  },
  async get(id: string): Promise<Feed | undefined> {
    return db.feeds.get(id);
  },
  async getByUrl(url: string): Promise<Feed | undefined> {
    return db.feeds.where('url').equals(url).first();
  },
  async put(feed: Feed): Promise<void> {
    await db.feeds.put(feed);
  },
  async update(id: string, patch: Partial<Feed>): Promise<void> {
    await db.feeds.update(id, { ...patch, updatedAt: Date.now() });
  },
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.feeds, db.articles, async () => {
      await db.feeds.delete(id);
      await db.articles.where('feedId').equals(id).delete();
    });
  },
  async removeDemo(): Promise<void> {
    const all = await db.feeds.toArray();
    const ids = all.filter((f) => f.isDemo).map((f) => f.id);
    if (ids.length === 0) return;
    await db.transaction('rw', db.feeds, db.articles, async () => {
      await db.feeds.bulkDelete(ids);
      // Delete per feed id (index-backed) instead of loading every article
      // row into memory just to filter for isDemo.
      for (const id of ids) {
        await db.articles.where('feedId').equals(id).delete();
      }
    });
  },
};

/* ---------- FolderRepository ---------- */

export const FolderRepository = {
  async all(): Promise<Folder[]> {
    return db.folders.orderBy('createdAt').toArray();
  },
  async put(folder: Folder): Promise<void> {
    await db.folders.put(folder);
  },
  async update(id: string, name: string): Promise<void> {
    await db.folders.update(id, { name });
  },
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.folders, db.feeds, async () => {
      await db.folders.delete(id);
      const feeds = await db.feeds.where('folderId').equals(id).toArray();
      for (const f of feeds) await db.feeds.update(f.id, { folderId: undefined });
    });
  },
};

/* ---------- ArticleRepository ---------- */

export interface ArticleFilter {
  view?: 'all' | 'unread' | 'starred' | 'read-later';
  feedId?: string;
  query?: string;
  sort?: 'newest' | 'oldest';
  limit?: number;
  offset?: number;
}

export interface ArticlePage {
  items: Article[];
  total: number;
  offset: number;
  limit: number;
}

export const ArticleRepository = {
  async bulkUpsert(incoming: Article[]): Promise<number> {
    if (incoming.length === 0) return 0;
    const ids = incoming.map((a) => a.id);
    const existing = await db.articles.where('id').anyOf(ids).toArray();
    const existingMap = new Map(existing.map((a) => [a.id, a]));
    const toAdd: ArticleWire[] = [];
    for (const art of incoming) {
      const prev = existingMap.get(art.id);
      if (prev) {
        // Preserve user state on refresh (never overwrite read/star flags)
        continue;
      }
      toAdd.push(toWire(art));
    }
    if (toAdd.length > 0) await db.articles.bulkAdd(toAdd as unknown as Article[]);
    return toAdd.length;
  },

  /**
   * Index-native paginated listing.
   *
   * Priorities (first match wins, everything else is `.filter()`-narrowed
   * on top of it):
   *   1. feedId            -> [feedId+publishedAt] compound index
   *   2. view unread       -> [isRead+publishedAt] compound index
   *   3. view starred      -> [isStarred+publishedAt] compound index
   *   4. view read-later   -> [isReadLater+publishedAt] compound index
   *   5. plain listing     -> publishedAt index
   *
   * All five order the cursor by publishedAt *inside* the filter value, so
   * newest/oldest sorting and offset/limit windows ride the index directly.
   *
   * The offset/limit window is applied *on the index cursor*, so nothing
   * outside the requested page is ever materialized. Only the final
   * `limit` rows come into memory as objects. Flag values on the records
   * are stored as 0/1 and sanitized back to booleans in `fromWire`.
   */
  async list(filter: ArticleFilter): Promise<ArticlePage> {
    const limit = filter.limit ?? 100;
    const offset = Math.max(0, filter.offset ?? 0);
    const oldestFirst = filter.sort === 'oldest';
    const q = filter.query?.trim().toLowerCase();

    let collection: Collection<Article, string>;
    if (filter.feedId) {
      collection = db.articles
        .where('[feedId+publishedAt]')
        .between([filter.feedId, Dexie.minKey], [filter.feedId, Dexie.maxKey]);
    } else if (filter.view === 'unread') {
      collection = db.articles.where('[isRead+publishedAt]').between([FLAG_OFF, Dexie.minKey], [FLAG_OFF, Dexie.maxKey]);
    } else if (filter.view === 'starred') {
      collection = db.articles.where('[isStarred+publishedAt]').between([FLAG_ON, Dexie.minKey], [FLAG_ON, Dexie.maxKey]);
    } else if (filter.view === 'read-later') {
      collection = db.articles.where('[isReadLater+publishedAt]').between([FLAG_ON, Dexie.minKey], [FLAG_ON, Dexie.maxKey]);
    } else {
      collection = db.articles.orderBy('publishedAt');
    }

    // Cursor scans ascending; reverse for "newest first".
    if (!oldestFirst) collection = collection.reverse();

    // View filters the chosen index can't express become cheap post-filters.
    if (filter.feedId && filter.view === 'unread') collection = collection.filter((a) => !a.isRead);
    if (filter.feedId && filter.view === 'starred') collection = collection.filter((a) => a.isStarred);
    if (filter.feedId && filter.view === 'read-later') collection = collection.filter((a) => a.isReadLater);

    // Search stays a scan (no full-text index today) but the window itself
    // is still sliced by the index cursor, so nothing extra is materialized.
    if (q) {
      const needle = q;
      collection = collection.filter(
        (a) =>
          a.title.toLowerCase().includes(needle) ||
          (a.contentSnippet || '').toLowerCase().includes(needle) ||
          (a.author || '').toLowerCase().includes(needle),
      );
    }

    const total = await collection.count();
    const rows = await collection.offset(offset).limit(limit).toArray();
    return { items: (rows as unknown as ArticleWire[]).map(fromWire), total, offset, limit };
  },

  async countUnread(feedId?: string): Promise<number> {
    if (feedId) {
      return db.articles
        .where('[feedId+isRead]')
        .equals([feedId, FLAG_OFF])
        .count();
    }
    return db.articles.where('isRead').equals(FLAG_OFF).count();
  },

  async update(id: string, patch: Partial<Article>): Promise<void> {
    await db.articles.update(id, toWirePatch(patch) as unknown as Partial<Article>);
  },

  async bulkUpdate(ids: string[], patch: Partial<Article>): Promise<void> {
    await db.articles.where('id').anyOf(ids).modify(toWirePatch(patch) as unknown as Partial<Article>);
  },

  async markFeedRead(feedId: string): Promise<void> {
    await db.articles.where('feedId').equals(feedId).modify({ isRead: FLAG_ON } as unknown as Partial<Article>);
  },

  async markAllRead(): Promise<void> {
    await db.articles.toCollection().modify({ isRead: FLAG_ON } as unknown as Partial<Article>);
  },

  async deleteMany(ids: string[]): Promise<void> {
    await db.articles.bulkDelete(ids);
  },

  async get(id: string): Promise<Article | undefined> {
    const row = await db.articles.get(id);
    return row ? fromWire(row as unknown as ArticleWire) : undefined;
  },
};
