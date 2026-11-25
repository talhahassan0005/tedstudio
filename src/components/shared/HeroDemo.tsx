'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { clamp, cn } from '@/lib/utils';

/**
 * The landing-page demo: a before/after erase, drawn entirely in SVG so it
 * ships zero image bytes and never looks like stock art.
 *
 * The divider idles back and forth on its own until the visitor grabs it,
 * then it is theirs. Both states render the same scene; "before" adds the
 * power lines and poles that the "after" has erased.
 */
export function HeroDemo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(62);
  const [engaged, setEngaged] = useState(false);
  const draggingRef = useRef(false);

  // Idle sweep before first interaction — a living page, not a screenshot.
  useEffect(() => {
    if (engaged) return;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      setPosition(62 + Math.sin(t * 0.7) * 14);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engaged]);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100, 4, 96));
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      setEngaged(true);
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (draggingRef.current) updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_64px_-32px_rgba(0,0,0,0.8)]',
        className,
      )}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-slate-950/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          erase — dunes.png
        </span>
        <span className="ml-auto font-mono text-[10px] text-primary">
          {engaged ? 'drag to compare' : 'ai.cleanup ✓'}
        </span>
      </div>

      {/* Scene */}
      <div
        ref={containerRef}
        className="relative aspect-[16/9] cursor-ew-resize touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-label="Before and after comparison"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            setEngaged(true);
            setPosition((p) => clamp(p + (event.key === 'ArrowLeft' ? -3 : 3), 4, 96));
          }
        }}
      >
        {/* AFTER (base layer): clean scene */}
        <Scene erased className="absolute inset-0" />

        {/* BEFORE: same scene plus the clutter, clipped to the divider */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <Scene className="absolute inset-0" />
        </div>

        {/* Divider */}
        <div
          className="absolute inset-y-0 z-10 w-px bg-primary/90"
          style={{ left: `${position}%` }}
        >
          <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-primary/60 bg-slate-950 text-[10px] text-primary shadow-lg">
            ⇔
          </span>
        </div>

        {/* Corner labels */}
        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
          before
        </span>
        <span className="pointer-events-none absolute right-2.5 top-2.5 rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-primary backdrop-blur">
          after
        </span>
      </div>
    </div>
  );
}

/** One SVG scene; `erased` leaves out the poles and wires. */
function Scene({ erased = false, className }: { erased?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sky-${erased}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1a33" />
          <stop offset="0.55" stopColor="#1c3356" />
          <stop offset="0.78" stopColor="#7a4a3a" />
          <stop offset="1" stopColor="#c97b4a" />
        </linearGradient>
        <linearGradient id={`dune1-${erased}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2238" />
          <stop offset="1" stopColor="#140f1f" />
        </linearGradient>
        <linearGradient id={`dune2-${erased}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2b44" />
          <stop offset="1" stopColor="#1c1428" />
        </linearGradient>
      </defs>

      {/* Sky + sun */}
      <rect width="640" height="360" fill={`url(#sky-${erased})`} />
      <circle cx="430" cy="252" r="46" fill="#f4a95c" opacity="0.9" />
      <circle cx="430" cy="252" r="70" fill="#f4a95c" opacity="0.18" />

      {/* Stars */}
      <g fill="#e2e8f0" opacity="0.7">
        <circle cx="80" cy="48" r="1.4" />
        <circle cx="180" cy="86" r="1" />
        <circle cx="300" cy="40" r="1.2" />
        <circle cx="520" cy="60" r="1.4" />
        <circle cx="590" cy="120" r="1" />
        <circle cx="120" cy="140" r="1" />
      </g>

      {/* Dunes */}
      <path
        d="M0 268 C 90 236, 170 258, 260 278 C 360 300, 430 282, 640 300 L 640 360 L 0 360 Z"
        fill={`url(#dune2-${erased})`}
      />
      <path
        d="M0 310 C 120 282, 260 320, 400 316 C 500 313, 580 300, 640 312 L 640 360 L 0 360 Z"
        fill={`url(#dune1-${erased})`}
      />

      {/* The clutter that gets erased: poles + sagging wires */}
      {!erased && (
        <g>
          <g stroke="#0b0f17" strokeWidth="5" strokeLinecap="round">
            <line x1="120" y1="300" x2="120" y2="130" />
            <line x1="330" y1="310" x2="330" y2="118" />
            <line x1="545" y1="302" x2="545" y2="126" />
          </g>
          <g stroke="#0b0f17" strokeWidth="4" strokeLinecap="round">
            <line x1="96" y1="138" x2="144" y2="138" />
            <line x1="306" y1="126" x2="354" y2="126" />
            <line x1="521" y1="134" x2="569" y2="134" />
          </g>
          <g stroke="#0d1320" strokeWidth="2.5" fill="none">
            <path d="M120 140 Q 225 175 330 128" />
            <path d="M330 128 Q 437 172 545 136" />
            <path d="M120 150 Q 225 188 330 138" />
            <path d="M330 138 Q 437 184 545 146" />
          </g>
        </g>
      )}
    </svg>
  );
}
