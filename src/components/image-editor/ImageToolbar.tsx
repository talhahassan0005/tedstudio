'use client';

import { useState } from 'react';
import {
  Brush,
  Crop,
  Eraser,
  Eye,
  Maximize,
  MousePointer2,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ASPECT_RATIOS, type ImageTool } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';
import { useImageEditor } from '@/hooks/useImageEditor';

const TOOLS: { id: ImageTool; label: string; icon: typeof Brush }[] = [
  { id: 'select', label: 'Select / pan', icon: MousePointer2 },
  { id: 'brush', label: 'Mask brush', icon: Brush },
  { id: 'eraser', label: 'Mask eraser', icon: Eraser },
  { id: 'crop', label: 'Crop', icon: Crop },
];

export function ImageToolbar() {
  const {
    tool,
    setTool,
    brushSize,
    setBrushSize,
    zoom,
    zoomBy,
    resetView,
    strokes,
    clearMask,
    undoStroke,
    workingSrc,
    history,
    undoHistory,
    showBefore,
    toggleShowBefore,
    originalSrc,
    cropRect,
    aspectRatio,
    setAspectRatio,
    selectedLayerId,
    removeLayer,
    reset,
  } = useImageEditorStore();

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  // One trash icon, three jobs - whichever is relevant right now.
  const trashLabel = selectedLayerId
    ? 'Delete selected layer'
    : strokes.length > 0
      ? 'Clear the mask'
      : 'Remove image from canvas';

  const onTrash = () => {
    if (selectedLayerId) return removeLayer(selectedLayerId);
    if (strokes.length > 0) return clearMask();
    setConfirmRemoveOpen(true);
  };

  const { applyCrop } = useImageEditor();
  const disabled = !workingSrc;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-slate-900/60 p-2">
      {/* Tools */}
      <div className="flex items-center gap-1">
        {TOOLS.map((item) => (
          <Button
            key={item.id}
            size="icon-sm"
            variant={tool === item.id ? 'default' : 'ghost'}
            onClick={() => setTool(item.id)}
            disabled={disabled}
            title={item.label}
            aria-label={item.label}
            aria-pressed={tool === item.id}
          >
            <item.icon />
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Brush size — only meaningful for the mask tools */}
      {(tool === 'brush' || tool === 'eraser') && (
        <>
          <div className="flex min-w-[140px] items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Size
            </span>
            <Slider
              value={[brushSize]}
              min={4}
              max={200}
              step={2}
              onValueChange={([value]) => setBrushSize(value)}
              className="flex-1"
            />
            <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
              {brushSize}
            </span>
          </div>
          <Separator orientation="vertical" className="h-6" />
        </>
      )}

      {/* Crop controls */}
      {tool === 'crop' && (
        <>
          <div className="flex items-center gap-1">
            {ASPECT_RATIOS.map((ratio) => (
              <Button
                key={ratio.value}
                size="sm"
                variant={aspectRatio === ratio.value ? 'secondary' : 'ghost'}
                onClick={() => setAspectRatio(ratio.value)}
                className="px-2 text-[11px]"
              >
                {ratio.label}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => applyCrop()}
            disabled={!cropRect || cropRect.width < 2}
          >
            Apply crop
          </Button>
          <Separator orientation="vertical" className="h-6" />
        </>
      )}

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => zoomBy(-0.15)}
          disabled={disabled}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut />
        </Button>
        <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => zoomBy(0.15)}
          disabled={disabled}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={resetView}
          disabled={disabled}
          title="Fit to screen"
          aria-label="Fit to screen"
        >
          <Maximize />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Mask / history */}
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={undoStroke}
          disabled={strokes.length === 0}
          title="Undo last stroke"
          aria-label="Undo last stroke"
        >
          <Undo2 />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onTrash}
          disabled={disabled}
          title={trashLabel}
          aria-label={trashLabel}
        >
          <Trash2 />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={undoHistory}
          disabled={history.length === 0}
          title="Undo last edit"
          aria-label="Undo last edit"
        >
          <Redo2 className="rotate-180" />
        </Button>
      </div>

      {/* Before/after */}
      <Button
        size="sm"
        variant={showBefore ? 'default' : 'ghost'}
        onClick={toggleShowBefore}
        disabled={!originalSrc || originalSrc === workingSrc}
        className={cn('ml-auto', !originalSrc && 'hidden')}
        title="Hold to compare with the original"
      >
        <Eye />
        {showBefore ? 'Original' : 'Compare'}
      </Button>

      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Remove image from canvas?"
        description="Any unsaved edits will be lost. Use Save or Export first if you want to keep them."
        confirmLabel="Remove"
        destructive
        onConfirm={reset}
      />
    </div>
  );
}
