import { cn } from '../utils/helpers';

/**
 * EasyRSS brand mark — an RSS signal glyph (origin dot + two broadcast arcs).
 * Rendered as inline SVG per the design system (not a font glyph).
 * Shares its geometry with `public/favicon.svg` (badge version).
 */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <g transform="translate(0.6 -0.5625)">
        <g stroke="currentColor" strokeWidth={2.625} strokeLinecap="round" fill="none">
          <path d="M6 12A6 6 0 0 1 12 18" />
          <path d="M6 6A12 12 0 0 1 18 18" />
        </g>
        <circle cx="6" cy="18" r="2.4" fill="var(--color-brass)" />
      </g>
    </svg>
  );
}
