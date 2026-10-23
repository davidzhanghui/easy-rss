import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  kicker,
  title,
  subtitle,
  stats,
  action,
}: {
  icon: LucideIcon;
  kicker?: string;
  title: string;
  subtitle?: string;
  stats?: Array<{ n: number; label: string }>;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-in flex min-h-full flex-col items-center justify-center px-6 py-14 text-center sm:px-8 sm:py-16">
      {/* tilted paper-card icon (mail-archive empty-state motif) */}
      <div className="mb-6 flex h-16 w-16 -rotate-6 items-center justify-center rounded-lg border border-paperedge bg-paper text-envelope shadow-[0_8px_20px_rgba(var(--shadow-rgb),0.12),0_2px_6px_rgba(var(--shadow-rgb),0.08)]">
        <Icon size={26} strokeWidth={1.6} />
      </div>
      {kicker && (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2.5px] text-faint">
          {kicker}
        </p>
      )}
      <p className="font-display text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">{title}</p>
      {subtitle && <p className="mt-2 max-w-xs text-[13.5px] leading-6 text-muted">{subtitle}</p>}
      {stats && (
        <div className="mt-7 flex items-stretch gap-6 border-t border-hairsoft pt-5">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <span className="font-display text-[22px] font-semibold tabular-nums text-ink">
                {s.n}
              </span>
              <span className="text-[11px] uppercase tracking-[1px] text-faint">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ArticleSkeletonList() {
  return (
    <div className="divide-y divide-hairsoft" aria-label="Loading articles">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-3 w-14" />
          </div>
          <div className="skeleton mt-2.5 h-4 w-11/12" />
          <div className="skeleton mt-2 h-4 w-3/4" />
          <div className="skeleton mt-2.5 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReaderSkeleton() {
  return (
    <div className="px-6 py-9 sm:px-12" aria-label="Loading article">
      <div className="flex gap-2">
        <div className="skeleton h-7 w-16" />
        <div className="skeleton h-7 w-16" />
        <div className="skeleton h-7 w-16" />
      </div>
      <div className="skeleton mt-8 h-3 w-40" />
      <div className="skeleton mt-4 h-7 w-11/12" />
      <div className="skeleton mt-2 h-7 w-2/3" />
      <div className="skeleton mt-8 h-3 w-full" />
      <div className="skeleton mt-3 h-3 w-full" />
      <div className="skeleton mt-3 h-3 w-5/6" />
      <div className="skeleton mt-6 h-44 w-full !rounded-md" />
      <div className="skeleton mt-6 h-3 w-full" />
      <div className="skeleton mt-3 h-3 w-4/6" />
    </div>
  );
}
