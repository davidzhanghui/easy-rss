import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../stores/appStore';
import { FeedService } from '../services/rss/feedService';
import { queryKeys } from './useData';

const MINUTES: Record<string, number> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '6h': 360,
  '12h': 720,
  '24h': 1440,
};

/** Auto-refresh with setInterval + visibilitychange + online handling. */
export function useAutoRefresh(onDone?: (added: number) => void): void {
  const interval = useSettingsStore((s) => s.refreshInterval);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (interval === 'manual') return;
    const mins = MINUTES[interval] ?? 60;

    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      try {
        const results = await FeedService.refreshAll();
        const added = results.reduce((n, r) => n + r.added, 0);
        useSettingsStore.getState().set({ lastRefreshAllAt: Date.now() });
        // A refresh can touch every feed + article + unread count.
        for (const key of [queryKeys.feeds, queryKeys.counts, queryKeys.articles]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        onDone?.(added);
      } catch {
        // background refresh must never crash the app
      }
    };

    const timer = window.setInterval(refresh, mins * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const last = useSettingsStore.getState().lastRefreshAllAt ?? 0;
      if (Date.now() - last > mins * 60 * 1000) void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [interval, queryClient, onDone]);
}
