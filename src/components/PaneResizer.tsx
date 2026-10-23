import { useRef } from 'react';

interface Props {
  /** Current pane width in px. */
  value: number;
  onChange: (px: number) => void;
  min: number;
  max: number;
  /** Double-click resets to this width. */
  defaultValue: number;
  label: string;
}

/**
 * Vertical drag handle between panes (desktop only). The visible line is
 * 1px; the hit area is 9px wide and straddles the pane edge. Drag updates
 * live; double-click restores the default.
 */
export function PaneResizer({ value, onChange, min, max, defaultValue, label }: Props) {
  const start = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start.current = { x: e.clientX, w: value };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const next = Math.round(start.current.w + (e.clientX - start.current.x));
    onChange(Math.min(max, Math.max(min, next)));
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onChange(defaultValue)}
      className="group/rez relative z-10 -ml-px hidden w-px shrink-0 cursor-col-resize touch-none select-none bg-hairline transition-colors hover:bg-coral lg:block"
    >
      {/* widen the hit area without affecting layout */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="absolute inset-y-0 w-px bg-coral opacity-0 transition-opacity group-hover/rez:opacity-100 group-active/rez:opacity-100" />
    </div>
  );
}
