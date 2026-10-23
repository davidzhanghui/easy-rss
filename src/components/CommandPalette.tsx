import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Inbox, LayoutGrid, Moon, Plus, RefreshCw, Search, Settings, Star } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useInvalidate } from '../hooks/useData';
import { ArticleRepository } from '../db/database';
import { applyThemeFromStore, useSettingsStore, useToastStore, useUIStore } from '../stores/appStore';
import { FeedService } from '../services/rss/feedService';
import { timeAgo } from '../utils/helpers';
import { cn } from '../utils/helpers';

export function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const open = useUIStore((s) => s.commandOpen);
  const setUI = useUIStore((s) => s.set);
  const lang = useSettingsStore((s) => s.language);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open ]);

  const { data } = useQuery({
    queryKey: ['cmd-articles', q],
    enabled: open && q.trim().length > 0,
    queryFn: () => ArticleRepository.list({ query: q.trim(), limit: 6, sort: 'newest', offset: 0 }),
  });

  const close = () => setUI({ commandOpen: false });

  const commands = useMemo(() => {
    const all = [
      { id: 'add', icon: <Plus size={16} />, label: t('addFeed'), run: () => { close(); setUI({ addFeedOpen: true }); } },
      { id: 'refresh', icon: <RefreshCw size={16} />, label: t('refreshAll'), run: () => { close(); void FeedService.refreshAll().then(() => { invalidate('feeds', 'counts', 'articles'); toast(t('toastRefreshed')); }); } },
      { id: 'all', icon: <LayoutGrid size={16} />, label: t('goAll'), run: () => { close(); navigate('/'); } },
      { id: 'unread', icon: <Inbox size={16} />, label: t('goUnread'), run: () => { close(); navigate('/unread'); } },
      { id: 'starred', icon: <Star size={16} />, label: t('goStarred'), run: () => { close(); navigate('/starred'); } },
      { id: 'later', icon: <Clock3 size={16} />, label: t('readLater'), run: () => { close(); navigate('/read-later'); } },
      {
        id: 'theme', icon: <Moon size={16} />, label: t('toggleDayNight'),
        run: () => { close(); useSettingsStore.getState().cycleTheme(); applyThemeFromStore(); },
      },
      { id: 'settings', icon: <Settings size={16} />, label: t('settings'), run: () => { close(); navigate('/settings'); } },
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) => c.label.toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t, navigate]);

  const articles = data?.items ?? [];
  const rows: Array<{ key: string; run: () => void; node: React.ReactNode }> = [
    ...commands.map((c) => ({
      key: `cmd-${c.id}`,
      run: c.run,
      node: (
        <span className="flex items-center gap-3">
          <span className="text-faint">{c.icon}</span>
          <span className="text-sm">{c.label}</span>
        </span>
      ),
    })),
    ...articles.map((a) => ({
      key: `art-${a.id}`,
      run: () => {
        close();
        setUI({ selectedArticleId: a.id, searchQuery: '' });
        if (!window.matchMedia('(min-width: 1024px)').matches) navigate(`/article/${encodeURIComponent(a.id)}`);
      },
      node: (
        <span className="flex min-w-0 items-center gap-3">
          <Search size={15} className="shrink-0 text-faint" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{a.title}</span>
            <span className="block text-xs text-faint">{timeAgo(a.publishedAt, t('justNow'), lang)}</span>
          </span>
        </span>
      ),
    })),
  ];

  useEffect(() => setActive(0), [q]);

  if (!open) return null;
  return (
    <div className="scrim animate-fade-in fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('cmdPalette')} className="animate-pop w-full max-w-lg overflow-hidden rounded-xl border border-hairline bg-card shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.25)]">
        <div className="flex items-center gap-2 border-b border-hairsoft px-4">
          <Search size={17} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && rows[active]) { e.preventDefault(); rows[active].run(); }
              if (e.key === 'Escape') close();
            }}
            placeholder={t('cmdHint')}
            aria-label={t('cmdHint')}
            className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-faint"
          />
          <kbd className="kbd">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-faint">{t('emptySearchTitle')}</p>}
          {rows.map((r, i) => (
            <button
              key={r.key}
              onMouseEnter={() => setActive(i)}
              onClick={r.run}
              className={cn('pop-item !px-3 !py-2.5', i === active && 'is-active')}
            >
              {r.node}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
