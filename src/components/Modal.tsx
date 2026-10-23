import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/helpers';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

/** Accessible modal: focus trap, Escape to close, focus restore. */
export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  // onClose is an inline closure in callers (identity changes every render).
  // Route it through a ref so focus setup/teardown runs exactly once per
  // open — otherwise typing in a modal input would yank focus on each
  // keystroke whenever the parent re-renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus first focusable element
    const t = window.setTimeout(() => {
      const el = panel?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-close])',
      );
      (el ?? panel)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href]'),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      prevFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="scrim animate-fade-in fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'animate-pop w-full rounded-t-2xl border border-hairline bg-card p-5 shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.25)] outline-none sm:rounded-xl',
          wide ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-medium tracking-tight text-ink">{title}</h2>
          <button
            data-close
            onClick={onClose}
            aria-label="Close dialog"
            className="icon-btn"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
