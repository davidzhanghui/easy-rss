import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, BookOpen, Clock3, ExternalLink, Link2, Rss, Share2, Star } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useArticle, useCounts, useFeeds, useInvalidate } from '../hooks/useData';
import { useSettingsStore, useToastStore } from '../stores/appStore';
import { ArticleService } from '../services/rss/articleService';
import { sanitizeArticleHtml } from '../utils/sanitize';
import { formatFull, timeAgo } from '../utils/helpers';
import { EmptyState, ReaderSkeleton } from './EmptyState';
import { cn } from '../utils/helpers';

interface Props {
  articleId: string | null;
  onBack?: () => void;
  showBack?: boolean;
}

export function Reader({ articleId, onBack, showBack }: Props) {
  const t = useT();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const markAsReadOnOpen = useSettingsStore((s) => s.markAsReadOnOpen);
  const lang = useSettingsStore((s) => s.language);
  const { data: article, isLoading } = useArticle(articleId);
  const { data: feeds = [] } = useFeeds();
  const { data: counts } = useCounts();
  const bodyRef = useRef<HTMLDivElement>(null);

  const feed = feeds.find((f) => f.id === article?.feedId);

  // Mark as read when opened (optional, per settings)
  useEffect(() => {
    if (article && markAsReadOnOpen && !article.isRead && articleId) {
      void ArticleService.markRead(articleId).then(() => invalidate('counts', 'articles'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // Harden rendered HTML: lazy images + hide broken images
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img'));
    const onErr = (e: Event) => {
      (e.target as HTMLImageElement).style.display = 'none';
    };
    for (const img of imgs) {
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', onErr);
    }
    return () => {
      for (const img of imgs) img.removeEventListener('error', onErr);
    };
  }, [article?.id, article?.content]);

  const safeHtml = useMemo(() => (article?.content ? sanitizeArticleHtml(article.content) : ''), [article?.content]);

  if (!articleId) {
    return (
      <div className="hidden h-full lg:block">
        <EmptyState
          icon={BookOpen}
          kicker={t('tagline')}
          title={t('appName')}
          subtitle={t('selectArticle')}
          stats={
            counts && counts.total > 0
              ? [
                  { n: counts.total, label: t('allArticles') },
                  { n: counts.unread, label: t('unread') },
                  { n: counts.starred, label: t('starred') },
                  { n: counts.readLater, label: t('readLater') },
                ]
              : undefined
          }
        />
      </div>
    );
  }

  if (isLoading || !article) {
    return (
      <div className="h-full overflow-y-auto bg-canvas">
        <div className="letter mx-auto my-4 max-w-[720px] rounded-lg sm:my-6">
          <ReaderSkeleton />
        </div>
      </div>
    );
  }

  const toggleStar = () =>
    void ArticleService.toggleStar(article.id, !article.isStarred).then(() => invalidate('counts', 'articles'));
  const toggleReadLater = () =>
    void ArticleService.toggleReadLater(article.id, !article.isReadLater).then(() => invalidate('counts', 'articles'));
  const toggleRead = () =>
    void (article.isRead ? ArticleService.markUnread(article.id) : ArticleService.markRead(article.id)).then(() =>
      invalidate('counts', 'articles'),
    );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(article.url);
      toast(t('toastLinkCopied'));
    } catch {
      toast(article.url, 'info');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, url: article.url });
      } catch {
        // user dismissed — ignore
      }
    } else {
      void copyLink();
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-canvas">
      {/* letter card (LAYOUT.md: 720px paper, padded) */}
      <article className="letter animate-fade-in mx-auto min-h-full w-full max-w-[720px] border-x-0 px-5 pb-14 pt-4 sm:px-10 lg:my-7 lg:min-h-0 lg:rounded-md lg:border lg:px-12 lg:pb-16">
        {/* tool row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {showBack && (
            <button onClick={onBack} aria-label={t('back')} className="icon-btn mr-1 lg:hidden">
              <ArrowLeft size={17} />
            </button>
          )}
          <ToolBtn
            onClick={toggleStar}
            label={article.isStarred ? t('unstar') : t('star')}
            active={article.isStarred}
            activeClass="border-brass/50 text-brass"
          >
            <Star size={15} fill={article.isStarred ? 'currentColor' : 'none'} />
          </ToolBtn>
          <ToolBtn
            onClick={toggleReadLater}
            label={article.isReadLater ? t('removeReadLater') : t('saveReadLater')}
            active={article.isReadLater}
            activeClass="border-coral/50 text-coralfg"
          >
            <Clock3 size={15} />
          </ToolBtn>
          <ToolBtn onClick={toggleRead} label={article.isRead ? t('markAsUnread') : t('markAsRead')}>
            <span className="px-1">{article.isRead ? t('markAsUnread') : t('markAsRead')}</span>
          </ToolBtn>
          <div className="ml-auto flex items-center gap-1.5">
            <ToolBtn onClick={copyLink} label={t('copyLink')}>
              <Link2 size={15} />
            </ToolBtn>
            <ToolBtn onClick={share} label={t('share')}>
              <Share2 size={15} />
            </ToolBtn>
            {article.url && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('openOriginal')}
                title={t('openOriginal')}
                className="btn btn--primary btn--sm"
              >
                <ExternalLink size={14} />
                <span className="hidden sm:inline">{t('openOriginal')}</span>
              </a>
            )}
          </div>
        </div>

        {/* meta + headline */}
        <div className="mt-7 flex items-center gap-2 font-mono text-[12px] text-faint">
          <Rss size={12} className="shrink-0 text-coralfg" />
          <span className="truncate font-medium text-strong">{feed?.title}</span>
          {article.author && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{article.author}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <time
            dateTime={article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined}
            title={formatFull(article.publishedAt)}
          >
            {timeAgo(article.publishedAt, t('justNow'), lang)}
          </time>
        </div>
        <h1 className="mt-3 font-display text-[26px] font-medium leading-[1.22] tracking-[-0.2px] text-ink sm:text-[30px]">
          {article.title}
        </h1>
        {article.image && <HeroImage src={article.image} title={article.title} />}

        <div className="letter-rule my-7 text-[13px]">
          <span aria-hidden>✉</span>
        </div>

        {safeHtml ? (
          <div ref={bodyRef} className="prose-reader" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        ) : (
          <p className="prose-reader">
            {article.contentSnippet}
            {article.url && (
              <>
                {' '}
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  {t('openOriginal')}
                </a>
              </>
            )}
          </p>
        )}

        <div className="letter-rule mt-10 text-[11px]">
          <span aria-hidden>·</span>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 font-mono text-[12px] text-faint">
          <span>
            {t('by')} {article.author || feed?.title || '—'}
          </span>
          <span aria-hidden>·</span>
          <span>{formatFull(article.publishedAt)}</span>
        </div>
      </article>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  label,
  active,
  activeClass,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn('btn btn--secondary btn--sm', active && activeClass)}
    >
      {children}
    </button>
  );
}

function HeroImage({ src, title }: { src: string; title: string }) {
  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
      className="mt-6 max-h-80 w-full rounded-md border border-hairsoft bg-parchment object-cover"
    />
  );
}
