import type { ThemeId, ThemePref } from '../themes';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Feed {
  id: string;
  title: string;
  description?: string;
  /** Feed XML url */
  url: string;
  siteUrl?: string;
  icon?: string;
  folderId?: string;
  isDemo?: boolean;
  lastFetchedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Article {
  id: string;
  feedId: string;
  title: string;
  url: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  publishedAt?: number;
  image?: string;
  isRead: boolean;
  isStarred: boolean;
  isReadLater: boolean;
  isDemo?: boolean;
  createdAt: number;
}

export type { ThemeId, ThemePref };

export type FontSize = 'small' | 'medium' | 'large';
export type LineHeight = 'compact' | 'comfortable' | 'relaxed';
export type RefreshInterval = 'manual' | '15m' | '30m' | '1h' | '6h' | '12h' | '24h';
export type Language = 'zh' | 'en';

export interface AppSettings {
  /** 'auto' follows the OS scheme via the autoLight/autoDark slots. */
  theme: ThemePref;
  /** Theme used when theme==='auto' and system is light. */
  autoLight: ThemeId;
  /** Theme used when theme==='auto' and system is dark. */
  autoDark: ThemeId;
  fontSize: FontSize;
  lineHeight: LineHeight;
  refreshInterval: RefreshInterval;
  markAsReadOnOpen: boolean;
  language: Language;
  /** Desktop pane widths (px), adjustable via drag handles. */
  sidebarWidth: number;
  listWidth: number;
  lastRefreshAllAt?: number;
}

export type SmartView = 'all' | 'unread' | 'starred' | 'read-later';
export type SortOrder = 'newest' | 'oldest';

export interface ParsedFeed {
  title: string;
  description?: string;
  siteUrl?: string;
  icon?: string;
  articles: ParsedArticle[];
}

export interface ParsedArticle {
  guid: string;
  title: string;
  url: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  publishedAt?: number;
  image?: string;
}
