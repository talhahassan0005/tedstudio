'use client';

import { ChevronDown, ChevronUp, Clapperboard, Loader2, Trash2 } from 'lucide-react';

import { FileUploader } from '@/components/shared/FileUploader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import type { MediaAsset, Transition } from '@/lib/types';
import { useVideoEditorStore } from '@/store/videoEditorStore';

const TRANSITIONS: { value: Transition; label: string; note: string }[] = [
  { value: 'fade', label: 'Fade', note: 'Cross-dissolve' },
  { value: 'slide', label: 'Slide', note: 'Push left' },
  { value: 'none', label: 'Cut', note: 'Hard cut' },
];

export function ImageToVideoPanel() {
  const {
    slideshowImages,
    addSlideshowImage,
    removeSlideshowImage,
    moveSlideshowImage,
    durationPerImage,
    setDurationPerImage,
    transition,
    setTransition,
    clearSlideshow,
    isProcessing,
  } = useVideoEditorStore();

  const { createFromImages } = useVideoEditor();

  const onUploaded = (asset: MediaAsset) => {
    addSlideshowImage({
      url: asset.secureUrl,
      name: asset.originalFilename ?? `Image ${slideshowImages.length + 1}`,
      duration: durationPerImage,
    });
  };

  const count = slideshowImages.length;
  // xfade overlaps each pair, so the runtime is shorter than n × duration.
  const overlap = transition === 'none' ? 0 : Math.min(0.75, durationPerImage * 0.4);
  const estimated = Math.max(0, count * durationPerImage - Math.max(0, count - 1) * overlap);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Images to video</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Build an MP4 slideshow from stills. Rendered at 1080p, 30 fps.
        </p>
      </div>

      <FileUploader
        resourceType="image"
        multiple
        compact
        label="Add images"
        onUploaded={onUploaded}
      />

      {count > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {count} {count === 1 ? 'image' : 'images'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={clearSlideshow}
            >
              Clear
            </Button>
          </div>

          <div className="space-y-1.5">
            {slideshowImages.map((image, index) => (
              <div
                key={image.id}
                className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
              >
                <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>

                <span className="h-8 w-12 shrink-0 overflow-hidden rounded bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </span>

                <span className="min-w-0 flex-1 truncate text-xs">{image.name}</span>

                <div className="flex flex-col">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="h-3 w-5"
                    onClick={() => moveSlideshowImage(image.id, 'up')}
                    disabled={index === 0}
                    aria-label="Move earlier"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="h-3 w-5"
                    onClick={() => moveSlideshowImage(image.id, 'down')}
                    disabled={index === count - 1}
                    aria-label="Move later"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => removeSlideshowImage(image.id)}
                  aria-label={`Remove ${image.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Seconds per image</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {durationPerImage.toFixed(1)}s
              </span>
            </div>
            <Slider
              value={[durationPerImage]}
              min={0.5}
              max={10}
              step={0.5}
              onValueChange={([value]) => setDurationPerImage(value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Transition</Label>
            <RadioGroup
              value={transition}
              onValueChange={(value) => setTransition(value as Transition)}
              className="grid grid-cols-3 gap-2"
            >
              {TRANSITIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`transition-${option.value}`}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-2 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 hover:border-primary/50"
                >
                  <RadioGroupItem
                    id={`transition-${option.value}`}
                    value={option.value}
                    className="sr-only"
                  />
                  <span className="text-xs font-medium">{option.label}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    {option.note}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="rounded-lg border border-border bg-slate-900/50 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Estimated length</span>
              <span className="font-medium tabular-nums">{estimated.toFixed(1)}s</span>
            </div>
            {transition !== 'none' && count > 1 && (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Each transition overlaps {overlap.toFixed(2)}s, so the total is shorter than{' '}
                {count} × {durationPerImage}s.
              </p>
            )}
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={createFromImages}
            disabled={count === 0 || isProcessing}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Clapperboard />}
            Create video
          </Button>
        </>
      )}
    </div>
  );
}
