'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Music, Pause, Play, Trash2 } from 'lucide-react';

import { FileUploader } from '@/components/shared/FileUploader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import type { MediaAsset } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

export function MusicPanel() {
  const {
    audio,
    setAudio,
    setAudioVolume,
    keepOriginalAudio,
    setKeepOriginalAudio,
    isProcessing,
    clips,
    resultUrl,
  } = useVideoEditorStore();
  const { addMusicTrack } = useVideoEditor();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loop, setLoop] = useState(false);

  // Audition at the same level that will be mixed in.
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !audio) return;
    element.volume = audio.volume;
  }, [audio]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    if (previewing) element.play().catch(() => setPreviewing(false));
    else element.pause();
  }, [previewing, audio?.url]);

  const onUploaded = (asset: MediaAsset) => {
    setAudio({
      id: asset.id,
      name: asset.originalFilename ?? 'Audio track',
      url: asset.secureUrl,
      publicId: asset.publicId,
      duration: asset.duration,
      volume: 0.8,
    });
    setPreviewing(false);
  };

  const hasVideo = Boolean(resultUrl ?? clips[0]?.url);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Music</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Lay an audio track over the clip and set its level.
        </p>
      </div>

      {!audio ? (
        <FileUploader
          resourceType="audio"
          compact
          label="Add an audio track"
          hint="MP3, WAV, M4A or OGG"
          onUploaded={onUploaded}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-900/50 p-2">
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => setPreviewing((value) => !value)}
              aria-label={previewing ? 'Pause preview' : 'Preview track'}
            >
              {previewing ? <Pause /> : <Play />}
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{audio.name}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {audio.duration ? formatTime(audio.duration) : 'length unknown'}
              </p>
            </div>

            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                setPreviewing(false);
                setAudio(null);
              }}
              aria-label="Remove audio track"
            >
              <Trash2 />
            </Button>
          </div>

          <audio
            ref={audioRef}
            src={audio.url}
            onEnded={() => setPreviewing(false)}
            className="hidden"
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Music level</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.round(audio.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[audio.volume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => setAudioVolume(value / 100)}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Keep the original sound</p>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Mix with the clip&apos;s own audio instead of replacing it.
                </p>
              </div>
              <Switch
                checked={keepOriginalAudio}
                onCheckedChange={setKeepOriginalAudio}
                aria-label="Keep original audio"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Loop to fill the video</p>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Repeat the track if it is shorter than the clip.
                </p>
              </div>
              <Switch
                checked={loop}
                onCheckedChange={setLoop}
                aria-label="Loop audio track"
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={() => addMusicTrack(loop)}
            disabled={!hasVideo || isProcessing}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Music />}
            {hasVideo ? 'Add to video' : 'Add a clip first'}
          </Button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The output ends when the shorter of the two streams does, so a short track leaves the
            tail silent unless you loop it.
          </p>
        </>
      )}
    </div>
  );
}
