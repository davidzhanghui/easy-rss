/**
 * Theme registry — mirrors mail-archive/THEMING.md.
 * 7 light themes + 3 dark themes + 'auto' (follows system, with
 * configurable light/dark slots). Each theme id maps 1:1 to a
 * `[data-theme]` token block in index.css.
 */

export type ThemeId =
  | 'moss' | 'claret' | 'indigo' | 'umber' | 'mulberry' | 'graphite' | 'teal'
  | 'midnight' | 'dusk' | 'forest';

export type ThemePref = 'auto' | ThemeId;

export interface ThemeMeta {
  id: ThemeId;
  /** i18n key suffix for display name */
  zh: string;
  en: string;
  /** swatch colors for pickers (bg + accent) */
  bg: string;
  accent: string;
  scheme: 'light' | 'dark';
}

export const THEMES: ThemeMeta[] = [
  { id: 'moss',     zh: '墨绿', en: 'Moss',     bg: '#f3f1e9', accent: '#3d5c47', scheme: 'light' },
  { id: 'claret',   zh: '酒红', en: 'Claret',   bg: '#f4efe7', accent: '#8b3229', scheme: 'light' },
  { id: 'indigo',   zh: '藏蓝', en: 'Indigo',   bg: '#f0f2f1', accent: '#33506e', scheme: 'light' },
  { id: 'umber',    zh: '赭石', en: 'Umber',    bg: '#f6f0e3', accent: '#8a5a2b', scheme: 'light' },
  { id: 'mulberry', zh: '紫檀', en: 'Mulberry', bg: '#f3eff1', accent: '#6b4a72', scheme: 'light' },
  { id: 'graphite', zh: '松烟', en: 'Graphite', bg: '#f2f2ef', accent: '#4a4a46', scheme: 'light' },
  { id: 'teal',     zh: '孔雀', en: 'Teal',     bg: '#edf2f1', accent: '#2f6367', scheme: 'light' },
  { id: 'midnight', zh: '夜读', en: 'Midnight', bg: '#23211c', accent: '#a98a54', scheme: 'dark' },
  { id: 'dusk',     zh: '暮蓝', en: 'Dusk',     bg: '#1b1f2a', accent: '#6f8fc4', scheme: 'dark' },
  { id: 'forest',   zh: '深林', en: 'Forest',   bg: '#1c211d', accent: '#7fa87f', scheme: 'dark' },
];

export const LIGHT_THEMES = THEMES.filter((t) => t.scheme === 'light');
export const DARK_THEMES = THEMES.filter((t) => t.scheme === 'dark');

export function isDarkTheme(id: ThemeId): boolean {
  return DARK_THEMES.some((t) => t.id === id);
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Resolve a preference + system scheme to a concrete theme id. */
export function resolveTheme(pref: ThemePref, autoLight: ThemeId, autoDark: ThemeId, systemDark: boolean): ThemeId {
  if (pref === 'auto') return systemDark ? autoDark : autoLight;
  return pref;
}

/** Map legacy light/dark/system prefs onto the new model. */
export function migrateThemePref(old: unknown): ThemePref {
  if (old === 'light') return 'moss';
  if (old === 'dark') return 'midnight';
  if (old === 'system') return 'auto';
  return THEMES.some((t) => t.id === old) ? (old as ThemeId) : 'auto';
}
