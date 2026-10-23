import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Clock3, Inbox, LayoutGrid, Settings, Star } from 'lucide-react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AddFeedModal } from './AddFeedModal';
import { CommandPalette } from './CommandPalette';
import { ShortcutsModal } from './ShortcutsModal';
import { Toasts } from './Toasts';
import { useT } from '../hooks/useT';
import { useSettingsStore } from '../stores/appStore';
import { PaneResizer } from './PaneResizer';
import { cn } from '../utils/helpers';

export function Layout() {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSettings = useSettingsStore((s) => s.set);

  const closeDrawer = () => setDrawer(false);

  return (
    <div className="flex h-full text-body">
      <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
        <TopBar onMenu={() => setDrawer(true)} />

        {/* main: sidebar | list | reader — each pane scrolls internally */}
        <div className="flex min-h-0 flex-1">
          <aside className="hidden shrink-0 bg-parchment lg:block" style={{ width: sidebarWidth }} aria-label="Sidebar">
            <Sidebar />
          </aside>
          <PaneResizer
            value={sidebarWidth}
            onChange={(w) => setSettings({ sidebarWidth: w })}
            min={160}
            max={320}
            defaultValue={212}
            label={t('resizeSidebar')}
          />
          <main className="min-w-0 flex-1 border-l border-hairline pb-16 lg:pb-0">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="scrim animate-fade-in absolute inset-0" onClick={closeDrawer} />
          <aside
            className="animate-slide-in-left absolute left-0 top-0 h-full w-80 max-w-[85vw] border-r border-hairline bg-parchment shadow-2xl"
            aria-label="Navigation drawer"
          >
            <Sidebar onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around border-t border-hairline bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <Tab to="/" icon={<LayoutGrid size={20} />} label={t('all')} />
        <Tab to="/unread" icon={<Inbox size={20} />} label={t('unread')} />
        <Tab to="/starred" icon={<Star size={20} />} label={t('starred')} />
        <Tab to="/read-later" icon={<Clock3 size={20} />} label={t('readLater')} />
        <Tab to="/settings" icon={<Settings size={20} />} label={t('settings')} />
      </nav>

      <AddFeedModal />
      <CommandPalette />
      <ShortcutsModal />
      <Toasts />
    </div>
  );
}

function Tab({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
          isActive ? 'text-coralfg' : 'text-faint hover:text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('rounded-full px-3 py-0.5 transition-colors', isActive && 'bg-coralsoft')}>{icon}</span>
          <span className="max-w-full truncate px-1">{label}</span>
        </>
      )}
    </NavLink>
  );
}
