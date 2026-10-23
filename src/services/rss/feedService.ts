import { ArticleRepository, FeedRepository } from '../../db/database';
import type { Article, Feed } from '../../types';
import { uid } from '../../utils/helpers';
import { FetchError, fetchFeedXml, type FetchAttempt } from './fetcher';
import { articleIdFor, normalizeUrl, parseFeedXml } from './parser';

export type AddFeedErrorCode =
  | 'fetch'
  | 'parse'
  | 'network'
  | 'cors'
  | 'timeout'
  | 'duplicate'
  | 'rateLimited'
  | 'tooLarge';

/** Parallel refresh workers for refreshAll(). */
const REFRESH_CONCURRENCY = 3;

export class AddFeedError extends Error {
  code: AddFeedErrorCode;
  /** Per-strategy fetch diagnostics for the UI details view. */
  attempts: FetchAttempt[];
  constructor(code: AddFeedErrorCode, message: string, attempts: FetchAttempt[] = []) {
    super(message);
    this.code = code;
    this.attempts = attempts;
  }
}

function toAddFeedError(e: unknown): AddFeedError {
  if (e instanceof AddFeedError) return e;
  if (e instanceof FetchError) {
    if (e.code === 'cors') return new AddFeedError('cors', 'cors', e.attempts);
    if (e.code === 'timeout') return new AddFeedError('timeout', 'timeout', e.attempts);
    if (e.code === 'network') return new AddFeedError('network', 'network', e.attempts);
    if (e.code === 'rateLimited') return new AddFeedError('rateLimited', 'rateLimited', e.attempts);
    if (e.code === 'tooLarge') return new AddFeedError('tooLarge', 'tooLarge', e.attempts);
    return new AddFeedError('fetch', 'fetch', e.attempts);
  }
  if ((e as Error)?.message === 'parse') return new AddFeedError('parse', 'parse');
  return new AddFeedError('fetch', 'fetch');
}

export interface RefreshResult {
  feedId: string;
  added: number;
  ok: boolean;
  error?: string;
}

/**
 * FeedService — orchestrates Fetch -> Parse -> Normalize -> Deduplicate -> Persist.
 * UI components must call this instead of touching fetch/DOMParser directly.
 */
export const FeedService = {
  async addFeed(rawUrl: string, folderId?: string): Promise<{ feed: Feed; added: number }> {
    const url = normalizeUrl(rawUrl);
    const dup = await FeedRepository.getByUrl(url);
    if (dup) throw new AddFeedError('duplicate', 'duplicate');

    let xml: string;
    try {
      ({ xml } = await fetchFeedXml(url));
    } catch (e) {
      throw toAddFeedError(e);
    }

    const id = uid('feed');
    let parsed;
    try {
      parsed = parseFeedXml(xml, id);
    } catch {
      throw new AddFeedError('parse', 'parse');
    }

    const now = Date.now();
    const feed: Feed = {
      id,
      title: parsed.title,
      description: parsed.description,
      url,
      siteUrl: parsed.siteUrl,
      icon: parsed.icon,
      folderId,
      createdAt: now,
      updatedAt: now,
      lastFetchedAt: now,
    };
    await FeedRepository.put(feed);
    const articles = toArticles(id, parsed.articles.map((a) => ({ ...a })));
    const added = await ArticleRepository.bulkUpsert(articles);
    return { feed, added };
  },

  async refreshFeed(feedId: string): Promise<RefreshResult> {
    const feed = await FeedRepository.get(feedId);
    if (!feed) return { feedId, added: 0, ok: false, error: 'fetch' };
    try {
      const { xml } = await fetchFeedXml(feed.url);
      const parsed = parseFeedXml(xml, feed.id);
      const now = Date.now();
      const articles = toArticles(feed.id, parsed.articles, feed.isDemo);
      const added = await ArticleRepository.bulkUpsert(articles);
      await FeedRepository.update(feed.id, {
        title: parsed.title || feed.title,
        description: parsed.description ?? feed.description,
        siteUrl: parsed.siteUrl ?? feed.siteUrl,
        icon: parsed.icon ?? feed.icon,
        lastFetchedAt: now,
        lastError: undefined,
      });
      return { feedId, added, ok: true };
    } catch (e) {
      const code = toAddFeedError(e).code;
      await FeedRepository.update(feed.id, { lastError: code }).catch(() => undefined);
      return { feedId, added: 0, ok: false, error: code };
    }
  },

  async refreshAll(feedIds?: string[]): Promise<RefreshResult[]> {
    const feeds = feedIds
      ? (await Promise.all(feedIds.map((id) => FeedRepository.get(id)))).filter((f): f is Feed => !!f)
      : await FeedRepository.all();
    if (feeds.length === 0) return [];
    const results: RefreshResult[] = new Array(feeds.length);
    // Small concurrency pool: parallel enough to be fast when a dead proxy
    // is burning the timeout, but capped so public proxies/rate limits
    // don't get hammered. Sequential (1) was needlessly slow: 20 feeds on a
    // dead tunnel could stall for minutes.
    const workers = Math.min(REFRESH_CONCURRENCY, feeds.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          const i = next++;
          if (i >= feeds.length) return;
          results[i] = await this.refreshFeed(feeds[i].id);
        }
      }),
    );
    return results;
  },

  async renameFeed(feedId: string, title: string): Promise<void> {
    await FeedRepository.update(feedId, { title: title.trim() || 'Untitled Feed' });
  },

  async moveFeed(feedId: string, folderId?: string): Promise<void> {
    await FeedRepository.update(feedId, { folderId });
  },

  async deleteFeed(feedId: string): Promise<void> {
    await FeedRepository.remove(feedId);
  },
};

function toArticles(
  feedId: string,
  parsed: Array<{ guid: string; title: string; url: string; author?: string; content?: string; contentSnippet?: string; publishedAt?: number; image?: string }>,
  isDemo?: boolean,
): Article[] {
  const now = Date.now();
  return parsed
    .filter((p) => p.title || p.content)
    .map((p) => ({
      id: articleIdFor(feedId, p.guid, p.title, p.url),
      feedId,
      title: p.title || 'Untitled',
      url: p.url || '',
      author: p.author,
      content: p.content,
      contentSnippet: p.contentSnippet,
      publishedAt: p.publishedAt ?? now,
      image: p.image,
      isRead: false,
      isStarred: false,
      isReadLater: false,
      isDemo,
      createdAt: now,
    }));
}
