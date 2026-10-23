import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { SettingsPage } from './components/SettingsPage';
import { ArticlePage, HomePage } from './pages/HomePage';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { queryKeys } from './hooks/useData';
import { useUIStore, useSettingsStore, applyThemeFromStore, applyReadingClass, useToastStore } from './stores/appStore';
import { translate } from './i18n';
import { ensureDemoSeeded } from './services/rss/demoSeed';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Boot() {
  const toast = useToastStore((s) => s.push);

  // Theme + reading classes
  useEffect(() => {
    const s = useSettingsStore.getState();
    applyThemeFromStore();
    applyReadingClass(s.fontSize, s.lineHeight);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeFromStore();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Seed demo data on first launch (Local First: app never opens blank)
  useEffect(() => {
    void ensureDemoSeeded().then(() => {
      for (const key of [queryKeys.feeds, queryKeys.folders, queryKeys.counts, queryKeys.articles]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    });
  }, []);

  // Offline notice + auto re-sync when back online
  useEffect(() => {
    const onOffline = () => {
      const lang = useSettingsStore.getState().language;
      toast(translate(lang, 'errNetwork'), 'info');
    };
    const onOnline = () => {
      const lang = useSettingsStore.getState().language;
      toast(translate(lang, 'networkBack'), 'info');
      for (const key of [queryKeys.feeds, queryKeys.counts, queryKeys.articles]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [toast]);

  // Global Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUIStore.getState().set({ commandOpen: !useUIStore.getState().commandOpen });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useAutoRefresh();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Boot />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/unread" element={<HomePage />} />
          <Route path="/starred" element={<HomePage />} />
          <Route path="/read-later" element={<HomePage />} />
          <Route path="/feed/:feedId" element={<HomePage />} />
          <Route path="/article/:articleId" element={<ArticlePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
