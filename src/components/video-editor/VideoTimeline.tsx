'use client';

import { useCallback, useRef, useState } from 'react';
import { Loader2, Scissors } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { clamp, cn, formatTime } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

type Handle = 'start' | 'end' | 'playhead';

/**
 * Trim timeline with draggable in/out handles.
 *
 * Positions are percentages of the clip duration; the store holds the real
 * seconds so the API call and the preview agree.
 */
export function VideoTimeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const {
    duration,
    trimStart,
    trimEnd,
    setTrimStart,
    setTrimEnd,
    currentTime,
    setCurrentTime,
    resetTrim,
    isProcessing,
  } = useVideoEditorStore();

  const { trim } = useVideoEditor();

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || !duration) return 0;
      return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
    },
    [duration],
  );

  const onPointerDown = useCallback(
    (handle: Handle) => (event: React.PointerEvent) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(handle);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging) return;
      const time = timeFromEvent(event.clientX);
      if (dragging === 'start') setTrimStart(time);
      else if (dragging === 'end') setTrimEnd(time);
      else setCurrentTime(time);
    },
    [dragging, timeFromEvent, setTrimStart, setTrimEnd, setCurrentTime],
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(null);
  }, []);

  const pct = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);
  const kept = Math.max(0, trimEnd - trimStart);
  const disabled = duration <= 0 || isProcessing;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Trim</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span>in {formatTime(trimStart)}</span>
          <Separator orientation="vertical" className="h-3" />
          <span>out {formatTime(trimEnd)}</span>
          <Separator orientation="vertical" className="h-3" />
          <span className="text-primary">keeping {kept.toFixed(1)}s</span>
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className={cn(
          'relative h-14 select-none rounded-md bg-slate-950',
          disabled ? 'opacity-50' : 'cursor-pointer',
        )}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerDown={(event) => {
          if (disabled) return;
          setCurrentTime(timeFromEvent(event.clientX));
        }}
      >
        {/* Discarded regions */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-md bg-slate-950/80 backdrop-grayscale"
          style={{ width: `${pct(trimStart)}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-md bg-slate-950/80"
          style={{ width: `${100 - pct(trimEnd)}%` }}
        />

        {/* Kept region */}
        <div
          className="absolute inset-y-0 border-y-2 border-primary bg-primary/15"
          style={{ left: `${pct(trimStart)}%`, width: `${pct(trimEnd) - pct(trimStart)}%` }}
        />

        {/* In handle */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim start"
          aria-valuenow={Math.round(trimStart)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          onPointerDown={onPointerDown('start')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setTrimStart(trimStart - 0.5);
            if (event.key === 'ArrowRight') setTrimStart(trimStart + 0.5);
          }}
          className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: `${pct(trimStart)}%` }}
        >
          <span className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-primary-foreground/70" />
        </div>

        {/* Out handle */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim end"
          aria-valuenow={Math.round(trimEnd)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          onPointerDown={onPointerDown('end')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setTrimEnd(trimEnd - 0.5);
            if (event.key === 'ArrowRight') setTrimEnd(trimEnd + 0.5);
          }}
          className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: `${pct(trimEnd)}%` }}
        >
          <span className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-primary-foreground/70" />
        </div>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-rose-400"
          style={{ left: `${pct(currentTime)}%` }}
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-rose-400" />
        </div>
      </div>

      {/* Ruler */}
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>0:00</span>
        <span>{formatTime(duration / 2)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => trim(false)} disabled={disabled || kept < 0.1}>
          {isProcessing ? <Loader2 className="animate-spin" /> : <Scissors />}
          Trim (fast)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => trim(true)}
          disabled={disabled || kept < 0.1}
          title="Re-encodes so the cut lands exactly on the chosen times"
        >
          Frame-accurate
        </Button>
        <Button size="sm" variant="ghost" onClick={resetTrim} disabled={disabled}>
          Reset
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The fast trim copies streams without re-encoding, so the cut snaps to the nearest
        keyframe and may start up to a second early. Frame-accurate re-encodes.
      </p>
    </div>
  );
}
