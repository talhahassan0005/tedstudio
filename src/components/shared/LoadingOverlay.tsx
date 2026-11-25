'use client';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LoadingOverlayProps {
  show: boolean;
  label?: string;
  /** 0-100, or null for an indeterminate spinner. */
  progress?: number | null;
  /** Cover the nearest positioned parent instead of the whole viewport. */
  contained?: boolean;
  className?: string;
}

export function LoadingOverlay({
  show,
  label = 'Working…',
  progress = null,
  contained = false,
  className,
}: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm',
        contained ? 'absolute inset-0' : 'fixed inset-0',
        className,
      )}
    >
      <Loader2 className="h-10 w-10 animate-spin text-primary" />

      <div className="max-w-sm px-6 text-center">
        <p className="breathe text-sm font-medium text-foreground">{label}</p>
        {progress !== null && (
          <p className="mt-1 text-xs text-muted-foreground">{Math.round(progress)}%</p>
        )}
      </div>

      {progress !== null && (
        <div className="h-1.5 w-56 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      )}

      <p className="px-6 text-center text-xs text-muted-foreground">
        Keep this tab open while the job runs.
      </p>
    </div>
  );
}
