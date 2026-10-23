import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore } from '../stores/appStore';

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 lg:bottom-8"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-fade-up pointer-events-auto flex w-full items-center gap-2.5 rounded-xl bg-toastbg py-2.5 pl-3.5 pr-2.5 text-sm text-toastfg shadow-[0_16px_40px_rgba(var(--shadow-rgb),0.3)]"
        >
          {t.kind === 'success' && <CheckCircle2 size={17} className="shrink-0 text-leaf" />}
          {t.kind === 'error' && <AlertCircle size={17} className="shrink-0 text-clay" />}
          {t.kind === 'info' && <Info size={17} className="shrink-0 text-toastfg/80" />}
          <span className="flex-1 leading-5">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="icon-btn icon-btn--sm text-toastfg/60 hover:bg-white/10 hover:text-toastfg"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
