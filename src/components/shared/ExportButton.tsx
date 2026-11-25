'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import type { ExportFormat, VideoQuality } from '@/lib/types';

export interface ExportButtonProps {
  kind: 'image' | 'video';
  disabled?: boolean;
  /** Image export. `quality` is 0-1 and only meaningful for jpg/webp. */
  onExportImage?: (format: ExportFormat, quality: number) => Promise<void> | void;
  /** Video export. */
  onExportVideo?: (quality: VideoQuality) => Promise<void> | void;
  label?: string;
  className?: string;
}

const IMAGE_FORMATS: { value: ExportFormat; label: string; note: string }[] = [
  { value: 'png', label: 'PNG', note: 'Lossless, keeps transparency' },
  { value: 'jpg', label: 'JPG', note: 'Smaller, no transparency' },
  { value: 'webp', label: 'WebP', note: 'Small and lossless-capable' },
];

const VIDEO_QUALITIES: { value: VideoQuality; label: string; note: string }[] = [
  { value: '720p', label: '720p', note: 'Faster, smaller file' },
  { value: '1080p', label: '1080p', note: 'Full HD' },
];

export function ExportButton({
  kind,
  disabled = false,
  onExportImage,
  onExportVideo,
  label = 'Export',
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('1080p');

  const handleExport = async () => {
    setBusy(true);
    try {
      if (kind === 'image') await onExportImage?.(format, quality / 100);
      else await onExportVideo?.(videoQuality);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} className={className} size="sm">
          <Download />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {kind}</DialogTitle>
          <DialogDescription>
            {kind === 'image'
              ? 'Saved at the full source resolution.'
              : 'Re-encoded on delivery at the size you pick.'}
          </DialogDescription>
        </DialogHeader>

        {kind === 'image' ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
                className="grid grid-cols-3 gap-2"
              >
                {IMAGE_FORMATS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`fmt-${option.value}`}
                    className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-3 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 hover:border-primary/50"
                  >
                    <RadioGroupItem id={`fmt-${option.value}`} value={option.value} className="sr-only" />
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {option.note}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {format !== 'png' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Quality</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{quality}%</span>
                </div>
                <Slider
                  value={[quality]}
                  min={40}
                  max={100}
                  step={1}
                  onValueChange={([value]) => setQuality(value)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Resolution</Label>
            <RadioGroup
              value={videoQuality}
              onValueChange={(value) => setVideoQuality(value as VideoQuality)}
              className="grid grid-cols-2 gap-2"
            >
              {VIDEO_QUALITIES.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`vq-${option.value}`}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-3 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 hover:border-primary/50"
                >
                  <RadioGroupItem id={`vq-${option.value}`} value={option.value} className="sr-only" />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">{option.note}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {busy ? 'Exporting…' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
