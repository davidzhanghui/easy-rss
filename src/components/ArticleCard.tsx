import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import type { Article } from '../types';
import { useT } from '../hooks/useT';
import { useSettingsStore } from '../stores/appStore';
import { cn, timeAgo } from '../utils/helpers';

interface Props {
  article: Article;
  feedName: string;
  selected: boolean;
  checked: boolean;
  selectMode: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
  onToggleSelect: () => void;
}

export function ArticleCard({
  article,
  feedName,
  selected,
  checked,
  selectMode,
  onOpen,
  onToggleStar,
  onToggleRead,
  onToggleSelect,
}: Props) {
  const t = useT();
  const lang = useSettingsStore((s) => s.language);
  const [imgOk, setImgOk] = useState(true);
  const unread = !article.isRead;

  return (
    <article
      id={`article-${article.id}`}
      onClick={onOpen}
      aria-selected={selected}
      className={cn(
        'group cursor-pointer px-4 py-3.5 transition-colors sm:px-5',
        selected ? 'bg-coralsoft shadow-[inset_3px_0_0_var(--color-coral)]' : 'hover:bg-rowhover',
        !unread && !selected && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-faint">
        {selectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            aria-label={t('selectAll')}
            aria-pressed={checked}
            className={cn('checkbox', checked && 'is-on')}
          >
            {checked && <Check size={12} />}
          </button>
        )}
        {unread && <span className="dot dot--accent" aria-label={t('unread')} />}
        <span className={cn('truncate text-[12.5px]', unread ? 'font-semibold text-strong' : 'font-medium text-muted')}>
          {feedName}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{timeAgo(article.publishedAt, t('justNow'), lang)}</span>
      </div>

      <h3
        className={cn(
          'mt-1.5 font-display text-[15.5px] leading-snug tracking-[-0.1px]',
          unread ? 'font-semibold text-ink' : 'font-normal text-muted',
        )}
      >
        {article.title}
      </h3>

      <div className="mt-1.5 flex gap-3">
        {article.contentSnippet && (
          <p className="line-clamp-2 flex-1 text-[13px] leading-5 text-muted">{article.contentSnippet}</p>
        )}
        {article.image && imgOk && (
          <img
            src={article.image}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-16 w-24 shrink-0 rounded-md border border-hairsoft bg-parchment object-cover"
          />
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={article.isStarred ? t('unstar') : t('star')}
          aria-pressed={article.isStarred}
          className={cn(
            'icon-btn icon-btn--sm -ml-1.5',
            article.isStarred ? 'is-on' : 'hover-reveal text-faint/50 hover:text-brass',
          )}
        >
          <Star size={15} fill={article.isStarred ? 'currentColor' : 'none'} />
        </button>
        {article.author && <span className="truncate text-xs text-faint">{article.author}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead();
          }}
          className="btn btn--ghost btn--sm hover-reveal ml-auto text-xs"
        >
          {unread ? t('markAsRead') : t('markAsUnread')}
        </button>
      </div>
    </article>
  );
}
