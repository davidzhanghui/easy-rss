import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownWideNarrow, CheckCheck, Inbox, RefreshCw, SearchX, Star, Trash2, X } from 'lucide-react';
import type { SmartView } from '../types';
import { useT } from '../hooks/useT';
import { useArticleList, useFeeds, useInvalidate } from '../hooks/useData';
import { useSettingsStore, useToastStore, useUIStore } from '../stores/appStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ArticleService } from '../services/rss/articleService';
import { FeedService } from '../services/rss/feedService';
import { ArticleCard } from './ArticleCard';
import { ArticleSkeletonList, EmptyState } from './EmptyState';
import { cn } from '../utils/helpers';

interface Props {
  view: SmartView;
  feedId?: string;
}

export function ArticleList({ view, feedId }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const sort = useUIStore((s) => s.sort);
  const setUI = useUIStore((s) => s.set);
  const selectedArticleId = useUIStore((s) => s.selectedArticleId);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const markAsReadOnOpen = useSettingsStore((s) => s.markAsReadOnOpen);
  const { data: feeds = [] } = useFeeds();

  const [tab, setTab] = useState<'all' | 'unread' | 'starred'>('all');
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const effectiveView: SmartView = feedId ? (tab === 'all' ? 'all' : tab) : view;

  // Reset UI selection when the listing context changes
  useEffect(() => {
    setUI({ selectedIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, feedId, searchQuery, sort, tab]);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useArticleList({
    view: effectiveView,
    feedId,
    query: searchQuery,
    sort,
  });
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const feed = feedId ? feedMap.get(feedId) : undefined;

  // Infinite scroll: fetch the next index-windowed page when the sentinel
  // nears the viewport. Browsers without IntersectionObserver (or jsdom in
  // tests) fall back to the "Load more" button rendered below.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

  const openArticle = useCallback(
    (id: string) => {
      const art = items.find((a) => a.id === id);
      setUI({ selectedArticleId: id });
      if (art && markAsReadOnOpen && !art.isRead) {
        void ArticleService.markRead(id).then(() => invalidate('counts', 'articles'));
      }
      if (!isDesktop()) navigate(`/article/${encodeURIComponent(id)}`);
    },
    [items, markAsReadOnOpen, invalidate, navigate, setUI],
  );

  const selectedIdx = items.findIndex((a) => a.id === selectedArticleId);

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (items.length === 0) return;
      const next = Math.min(
        items.length - 1,
        Math.max(0, (selectedIdx < 0 ? (dir === 1 ? -1 : 0) : selectedIdx) + dir),
      );
      const art = items[next];
      setUI({ selectedArticleId: art.id });
      document.getElementById(`article-${CSS.escape(art.id)}`)?.scrollIntoView({ block: 'nearest' });
    },
    [items, selectedIdx, setUI],
  );

  const currentArticle = selectedIdx >= 0 ? items[selectedIdx] : undefined;

  const toggleStarSelected = useCallback(() => {
    if (!currentArticle) return;
    void ArticleService.toggleStar(currentArticle.id, !currentArticle.isStarred).then(() =>
      invalidate('counts', 'articles'),
    );
  }, [currentArticle, invalidate]);

  const markSelected = useCallback(
    (read: boolean) => {
      if (!currentArticle) return;
      void (read ? ArticleService.markRead(currentArticle.id) : ArticleService.markUnread(currentArticle.id)).then(() =>
        invalidate('counts', 'articles'),
      );
    },
    [currentArticle, invalidate],
  );

  const refreshCurrent = useCallback(async () => {
    if (feedId) {
      setFeedRefreshing(true);
      try {
        const r = await FeedService.refreshFeed(feedId);
        invalidate('feeds', 'counts', 'articles');
        if (!r.ok) toast(t('toastRefreshFailed'), 'error');
      } finally {
        setFeedRefreshing(false);
      }
    } else {
      setUI({ refreshing: true });
      try {
        await FeedService.refreshAll();
        useSettingsStore.getState().set({ lastRefreshAllAt: Date.now() });
        invalidate('feeds', 'counts', 'articles');
        toast(t('toastRefreshed'));
      } catch {
        toast(t('toastRefreshFailed'), 'error');
      } finally {
        setUI({ refreshing: false });
      }
    }
  }, [feedId, invalidate, toast, t, setUI]);

  useKeyboardShortcuts(
    {
      next: () => moveSelection(1),
      prev: () => moveSelection(-1),
      open: () => currentArticle && openArticle(currentArticle.id),
      toggleStar: toggleStarSelected,
      markRead: () => markSelected(true),
      markUnread: () => markSelected(false),
      refresh: () => void refreshCurrent(),
      focusSearch: () => document.getElementById('global-search')?.focus(),
      showHelp: () => setUI({ shortcutsOpen: true }),
    },
    true,
  );

  const title = searchQuery
    ? `“${searchQuery}”`
    : feedId
      ? (feed?.title ?? '…')
      : view === 'all'
        ? t('allArticles')
        : view === 'unread'
          ? t('unread')
          : view === 'starred'
            ? t('starred')
            : t('readLater');

  const allLoadedIds = items.map((a) => a.id);
  const allChecked = allLoadedIds.length > 0 && allLoadedIds.every((id) => selectedIds.includes(id));

  const batch = async (fn: (ids: string[]) => Promise<void>, msg?: string) => {
    if (selectedIds.length === 0) return;
    await fn([...selectedIds]);
    setUI({ selectedIds: [] });
    invalidate('counts', 'articles');
    if (msg) toast(msg, 'info');
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-card">
      {/* List header */}
      <div className="shrink-0 border-b border-hairline px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-baseline gap-2.5">
          <h1 className="truncate font-display text-[21px] font-semibold tracking-tight text-ink sm:text-[23px]">
            {title}
          </h1>
          <span className="shrink-0 text-xs tabular-nums text-faint">
            {total} {t('articlesCount')}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 self-center">
            {feedId && (
              <button
                onClick={() =>
                  void ArticleService.markFeedRead(feedId).then(() => {
                    invalidate('counts', 'articles');
                    toast(t('toastMarkedRead'), 'info');
                  })
                }
                aria-label={t('markAllRead')}
                title={t('markAllRead')}
                className="icon-btn"
              >
                <CheckCheck size={16} />
              </button>
            )}
            <button
              onClick={() => void refreshCurrent()}
              aria-label={t('refresh')}
              title={t('refresh')}
              className="icon-btn"
            >
              <RefreshCw size={15} className={cn(feedRefreshing && 'animate-spin')} />
            </button>
            <button
              onClick={() => setUI({ sort: sort === 'newest' ? 'oldest' : 'newest' })}
              aria-label={sort === 'newest' ? t('sortNewest') : t('sortOldest')}
              title={sort === 'newest' ? t('sortNewest') : t('sortOldest')}
              className="btn btn--ghost btn--sm gap-1 text-xs"
            >
              <ArrowDownWideNarrow size={15} />
              <span className="hidden xl:inline">{sort === 'newest' ? t('sortNewest') : t('sortOldest')}</span>
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-2.5 flex gap-1" role="tablist" aria-label="Filter">
          {(['all', 'unread', 'starred'] as const).map((k) => {
            const active = feedId ? tab === k : (view === 'all' && k === 'all') || view === k;
            const label = k === 'all' ? t('all') : k === 'unread' ? t('unread') : t('starred');
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (feedId) setTab(k);
                  else navigate(k === 'all' ? '/' : `/${k}`);
                }}
                className={cn('tab-pill', active && 'is-active')}
              >
                {label}
              </button>
            );
          })}
          {!feedId && view === 'read-later' && (
            <span className="tab-pill is-active inline-flex items-center">{t('readLater')}</span>
          )}
        </div>

        {/* Batch bar */}
        {selectedIds.length > 0 && (
          <div className="animate-fade-up mt-2.5 flex flex-wrap items-center gap-1 rounded-xl bg-toastbg px-2 py-1.5 text-toastfg">
            <span className="px-2 text-xs font-medium">
              {selectedIds.length} {t('selected')}
            </span>
            <BatchBtn onClick={() => void batch((ids) => ArticleService.markManyRead(ids))}>{t('markAsRead')}</BatchBtn>
            <BatchBtn onClick={() => void batch((ids) => ArticleService.markManyUnread(ids))}>
              {t('markAsUnread')}
            </BatchBtn>
            <BatchBtn onClick={() => void batch((ids) => ArticleService.starMany(ids, true))}>{t('star')}</BatchBtn>
            <BatchBtn onClick={() => void batch((ids) => ArticleService.deleteMany(ids), t('toastFeedDeleted'))}>
              <Trash2 size={13} />
            </BatchBtn>
            <button
              onClick={() => setUI({ selectedIds: [] })}
              aria-label={t('clearSelection')}
              className="icon-btn icon-btn--sm ml-auto text-toastfg/70 hover:bg-white/10 hover:text-toastfg"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* List body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <ArticleSkeletonList />
        ) : items.length === 0 ? (
          <EmptyState
            icon={searchQuery ? SearchX : view === 'starred' ? Star : Inbox}
            title={
              searchQuery
                ? t('emptySearchTitle')
                : feedId
                  ? t('emptyFeedTitle')
                  : view === 'unread'
                    ? t('emptyUnreadTitle')
                    : view === 'starred'
                      ? t('emptyStarredTitle')
                      : view === 'read-later'
                        ? t('emptyReadLaterTitle')
                        : t('emptyTitle')
            }
            subtitle={
              searchQuery
                ? t('emptySearchSubtitle')
                : feedId
                  ? t('emptyFeedSubtitle')
                  : view === 'unread'
                    ? t('emptyUnreadSubtitle')
                    : view === 'starred'
                      ? t('emptyStarredSubtitle')
                      : view === 'read-later'
                        ? t('emptyReadLaterSubtitle')
                        : t('emptySubtitle')
            }
            action={
              !searchQuery && !feedId && view === 'all' ? (
                <button onClick={() => setUI({ addFeedOpen: true })} className="btn btn--primary">
                  {t('addFeed')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {items.length > 1 && (
              <button
                onClick={() => setUI({ selectedIds: allChecked ? [] : allLoadedIds })}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-faint hover:text-muted sm:px-5"
              >
                <span className={cn('checkbox', allChecked && 'is-on')}>{allChecked && <CheckCheck size={11} />}</span>
                {t('selectAll')}
              </button>
            )}
            <div className="divide-y divide-hairsoft pb-8">
              {items.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  feedName={feedMap.get(a.feedId)?.title ?? ''}
                  selected={a.id === selectedArticleId}
                  checked={selectedIds.includes(a.id)}
                  selectMode={selectedIds.length > 0}
                  onOpen={() => openArticle(a.id)}
                  onToggleStar={() =>
                    void ArticleService.toggleStar(a.id, !a.isStarred).then(() => invalidate('counts', 'articles'))
                  }
                  onToggleRead={() =>
                    void (a.isRead ? ArticleService.markUnread(a.id) : ArticleService.markRead(a.id)).then(() =>
                      invalidate('counts', 'articles'),
                    )
                  }
                  onToggleSelect={() => useUIStore.getState().toggleSelected(a.id)}
                />
              ))}
            </div>
            <div ref={sentinelRef} />
            {isFetchingNextPage && <ArticleSkeletonList />}
            {hasNextPage && (
              <div className="flex justify-center pb-10">
                <button
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="btn btn--secondary"
                >
                  {t('loadMore')} ({Math.max(0, total - items.length)})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BatchBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium opacity-90 hover:bg-white/10 hover:opacity-100"
    >
      {children}
    </button>
  );
}
