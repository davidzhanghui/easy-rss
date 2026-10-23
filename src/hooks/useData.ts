import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArticleRepository, FLAG_OFF, FLAG_ON, FeedRepository, FolderRepository, db } from '../db/database';
import type { SmartView, SortOrder } from '../types';

/** Articles fetched per infinite-scroll page. */
export const ARTICLE_PAGE = 40;

/**
 * Central query-key registry. Every cache invalidation goes through these
 * prefixes so mutations only refetch what actually changed instead of
 * nuking the whole cache on every star / read toggle.
 */
export const queryKeys = {
  feeds: ['feeds'] as const,
  folders: ['folders'] as const,
  counts: ['counts'] as const,
  articles: ['articles'] as const,
  article: (id: string) => ['article', id] as const,
  cmdArticles: (q: string) => ['cmd-articles', q] as const,
};

export type DataKey = 'feeds' | 'folders' | 'counts' | 'articles';

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...keys: DataKey[]) => {
      const targets: DataKey[] = keys.length > 0 ? keys : ['feeds', 'folders', 'counts', 'articles'];
      for (const target of targets) {
        void qc.invalidateQueries({ queryKey: queryKeys[target] });
      }
    },
    [qc],
  );
}

export function useFeeds() {
  return useQuery({ queryKey: queryKeys.feeds, queryFn: () => FeedRepository.all() });
}

export function useFolders() {
  return useQuery({ queryKey: queryKeys.folders, queryFn: () => FolderRepository.all() });
}

export interface Counts {
  total: number;
  unread: number;
  starred: number;
  readLater: number;
  perFeedUnread: Record<string, number>;
  hasDemo: boolean;
}

export function useCounts() {
  return useQuery<Counts>({
    queryKey: queryKeys.counts,
    queryFn: async () => {
      const [total, unread, starred, readLater, feeds] = await Promise.all([
        db.articles.count(),
        db.articles.where('isRead').equals(FLAG_OFF).count(),
        db.articles.where('isStarred').equals(FLAG_ON).count(),
        db.articles.where('isReadLater').equals(FLAG_ON).count(),
        db.feeds.toArray(),
      ]);
      // Per-feed unread counts ride the [feedId+isRead] compound index:
      // one index count per feed, no full-table scans.
      const perFeedUnread: Record<string, number> = {};
      await Promise.all(
        feeds.map(async (f) => {
          perFeedUnread[f.id] = await db.articles.where('[feedId+isRead]').equals([f.id, FLAG_OFF]).count();
        }),
      );
      return {
        total,
        unread,
        starred,
        readLater,
        perFeedUnread,
        hasDemo: feeds.some((f) => f.isDemo),
      };
    },
  });
}

export interface ArticleListSort {
  view: SmartView;
  feedId?: string;
  query: string;
  sort: SortOrder;
}

/**
 * Infinite-scroll article list.
 *
 * Each page fetch pulls exactly ARTICLE_PAGE rows (index windowed in
 * `ArticleRepository.list`). The query key stays stable while scrolling —
 * the page is the pageParam — so no redundant per-limit cache entries are
 * built up. Refetching the first page and appending more are handled by
 * React Query itself.
 */
export function useArticleList({ view, feedId, query, sort }: ArticleListSort) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.articles, view, feedId ?? '-', query.trim(), sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      ArticleRepository.list({
        view: view === 'all' ? undefined : view,
        feedId,
        query: query.trim() || undefined,
        sort,
        limit: ARTICLE_PAGE,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
  });
}

export function useArticle(id: string | null) {
  return useQuery({
    queryKey: queryKeys.article(id ?? ''),
    enabled: !!id,
    queryFn: () => ArticleRepository.get(id as string),
  });
}
