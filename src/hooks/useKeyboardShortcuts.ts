import { useEffect } from 'react';
import { isEditableTarget } from '../utils/helpers';

export interface ShortcutHandlers {
  next: () => void;
  prev: () => void;
  open: () => void;
  toggleStar: () => void;
  markRead: () => void;
  markUnread: () => void;
  refresh: () => void;
  focusSearch: () => void;
  showHelp: () => void;
}

/** Desktop keyboard shortcuts: j/k/o/s/m/u/r/// ?. Ignored inside inputs. */
export function useKeyboardShortcuts(h: ShortcutHandlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod) return; // Cmd+K handled separately
      if (isEditableTarget(e.target)) return;
      switch (e.key) {
        case 'j':
          e.preventDefault();
          h.next();
          break;
        case 'k':
          e.preventDefault();
          h.prev();
          break;
        case 'o':
          e.preventDefault();
          h.open();
          break;
        case 's':
          e.preventDefault();
          h.toggleStar();
          break;
        case 'm':
          e.preventDefault();
          h.markRead();
          break;
        case 'u':
          e.preventDefault();
          h.markUnread();
          break;
        case 'r':
          e.preventDefault();
          h.refresh();
          break;
        case '/':
          e.preventDefault();
          h.focusSearch();
          break;
        case '?':
          e.preventDefault();
          h.showHelp();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, h]);
}
