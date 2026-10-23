import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useFolders, useInvalidate } from '../hooks/useData';
import { useToastStore, useUIStore } from '../stores/appStore';
import { AddFeedError, FeedService } from '../services/rss/feedService';
import type { FetchAttempt } from '../services/rss/fetcher';
import { Modal } from './Modal';
import type { I18nKey } from '../i18n';

const ERR_MAP: Record<string, I18nKey> = {
  fetch: 'errFetch',
  parse: 'errParse',
  network: 'errNetwork',
  cors: 'errCors',
  timeout: 'errTimeout',
  rateLimited: 'errRateLimited',
  tooLarge: 'errTooLarge',
  duplicate: 'toastFeedAdded',
};

function attemptLabel(t: (k: I18nKey) => string, a: FetchAttempt): string {
  switch (a.code) {
    case 'ok': return 'OK';
    case 'cors-or-network': return t('diagDirectFail');
    case 'connectionRefused': return t('diagRefused');
    case 'timeout': return t('diagTimeout');
    case 'rateLimited': return t('diagRateLimited');
    case 'tooLarge': return t('diagTooLarge');
    case 'not-configured': return t('diagNotConfigured');
    case 'skipped': return t('diagSkipped');
    case 'http': return `HTTP ${a.status ?? ''}`.trim();
  }
}

export function AddFeedModal() {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const open = useUIStore((s) => s.addFeedOpen);
  const setUI = useUIStore((s) => s.set);
  const { data: folders = [] } = useFolders();

  const [url, setUrl] = useState('');
  const [folderId, setFolderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; attempts: FetchAttempt[] } | null>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setFolderId('');
      setError(null);
      setLoading(false);
    }
  }, [open ]);

  const close = () => {
    if (!loading) setUI({ addFeedOpen: false });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { feed } = await FeedService.addFeed(url.trim(), folderId || undefined);
      invalidate('feeds', 'folders', 'counts', 'articles');
      setUI({ addFeedOpen: false });
      toast(t('toastFeedAdded'));
      navigate(`/feed/${feed.id}`);
    } catch (err) {
      const code = err instanceof AddFeedError ? err.code : 'fetch';
      const attempts = err instanceof AddFeedError ? err.attempts : [];
      if (code === 'duplicate') {
        setError({ message: t('duplicateFeed'), attempts: [] });
      } else {
        setError({ message: t(ERR_MAP[code] ?? 'errFetch'), attempts });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('addFeedTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-strong">{t('feedUrlLabel')}</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('feedUrlPlaceholder')}
            inputMode="url"
            autoComplete="off"
            className="field text-sm"
          />
        </label>
        {folders.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-strong">{t('folderLabel')}</span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="field text-sm"
            >
              <option value="">{t('noFolder')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-clay/10 px-3.5 py-2.5">
            <p className="flex items-start gap-2 text-[13px] leading-5 text-clay">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error.message}
            </p>
            {error.attempts.length > 0 && (
              <details className="mt-1.5 text-xs">
                <summary className="cursor-pointer text-muted hover:text-ink">
                  {t('diagTitle')}
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted">
                  {error.attempts.map((a, i) => (
                    <li key={`${a.strategy}-${i}`}>
                      {a.strategy} · {attemptLabel(t, a)}
                      {a.ms > 0 && <span className="text-faint"> · {a.ms}ms</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={loading}
            className="btn btn--ghost"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={!url.trim() || loading}
            className="btn btn--primary"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? t('adding') : t('addFeed')}
          </button>
        </div>
        <p className="text-xs leading-5 text-faint">
          {t('feedFormatHint')}
        </p>
      </form>
    </Modal>
  );
}
