import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, MonitorCog } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useSettingsStore, applyThemeFromStore } from '../stores/appStore';
import { DARK_THEMES, LIGHT_THEMES, resolveTheme, themeMeta, type ThemeId } from '../themes';
import { cn } from '../utils/helpers';

function Swatch({ bg, accent, size = 16 }: { bg: string; accent: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border border-black/10"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${bg} 50%, ${accent} 50%)`,
      }}
    />
  );
}

export function ThemeSwitcher() {
  const t = useT();
  const lang = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const autoLight = useSettingsStore((s) => s.autoLight);
  const autoDark = useSettingsStore((s) => s.autoDark);
  const set = useSettingsStore((s) => s.set);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = resolveTheme(theme, autoLight, autoDark, systemDark);
  const resolvedMeta = themeMeta(resolved);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: ThemeId | 'auto') => {
    set({ theme: id });
    applyThemeFromStore();
    if (id !== 'auto') setOpen(false);
  };

  const pickSlot = (slot: 'autoLight' | 'autoDark', id: ThemeId) => {
    set({ [slot]: id });
    applyThemeFromStore();
  };

  const nameOf = (id: ThemeId) => {
    const m = themeMeta(id);
    return lang === 'zh' ? m.zh : m.en;
  };

  const group = (label: string, list: typeof LIGHT_THEMES) => (
    <>
      <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[1.5px] text-faint">
        {label}
      </div>
      {list.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={theme === m.id}
          onClick={() => pick(m.id)}
          className={cn('pop-item', theme === m.id && 'is-active')}
        >
          <Swatch bg={m.bg} accent={m.accent} />
          <span className="flex-1">{nameOf(m.id)}</span>
          {theme === m.id && <Check size={14} />}
        </button>
      ))}
    </>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('pickTheme')}
        title={t('pickTheme')}
        className="btn btn--secondary"
      >
        <Swatch bg={resolvedMeta.bg} accent={resolvedMeta.accent} />
        <span className="hidden md:inline">
          {theme === 'auto' ? t('themeAuto') : nameOf(resolved)}
        </span>
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('pickTheme')}
          className="popover animate-pop absolute right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-64 overflow-y-auto p-1.5"
        >
          {/* auto row */}
          <button
            role="radio"
            aria-checked={theme === 'auto'}
            onClick={() => pick('auto')}
            className={cn('pop-item', theme === 'auto' && 'is-active')}
          >
            <MonitorCog size={16} className="shrink-0" />
            <span className="flex-1">{t('themeAuto')}</span>
            {theme === 'auto' && <Check size={14} />}
          </button>

          {theme === 'auto' && (
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-parchment p-2">
              {(
                [
                  { slot: 'autoLight' as const, label: t('themeWhenLight'), list: LIGHT_THEMES, value: autoLight },
                  { slot: 'autoDark' as const, label: t('themeWhenDark'), list: DARK_THEMES, value: autoDark },
                ]
              ).map(({ slot, label, list, value }) => (
                <label key={slot} className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  {label}
                  <select
                    value={value}
                    onChange={(e) => pickSlot(slot, e.target.value as ThemeId)}
                    className="field h-8 w-full px-1.5 text-xs"
                  >
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {nameOf(m.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="mx-2 my-1.5 border-t border-hairsoft" />
          {group(t('themeLightThemes'), LIGHT_THEMES)}
          {group(t('themeDarkThemes'), DARK_THEMES)}
        </div>
      )}
    </div>
  );
}
