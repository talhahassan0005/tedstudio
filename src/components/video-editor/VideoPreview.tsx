'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  Maximize,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn, formatTime } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

export interface VideoPreviewProps {
  src: string | null;
  className?: string;
  /** Clamp playback to the trim window, so the preview matches the output. */
  respectTrim?: boolean;
}

export function VideoPreview({ src, className, respectTrim = false }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    isPlaying,
    setPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    muted,
    toggleMuted,
    trimStart,
    trimEnd,
  } = useVideoEditorStore();

  // --- keep the element in sync with the store ----------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [isPlaying, setPlaying, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Loop inside the trim window rather than running past it.
    if (respectTrim && trimEnd > 0 && video.currentTime >= trimEnd) {
      video.currentTime = trimStart;
      if (!isPlaying) video.pause();
    }
    setCurrentTime(video.currentTime);
  }, [respectTrim, trimEnd, trimStart, isPlaying, setCurrentTime]);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const lower = respectTrim ? trimStart : 0;
      const upper = respectTrim && trimEnd > 0 ? trimEnd : (duration || video.duration || 0);
      video.currentTime = Math.max(lower, Math.min(time, upper));
      setCurrentTime(video.currentTime);
    },
    [respectTrim, trimStart, trimEnd, duration, setCurrentTime],
  );

  const requestFullscreen = useCallback(() => {
    videoRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-dashed border-border bg-slate-950/50',
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">Add a clip to preview it</p>
      </div>
    );
  }

  const effectiveDuration = duration || 0;
  const sliderMax = Math.max(0.1, effectiveDuration);

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-lg bg-slate-950', className)}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={src}
          // Needed so a canvas can read frames from a cross-origin video.
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          className="max-h-full max-w-full"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) setDuration(video.duration);
          }}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onClick={() => setPlaying(!isPlaying)}
        />
      </div>

      {/* Controls */}
      <div className="space-y-2 border-t border-border bg-slate-900/80 p-2">
        <Slider
          value={[Math.min(currentTime, sliderMax)]}
          min={0}
          max={sliderMax}
          step={0.05}
          onValueChange={([value]) => seek(value)}
          aria-label="Seek"
        />

        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => seek(currentTime - 5)}
            title="Back 5s"
            aria-label="Back 5 seconds"
          >
            <SkipBack />
          </Button>

          <Button
            size="icon-sm"
            variant="default"
            onClick={() => setPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => seek(currentTime + 5)}
            title="Forward 5s"
            aria-label="Forward 5 seconds"
          >
            <SkipForward />
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => seek(respectTrim ? trimStart : 0)}
            title="Back to start"
            aria-label="Back to start"
          >
            <RotateCcw />
          </Button>

          <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={toggleMuted}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
            </Button>
            <Slider
              value={[muted ? 0 : volume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => setVolume(value / 100)}
              className="w-20"
              aria-label="Volume"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={requestFullscreen}
              aria-label="Fullscreen"
            >
              <Maximize />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
