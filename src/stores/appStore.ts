import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, SortOrder } from '../types';
import { THEMES, isDarkTheme, migrateThemePref, resolveTheme } from '../themes';

const SETTINGS_KEY = 'easy-rss-settings';

const defaults: AppSettings = {
  theme: 'auto',
  autoLight: 'moss',
  autoDark: 'midnight',
  fontSize: 'medium',
  lineHeight: 'comfortable',
  refreshInterval: '1h',
  markAsReadOnOpen: true,
  language: (navigator.language.startsWith('zh') ? 'zh' : 'en') as AppSettings['language'],
  sidebarWidth: 212,
  listWidth: 388,
};

interface SettingsState extends AppSettings {
  set: (patch: Partial<AppSettings>) => void;
  /** Quick light/dark flip: jumps to the opposite auto slot theme. */
  cycleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaults,
      set: (patch) => set(patch),
      cycleTheme: () => {
        const s = get();
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const resolved = resolveTheme(s.theme, s.autoLight, s.autoDark, systemDark);
        set({ theme: isDarkTheme(resolved) ? s.autoLight : s.autoDark });
      },
    }),
    {
      name: SETTINGS_KEY,
      version: 2,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        const validId = (v: unknown, fallback: AppSettings['autoLight']) =>
          THEMES.some((t) => t.id === v) ? (v as AppSettings['autoLight']) : fallback;
        return {
          ...defaults,
          ...s,
          theme: migrateThemePref(s.theme),
          autoLight: validId(s.autoLight, 'moss'),
          autoDark: validId(s.autoDark, 'midnight'),
        } as AppSettings;
      },
    },
  ),
);

/**
 * Resolve the theme pref and stamp `data-theme` on <html>.
 * No `.dark` class — each theme owns its full token table; we only
 * hint `color-scheme` so UA chrome (scrollbars, form controls) matches.
 */
export function applyThemeClass(theme: AppSettings['theme'], autoLight: AppSettings['autoLight'], autoDark: AppSettings['autoDark']): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = resolveTheme(theme, autoLight, autoDark, systemDark);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', theme);
  root.classList.remove('dark');
  root.style.colorScheme = isDarkTheme(resolved) ? 'dark' : 'light';
}

export function applyThemeFromStore(): void {
  const s = useSettingsStore.getState();
  applyThemeClass(s.theme, s.autoLight, s.autoDark);
}

export function applyReadingClass(fontSize: AppSettings['fontSize'], lineHeight: AppSettings['lineHeight']): void {
  const root = document.documentElement;
  root.classList.remove('font-size-small', 'font-size-large', 'line-compact', 'line-relaxed');
  if (fontSize === 'small') root.classList.add('font-size-small');
  if (fontSize === 'large') root.classList.add('font-size-large');
  if (lineHeight === 'compact') root.classList.add('line-compact');
  if (lineHeight === 'relaxed') root.classList.add('line-relaxed');
}

/* ---------- UI / selection store (not persisted wholesale) ---------- */

interface UIState {
  searchQuery: string;
  sort: SortOrder;
  selectedArticleId: string | null;
  sidebarOpen: boolean; // mobile drawer
  addFeedOpen: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  selectedIds: string[];
  refreshing: boolean;
  set: (patch: Partial<UIState>) => void;
  toggleSelected: (id: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  searchQuery: '',
  sort: 'newest',
  selectedArticleId: null,
  sidebarOpen: false,
  addFeedOpen: false,
  commandOpen: false,
  shortcutsOpen: false,
  selectedIds: [],
  refreshing: false,
  set: (patch) => set(patch),
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
    })),
}));

/* ---------- Toast store ---------- */

export interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: string) => void;
}

let toastSeq = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, kind = 'success') => {
    const id = `toast_${Date.now()}_${toastSeq++}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
