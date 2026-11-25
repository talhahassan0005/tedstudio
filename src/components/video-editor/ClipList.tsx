'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Film, GripVertical, Loader2, Merge, Trash2 } from 'lucide-react';

import { FileUploader } from '@/components/shared/FileUploader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { videoThumbnailUrl } from '@/lib/cloudinary';
import { saveProject } from '@/lib/projects';
import type { MediaAsset } from '@/lib/types';
import { uid } from '@/lib/utils';
import { cn, formatTime } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

export function ClipList() {
  const {
    clips,
    activeClipId,
    addClip,
    removeClip,
    setActiveClip,
    moveClip,
    reorderClips,
    isProcessing,
  } = useVideoEditorStore();
  const { merge } = useVideoEditor();

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const onUploaded = (asset: MediaAsset) => {
    addClip({
      name: asset.originalFilename ?? 'Clip',
      url: asset.secureUrl,
      publicId: asset.publicId,
      duration: asset.duration ?? 0,
      trimStart: 0,
      trimEnd: asset.duration ?? 0,
      // Cloudinary can render a frame as a still, so no client-side work.
      thumbnailUrl: asset.publicId ? videoThumbnailUrl(asset.publicId, 0) : undefined,
    });

    // History write is fire-and-forget: the editor must not wait on it.
    void saveProject({
      id: uid('proj'),
      name: asset.originalFilename ?? 'Untitled video',
      kind: 'video',
      thumbnailUrl: asset.publicId ? videoThumbnailUrl(asset.publicId, 0) : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Clips</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag to reorder. Merging joins them top to bottom.
        </p>
      </div>

      <FileUploader
        resourceType="video"
        multiple
        compact
        label="Add video clips"
        onUploaded={onUploaded}
      />

      {clips.length > 0 && (
        <>
          <Separator />

          <div className="space-y-1.5">
            {clips.map((clip, index) => {
              const active = clip.id === activeClipId;
              return (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) reorderClips(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 hover:bg-accent/40',
                    dragIndex === index && 'opacity-50',
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />

                  <button
                    type="button"
                    onClick={() => setActiveClip(clip.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="relative h-8 w-12 shrink-0 overflow-hidden rounded bg-slate-950">
                      {clip.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={clip.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Film className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{clip.name}</span>
                      <span className="block text-[10px] tabular-nums text-muted-foreground">
                        {clip.duration > 0 ? formatTime(clip.duration) : 'unknown length'}
                      </span>
                    </span>

                    {active && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        active
                      </Badge>
                    )}
                  </button>

                  <div className="flex flex-col">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="h-3 w-5"
                      onClick={() => moveClip(clip.id, 'up')}
                      disabled={index === 0}
                      aria-label="Move clip up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="h-3 w-5"
                      onClick={() => moveClip(clip.id, 'down')}
                      disabled={index === clips.length - 1}
                      aria-label="Move clip down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => removeClip(clip.id)}
                    aria-label={`Remove ${clip.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button
            className="w-full"
            onClick={merge}
            disabled={clips.length < 2 || isProcessing}
            size="sm"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Merge />}
            {clips.length < 2 ? 'Add another clip to merge' : `Merge ${clips.length} clips`}
          </Button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Clips are joined as uploaded. To merge trimmed versions, trim each clip first and the
            render replaces it in the list.
          </p>
        </>
      )}
    </div>
  );
}
