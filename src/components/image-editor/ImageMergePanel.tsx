'use client';

import { Columns3, Combine, Grid2x2, Layers2, Loader2, Rows3 } from 'lucide-react';

import { FileUploader } from '@/components/shared/FileUploader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useImageEditor, loadImage } from '@/hooks/useImageEditor';
import type { MediaAsset, MergeLayout } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

const LAYOUTS: { value: MergeLayout; label: string; icon: typeof Columns3; note: string }[] = [
  { value: 'horizontal', label: 'Side by side', icon: Columns3, note: 'Matched heights' },
  { value: 'vertical', label: 'Stacked', icon: Rows3, note: 'Matched widths' },
  { value: 'grid', label: 'Grid', icon: Grid2x2, note: 'Letterboxed cells' },
  { value: 'overlay', label: 'Overlay', icon: Layers2, note: 'Free position' },
];

export function ImageMergePanel() {
  const { layers, addLayer, mergeLayout, setMergeLayout, isProcessing, setTool } =
    useImageEditorStore();
  const { mergeLayers } = useImageEditor();

  const visibleCount = layers.filter((layer) => layer.visible).length;

  /** Add an upload as a layer, sized from its real dimensions. */
  const onUploaded = async (asset: MediaAsset) => {
    let width = asset.width ?? 0;
    let height = asset.height ?? 0;

    // Cloudinary usually reports these; decode as a fallback if it did not.
    if (!width || !height) {
      try {
        const img = await loadImage(asset.secureUrl);
        width = img.naturalWidth;
        height = img.naturalHeight;
      } catch {
        width = 512;
        height = 512;
      }
    }

    // Cascade each new layer so stacked overlays are not perfectly hidden.
    const offset = layers.length * 40;

    addLayer({
      name: asset.originalFilename ?? `Layer ${layers.length + 1}`,
      src: asset.secureUrl,
      x: offset,
      y: offset,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
    });

    // Jump straight into arranging: the select tool drives the on-canvas
    // drag/resize/delete interactions.
    setTool('select');
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Combine className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Merge images</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Add images, then arrange them right on the canvas: click to select, drag to move,
          corner handles to resize/rotate, <kbd>Delete</kbd> to remove. Flatten when happy.
        </p>
      </div>

      <FileUploader
        resourceType="image"
        multiple
        compact
        label="Add images"
        onUploaded={onUploaded}
      />

      <Separator />

      <div className="space-y-2">
        <Label>Arrangement</Label>
        <RadioGroup
          value={mergeLayout}
          onValueChange={(value) => setMergeLayout(value as MergeLayout)}
          className="grid grid-cols-2 gap-2"
        >
          {LAYOUTS.map((layout) => (
            <Label
              key={layout.value}
              htmlFor={`layout-${layout.value}`}
              className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-border p-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 hover:border-primary/50"
            >
              <RadioGroupItem id={`layout-${layout.value}`} value={layout.value} className="sr-only" />
              <layout.icon
                className={cn(
                  'h-4 w-4',
                  mergeLayout === layout.value ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span className="text-xs font-medium">{layout.label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{layout.note}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <Button
        className="w-full"
        onClick={() => mergeLayers(mergeLayout)}
        disabled={visibleCount < 2 || isProcessing}
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : <Combine />}
        {visibleCount < 2
          ? 'Add at least two images'
          : `Merge ${visibleCount} images`}
      </Button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The merged result replaces what is on the canvas, so you can keep editing it with the AI
        tools afterwards.
      </p>
    </div>
  );
}
