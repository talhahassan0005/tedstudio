import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
  /** Pixel size of the square mark. */
  size?: number;
}

/**
 * The Ted Studio mark: a sky-gradient tile with a chunky "T" and an amber
 * spark — the same art as src/app/icon.svg (the favicon). Inline SVG so it
 * costs no request and inherits no font issues.
 */
export function Logo({ className, size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Ted Studio"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="ted-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id="ted-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Tile */}
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#ted-tile)" />
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#ted-sheen)" />

      {/* T */}
      <rect x="15" y="18" width="34" height="9.5" rx="4.75" fill="#ffffff" />
      <rect x="27.25" y="18" width="9.5" height="30" rx="4.75" fill="#ffffff" />

      {/* Spark */}
      <path
        d="M51 7 L53.2 12.3 L58.5 14.5 L53.2 16.7 L51 22 L48.8 16.7 L43.5 14.5 L48.8 12.3 Z"
        fill="#fbbf24"
      />
    </svg>
  );
}
