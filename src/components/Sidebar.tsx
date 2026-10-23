import { useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Download,
  FolderPlus,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Rss,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useT } from '../hooks/useT';
import { useCounts, useFeeds, useFolders, useInvalidate } from '../hooks/useData';
import { FeedRepository, FolderRepository } from '../db/database';
import { useToastStore, useUIStore } from '../stores/appStore';
import { ArticleService } from '../services/rss/articleService';
import { FeedService } from '../services/rss/feedService';
import { buildOpml, downloadText, importOpmlItems, parseOpml } from '../services/rss/opmlService';
import { ConfirmDialog, PromptDialog } from './dialogs';
import { cn, uid } from '../utils/helpers';

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="badge badge--count ml-auto pl-2">
      {n > 999 ? '999+' : n}
    </span>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const invalidate = useInvalidate();
  const toast = useToastStore((s) => s.push);
  const setUI = useUIStore((s) => s.set);
  const { data: feeds = [] } = useFeeds();
  const { data: folders = [] } = useFolders();
  const { data: counts } = useCounts();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFeedId, setMenuFeedId] = useState<string | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renameFeedId, setRenameFeedId] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState<'new' | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byFolder = useMemo(() => {
    const map = new Map<string | undefined, typeof feeds>();
    for (const f of feeds) {
      const k = f.folderId ?? undefined;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    return map;
  }, [feeds]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allCollapsed = folders.length > 0 && folders.every((f) => collapsed.has(f.id));

  const smartLink = (to: string, icon: React.ReactNode, label: string, n: number) => (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => cn('nav-item', isActive && 'is-active')}
    >
      {icon}
      <span className="truncate">{label}</span>
      <Count n={n} />
    </NavLink>
  );

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const items = parseOpml(text);
      const { feeds: n } = await importOpmlItems(items);
      invalidate('feeds', 'folders', 'counts', 'articles');
      toast(`${t('toastOpmlImported')} (+${n})`);
    } catch {
      toast(t('errParse'), 'error');
    }
  };

  const doExport = async () => {
    const xml = await buildOpml();
    downloadText('subscriptions.opml', xml);
    toast(t('toastOpmlExported'));
  };

  const clearDemo = async () => {
    await FeedRepository.removeDemo();
    invalidate('feeds', 'folders', 'counts', 'articles');
    toast(t('clearDemo'), 'info');
  };

  const renameFeed = feeds.find((f) => f.id === renameFeedId);

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
      {/* Smart views */}
      <div className="flex flex-col gap-0.5" role="navigation" aria-label="Smart views">
        {smartLink('/', <LayoutGrid size={17} />, t('allArticles'), counts?.total ?? 0)}
        {smartLink('/unread', <Inbox size={17} />, t('unread'), counts?.unread ?? 0)}
        {smartLink('/starred', <Star size={17} />, t('starred'), counts?.starred ?? 0)}
        {smartLink('/read-later', <Clock3 size={17} />, t('readLater'), counts?.readLater ?? 0)}
      </div>

      <button
        onClick={async () => {
          await ArticleService.markAllRead();
          invalidate('counts', 'articles');
          toast(t('toastMarkedRead'));
        }}
        className="btn btn--ghost btn--sm mt-1 w-full justify-start text-xs"
      >
        <CheckCheck size={14} /> {t('markAllRead')}
      </button>

      {/* Feeds header */}
      <div className="mt-4 flex items-center justify-between px-1">
        <span className="px-2 text-[11px] font-medium uppercase tracking-[1.5px] text-faint">{t('feeds')}</span>
        <div className="flex items-center">
          {folders.length > 0 && (
            <button
              onClick={() =>
                setCollapsed(allCollapsed ? new Set() : new Set(folders.map((f) => f.id)))
              }
              aria-label={allCollapsed ? t('expandAll') : t('collapseAll')}
              title={allCollapsed ? t('expandAll') : t('collapseAll')}
              className="icon-btn"
            >
              {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
            </button>
          )}
          <button
            onClick={() => setFolderModal('new')}
            aria-label={t('newFolder')}
            title={t('newFolder')}
            className="icon-btn"
          >
            <FolderPlus size={16} />
          </button>
          <button
            onClick={() => setUI({ addFeedOpen: true })}
            aria-label={t('addFeed')}
            title={t('addFeed')}
            className="icon-btn"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Folders + feeds */}
      <div className="flex flex-col gap-0.5">
        {folders.map((folder) => {
          const list = byFolder.get(folder.id) ?? [];
          const isCollapsed = collapsed.has(folder.id);
          return (
            <div key={folder.id}>
              <div className="group flex items-center rounded-lg pr-1 hover:bg-rowhover">
                <button
                  onClick={() => toggle(folder.id)}
                  aria-expanded={!isCollapsed}
                  className="nav-item flex-1 !bg-transparent px-2 font-semibold"
                >
                  {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  <span className="truncate">{folder.name}</span>
                  <span className="badge badge--count !text-[11px] font-normal">{list.length}</span>
                </button>
                <button
                  onClick={() => setMenuFolderId(menuFolderId === folder.id ? null : folder.id)}
                  aria-label={`${t('edit')} ${folder.name}`}
                  className="icon-btn icon-btn--sm hover-reveal focus:opacity-100"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
              {menuFolderId === folder.id && (
                <div className="animate-fade-in ml-6 flex gap-1 pb-1">
                  <button onClick={() => { setRenameFolderId(folder.id); setMenuFolderId(null); }} className="btn btn--ghost btn--sm text-xs">{t('rename')}</button>
                  <button onClick={() => { setDeleteFolderId(folder.id); setMenuFolderId(null); }} className="btn btn--ghost btn--sm text-xs text-clay hover:text-clay"><Trash2 size={12} />{t('delete')}</button>
                </div>
              )}
              {!isCollapsed &&
                list.map((feed) => (
                  <FeedRow
                    key={feed.id}
                    feedId={feed.id}
                    title={feed.title}
                    icon={feed.icon}
                    siteUrl={feed.siteUrl}
                    unread={counts?.perFeedUnread[feed.id] ?? 0}
                    isDemo={feed.isDemo}
                    menuOpen={menuFeedId === feed.id}
                    onMenu={() => setMenuFeedId(menuFeedId === feed.id ? null : feed.id)}
                    onNavigate={onNavigate}
                    demoBadge={t('demoBadge')}
                  />
                ))}
            </div>
          );
        })}

        {(byFolder.get(undefined) ?? []).map((feed) => (
          <FeedRow
            key={feed.id}
            feedId={feed.id}
            title={feed.title}
            icon={feed.icon}
            siteUrl={feed.siteUrl}
            unread={counts?.perFeedUnread[feed.id] ?? 0}
            isDemo={feed.isDemo}
            menuOpen={menuFeedId === feed.id}
            onMenu={() => setMenuFeedId(menuFeedId === feed.id ? null : feed.id)}
            onNavigate={onNavigate}
            demoBadge={t('demoBadge')}
          />
        ))}

        {feeds.length === 0 && (
          <button
            onClick={() => setUI({ addFeedOpen: true })}
            className="mt-2 rounded-xl border border-dashed border-line2 px-3 py-4 text-center text-sm text-muted hover:border-faint hover:text-ink"
          >
            {t('emptyTitle')}
            <span className="mt-1 block text-xs">{t('emptySubtitle')}</span>
          </button>
        )}
      </div>

      {/* Feed context actions */}
      {menuFeedId && (
        <FeedMenu
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          onClose={() => setMenuFeedId(null)}
          onRename={() => { setRenameFeedId(menuFeedId); setMenuFeedId(null); }}
          onMove={(folderId) => { void FeedService.moveFeed(menuFeedId, folderId).then(() => { invalidate('feeds'); setMenuFeedId(null); }); }}
          onDelete={() => { setDeleteFeedId(menuFeedId); setMenuFeedId(null); }}
        />
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-hairsoft pt-3">
        <div className="flex gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="btn btn--secondary btn--sm flex-1 text-xs"
          >
            <Upload size={14} /> {t('importOpml')}
          </button>
          <button
            onClick={doExport}
            className="btn btn--secondary btn--sm flex-1 text-xs"
          >
            <Download size={14} /> {t('exportOpml')}
          </button>
        </div>
        {counts?.hasDemo && (
          <button
            onClick={clearDemo}
            className="btn btn--ghost btn--sm w-full text-xs"
          >
            {t('clearDemo')}
          </button>
        )}
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
      </div>

      {/* Dialogs */}
      <PromptDialog
        open={folderModal === 'new'}
        title={t('newFolder')}
        initial=""
        onCancel={() => setFolderModal(null)}
        onConfirm={async (v) => {
          if (!v) return setFolderModal(null);
          await FolderRepository.put({ id: uid('folder'), name: v, createdAt: Date.now() });
          setFolderModal(null);
          invalidate('folders');
        }}
      />
      <PromptDialog
        open={!!renameFeedId}
        title={t('rename')}
        initial={renameFeed?.title ?? ''}
        onCancel={() => setRenameFeedId(null)}
        onConfirm={async (v) => {
          if (renameFeedId && v) await FeedService.renameFeed(renameFeedId, v);
          setRenameFeedId(null);
          invalidate('feeds');
        }}
      />
      <ConfirmDialog
        open={!!deleteFeedId}
        message={t('confirmDeleteFeed')}
        danger
        onCancel={() => setDeleteFeedId(null)}
        onConfirm={async () => {
          if (deleteFeedId) await FeedService.deleteFeed(deleteFeedId);
          setDeleteFeedId(null);
          invalidate('feeds', 'counts', 'articles');
          toast(t('toastFeedDeleted'), 'info');
        }}
      />
      <PromptDialog
        open={!!renameFolderId}
        title={t('rename')}
        initial={folders.find((f) => f.id === renameFolderId)?.name ?? ''}
        onCancel={() => setRenameFolderId(null)}
        onConfirm={async (v) => {
          if (renameFolderId && v) await FolderRepository.update(renameFolderId, v);
          setRenameFolderId(null);
          invalidate('folders');
        }}
      />
      <ConfirmDialog
        open={!!deleteFolderId}
        message={t('confirmDeleteFolder')}
        danger
        onCancel={() => setDeleteFolderId(null)}
        onConfirm={async () => {
          if (deleteFolderId) await FolderRepository.remove(deleteFolderId);
          setDeleteFolderId(null);
          invalidate('feeds', 'folders');
        }}
      />
    </div>
  );
}

function FeedRow({
  feedId, title, icon, unread, isDemo, menuOpen, onMenu, onNavigate, demoBadge,
}: {
  feedId: string;
  title: string;
  icon?: string;
  siteUrl?: string;
  unread: number;
  isDemo?: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onNavigate?: () => void;
  demoBadge: string;
}) {
  const [iconOk, setIconOk] = useState(true);
  return (
    <div className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-rowhover">
      <NavLink
        to={`/feed/${feedId}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn('nav-item min-w-0 flex-1 !text-[13px]', isActive && 'is-active')
        }
      >
        {icon && iconOk ? (
          <img
            src={icon}
            alt=""
            loading="lazy"
            onError={() => setIconOk(false)}
            className="h-4 w-4 shrink-0 rounded"
          />
        ) : (
          <Rss size={14} className="shrink-0 text-faint" />
        )}
        <span className="truncate">{title}</span>
        {isDemo && (
          <span className="badge badge--status shrink-0">
            {demoBadge}
          </span>
        )}
        <Count n={unread} />
      </NavLink>
      <button
        onClick={onMenu}
        aria-label="Feed actions"
        aria-expanded={menuOpen}
        className="icon-btn icon-btn--sm hover-reveal shrink-0 focus:opacity-100"
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
  );
}

function FeedMenu({
  folders, onClose, onRename, onMove, onDelete,
}: {
  folders: Array<{ id: string; name: string }>;
  onClose: () => void;
  onRename: () => void;
  onMove: (folderId?: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div className="popover animate-fade-in ml-8 p-1.5" role="menu">
      <button onClick={onRename} className="pop-item">{t('rename')}</button>
      <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[1.5px] text-faint">{t('moveTo')}</div>
      <button onClick={() => onMove(undefined)} className="pop-item">{t('noFolder')}</button>
      {folders.map((f) => (
        <button key={f.id} onClick={() => onMove(f.id)} className="pop-item truncate">
          {f.name}
        </button>
      ))}
      <div className="my-1 border-t border-hairsoft" />
      <button onClick={onDelete} className="pop-item text-clay">
        <Trash2 size={13} /> {t('delete')}
      </button>
      <button onClick={onClose} className="pop-item mt-1 justify-center text-xs text-faint">{t('cancel')}</button>
    </div>
  );
}
