import { useRef } from 'react';
import { ArrowLeft, Download, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../hooks/useT';
import { useInvalidate } from '../hooks/useData';
import { FeedRepository } from '../db/database';
import { applyReadingClass, useSettingsStore, useToastStore } from '../stores/appStore';
import { buildOpml, downloadText, importOpmlItems, parseOpml } from '../services/rss/opmlService';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { FontSize, Language, LineHeight, RefreshInterval } from '../types';
import { cn } from '../utils/helpers';

export function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const settings = useSettingsStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const setReading = (patch: { fontSize?: FontSize; lineHeight?: LineHeight }) => {
    settings.set(patch);
    const s = useSettingsStore.getState();
    applyReadingClass(patch.fontSize ?? s.fontSize, patch.lineHeight ?? s.lineHeight);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const items = parseOpml(text);
      const { feeds } = await importOpmlItems(items);
      invalidate('feeds', 'folders', 'counts', 'articles');
      toast(`${t('toastOpmlImported')} (+${feeds})`);
    } catch {
      toast(t('errParse'), 'error');
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-canvas">
      <div className="mx-auto max-w-2xl px-5 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <button onClick={() => navigate(-1)} aria-label={t('back')} className="icon-btn lg:hidden">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[28px] font-medium tracking-tight text-ink">{t('settings')}</h1>
        </div>

        <Section title={t('appearance')}>
          <Row label={t('theme')}>
            <ThemeSwitcher />
          </Row>
          <Row label={t('language')}>
            <Seg
              options={[
                { value: 'zh' as Language, label: '中文' },
                { value: 'en' as Language, label: 'English' },
              ]}
              value={settings.language}
              onChange={(v: Language) => settings.set({ language: v })}
            />
          </Row>
        </Section>

        <Section title={t('reading')}>
          <Row label={t('fontSize')}>
            <Seg
              options={(['small', 'medium', 'large'] as FontSize[]).map((v) => ({
                value: v,
                label: v === 'small' ? t('small') : v === 'medium' ? t('medium') : t('large'),
              }))}
              value={settings.fontSize}
              onChange={(v: FontSize) => setReading({ fontSize: v })}
            />
          </Row>
          <Row label={t('lineHeight')}>
            <Seg
              options={(['compact', 'comfortable', 'relaxed'] as LineHeight[]).map((v) => ({
                value: v,
                label: v === 'compact' ? t('compact') : v === 'comfortable' ? t('comfortable') : t('relaxed'),
              }))}
              value={settings.lineHeight}
              onChange={(v: LineHeight) => setReading({ lineHeight: v })}
            />
          </Row>
          <Row label={t('markOpen')}>
            <Toggle
              on={settings.markAsReadOnOpen}
              onChange={() => settings.set({ markAsReadOnOpen: !settings.markAsReadOnOpen })}
            />
          </Row>
        </Section>

        <Section title={t('refreshInterval')}>
          <Row label={t('refreshInterval')}>
            <Seg
              options={(['manual', '15m', '30m', '1h', '6h', '12h', '24h'] as RefreshInterval[]).map((v) => ({
                value: v,
                label:
                  v === 'manual'
                    ? t('manual')
                    : v === '15m'
                      ? '15 min'
                      : v === '30m'
                        ? '30 min'
                        : v === '1h'
                          ? '1 hour'
                          : v === '6h'
                            ? '6 hours'
                            : v === '12h'
                              ? '12 hours'
                              : '24 hours',
              }))}
              value={settings.refreshInterval}
              onChange={(v: RefreshInterval) => settings.set({ refreshInterval: v })}
            />
          </Row>
        </Section>

        <Section title={t('data')}>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} className="btn btn--secondary">
              <Upload size={15} /> {t('importOpml')}
            </button>
            <button
              onClick={async () => {
                const xml = await buildOpml();
                downloadText('subscriptions.opml', xml);
                toast(t('toastOpmlExported'));
              }}
              className="btn btn--secondary"
            >
              <Download size={15} /> {t('exportOpml')}
            </button>
            <button
              onClick={async () => {
                await FeedRepository.removeDemo();
                invalidate('feeds', 'folders', 'counts', 'articles');
                toast(t('clearDemo'), 'info');
              }}
              className="btn btn--danger"
            >
              <Trash2 size={15} /> {t('clearDemo')}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            aria-label={t('importOpml')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </Section>

        <p className="mt-8 text-center text-xs text-faint">EasyRSS · Local-first · IndexedDB + localStorage · v1.0.0</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-hairline bg-card p-4 sm:p-5">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[1.5px] text-faint">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-strong">{label}</span>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('seg-item', value === o.value && 'is-active')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return <button role="switch" aria-checked={on} onClick={onChange} aria-label="toggle" className="switch" />;
}
