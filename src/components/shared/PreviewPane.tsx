'use client';

import { useCallback, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

import { cn, clamp } from '@/lib/utils';

export interface PreviewPaneProps {
  beforeSrc: string;
  afterSrc: string;
  /** 'split' drags a divider across the two; 'toggle' shows one at a time. */
  mode?: 'split' | 'toggle';
  showBefore?: boolean;
  alt?: string;
  className?: string;
}

/**
 * Before/after comparison. In split mode the divider is draggable with the
 * mouse, touch, or the arrow keys when focused.
 */
export function PreviewPane({
  beforeSrc,
  afterSrc,
  mode = 'split',
  showBefore = false,
  alt = 'Result preview',
  className,
}: PreviewPaneProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (mode === 'toggle') {
    return (
      <div className={cn('relative overflow-hidden rounded-lg bg-slate-950', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={showBefore ? beforeSrc : afterSrc}
          alt={showBefore ? 'Before' : alt}
          className="h-full w-full object-contain"
        />
        <span className="absolute left-3 top-3 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-medium">
          {showBefore ? 'Before' : 'After'}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative select-none overflow-hidden rounded-lg bg-slate-950', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc} alt={alt} className="h-full w-full object-contain" />

      {/* The "before" layer, clipped to the divider position. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeSrc} alt="Before" className="h-full w-full object-contain" />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Comparison position"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setPosition((p) => clamp(p - 2, 0, 100));
          if (event.key === 'ArrowRight') setPosition((p) => clamp(p + 2, 0, 100));
        }}
        className="absolute inset-y-0 w-1 cursor-ew-resize bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ left: `${position}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/60 bg-slate-950 shadow-lg">
          <GripVertical className="h-4 w-4 text-primary" />
        </div>
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-medium">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-medium">
        After
      </span>
    </div>
  );
}
