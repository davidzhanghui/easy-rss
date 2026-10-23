import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SmartView } from '../types';
import { ArticleList } from '../components/ArticleList';
import { Reader } from '../components/Reader';
import { PaneResizer } from '../components/PaneResizer';
import { useSettingsStore, useUIStore } from '../stores/appStore';
import { useT } from '../hooks/useT';

function viewFromPath(pathname: string): SmartView {
  if (pathname.startsWith('/unread')) return 'unread';
  if (pathname.startsWith('/starred')) return 'starred';
  if (pathname.startsWith('/read-later')) return 'read-later';
  return 'all';
}

/** List + reader 3-pane content (desktop) / list (mobile). */
export function HomePage() {
  const { pathname } = useLocation();
  const { feedId } = useParams();
  const setUI = useUIStore((s) => s.set);
  const selectedArticleId = useUIStore((s) => s.selectedArticleId);
  const listWidth = useSettingsStore((s) => s.listWidth);
  const setSettings = useSettingsStore((s) => s.set);
  const t = useT();
  const view = viewFromPath(pathname);

  // Clear selection when switching context
  useEffect(() => {
    setUI({ selectedArticleId: null, selectedIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, feedId]);

  return (
    <div className="flex h-full min-h-0">
      {/* list-pane: fixed width on desktop (draggable), full width on mobile */}
      <div
        className="h-full min-w-0 flex-1 bg-card lg:flex-none"
        style={{ '--list-w': `${listWidth}px`, width: 'var(--list-w)' } as React.CSSProperties}
      >
        <ArticleList view={view} feedId={feedId} />
      </div>
      <PaneResizer
        value={listWidth}
        onChange={(w) => setSettings({ listWidth: w })}
        min={280}
        max={560}
        defaultValue={388}
        label={t('resizeList')}
      />
      {/* read-pane (flex, own scroll) */}
      <div className="hidden min-w-0 flex-1 border-l border-hairline bg-canvas lg:block">
        <Reader articleId={selectedArticleId} />
      </div>
    </div>
  );
}

/** Full-screen reader route: mobile reading view + desktop deep links. */
export function ArticlePage() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const setUI = useUIStore((s) => s.set);
  const id = articleId ? decodeURIComponent(articleId) : null;

  useEffect(() => {
    if (id) setUI({ selectedArticleId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="h-full">
      <Reader articleId={id} showBack onBack={() => navigate(-1)} />
    </div>
  );
}
