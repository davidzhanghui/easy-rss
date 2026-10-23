import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Command, Github, Menu, Moon, Plus, RefreshCw, Search, Settings, Sun, WifiOff } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useInvalidate } from '../hooks/useData';
import { applyThemeFromStore, useSettingsStore, useToastStore, useUIStore } from '../stores/appStore';
import { FeedService } from '../services/rss/feedService';
import { isDarkTheme, resolveTheme } from '../themes';
import { LogoMark } from './LogoMark';
import { ThemeSwitcher } from './ThemeSwitcher';
import { cn, timeAgo } from '../utils/helpers';

const iconBtn = 'icon-btn';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setUI = useUIStore((s) => s.set);
  const theme = useSettingsStore((s) => s.theme);
  const autoLight = useSettingsStore((s) => s.autoLight);
  const autoDark = useSettingsStore((s) => s.autoDark);
  const lang = useSettingsStore((s) => s.language);
  const cycleTheme = useSettingsStore((s) => s.cycleTheme);
  const lastRefreshAllAt = useSettingsStore((s) => s.lastRefreshAllAt);
  const refreshing = useUIStore((s) => s.refreshing);
  const [offline, setOffline] = useState(!navigator.onLine);

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedDark = isDarkTheme(resolveTheme(theme, autoLight, autoDark, systemDark));

  const refreshAll = async () => {
    if (refreshing) return;
    setUI({ refreshing: true });
    try {
      const results = await FeedService.refreshAll();
      const failed = results.filter((r) => !r.ok).length;
      useSettingsStore.getState().set({ lastRefreshAllAt: Date.now() });
      invalidate('feeds', 'counts', 'articles');
      toast(
        failed === 0 ? t('toastRefreshed') : `${t('toastRefreshed')} (${results.length - failed}/${results.length})`,
        failed === 0 ? 'success' : 'info',
      );
    } catch {
      toast(t('toastRefreshFailed'), 'error');
    } finally {
      setUI({ refreshing: false });
    }
  };

  // track online/offline
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline bg-card px-2 sm:h-16 sm:gap-2 sm:px-4 lg:px-5">
      <button onClick={onMenu} aria-label="Open navigation" className={cn(iconBtn, 'lg:hidden')}>
        <Menu size={19} />
      </button>
      <Link to="/" className="hidden items-center gap-2.5 sm:flex" aria-label={t('appName')}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-oncoral">
          <LogoMark size={18} />
        </span>
        <span className="leading-tight">
          <span className="block font-display text-[19px] font-medium tracking-tight text-ink">{t('appName')}</span>
          <span className="hidden text-[10px] uppercase tracking-[1.5px] text-faint xl:block">{t('tagline')}</span>
        </span>
      </Link>

      <div className="field mx-auto w-full min-w-0 max-w-[560px] flex-1 sm:mx-2">
        <Search size={15} className="shrink-0 text-faint" />
        <input
          id="global-search"
          value={searchQuery}
          onChange={(e) => setUI({ searchQuery: e.target.value })}
          placeholder={t('searchPlaceholder')}
          role="searchbox"
          aria-label={t('searchPlaceholder')}
          className="text-sm"
        />
        {searchQuery ? (
          <button
            onClick={() => setUI({ searchQuery: '' })}
            aria-label="Clear search"
            className="rounded px-1 text-sm text-faint hover:text-body"
          >
            ×
          </button>
        ) : (
          <kbd className="kbd hidden sm:block">/</kbd>
        )}
      </div>

      {offline ? (
        <span className="badge badge--danger hidden items-center gap-1.5 !py-1 text-xs md:inline-flex">
          <WifiOff size={13} /> {t('offline')}
        </span>
      ) : (
        lastRefreshAllAt && (
          <span className="hidden shrink-0 text-xs text-faint xl:block">
            {t('lastUpdated')} {timeAgo(lastRefreshAllAt, t('justNow'), lang)}
          </span>
        )
      )}

      <button onClick={refreshAll} aria-label={t('refreshAll')} title={t('refreshAll')} className={iconBtn}>
        <RefreshCw size={17} className={cn(refreshing && 'animate-spin')} />
      </button>
      <button
        onClick={() => setUI({ commandOpen: true })}
        aria-label={t('cmdPalette')}
        title="⌘K / Ctrl K"
        className={cn(iconBtn, 'hidden sm:block')}
      >
        <Command size={17} />
      </button>
      <button
        onClick={() => {
          cycleTheme();
          applyThemeFromStore();
        }}
        aria-label={t('toggleDayNight')}
        title={t('toggleDayNight')}
        className={cn(iconBtn, 'hidden sm:block')}
      >
        {resolvedDark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <ThemeSwitcher />
      <button onClick={() => setUI({ addFeedOpen: true })} className="btn btn--primary hidden sm:flex">
        <Plus size={15} /> {t('addFeed')}
      </button>
      <button
        onClick={() => setUI({ addFeedOpen: true })}
        aria-label={t('addFeed')}
        className={cn(iconBtn, 'sm:hidden')}
      >
        <Plus size={19} />
      </button>
      <button
        onClick={() => navigate('/settings')}
        aria-label={t('settings')}
        className={cn(iconBtn, 'hidden sm:block')}
      >
        <Settings size={17} />
      </button>
      <a
        href="https://github.com/davidzhanghui/easy-rss"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('github')}
        title={t('github')}
        className={cn(iconBtn, 'hidden sm:inline-flex')}
      >
        <Github size={17} />
      </a>
    </header>
  );
}
