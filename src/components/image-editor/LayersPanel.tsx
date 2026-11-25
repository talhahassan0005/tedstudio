'use client';

import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

export function LayersPanel() {
  const {
    layers,
    selectedLayerId,
    selectLayer,
    updateLayer,
    removeLayer,
    reorderLayer,
    clearLayers,
  } = useImageEditorStore();

  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Layers</h2>
        </div>
        {layers.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={clearLayers}>
            Clear all
          </Button>
        )}
      </div>

      {layers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Add images in the Merge panel and they will appear here.
        </p>
      ) : (
        <>
          <ScrollArea className="max-h-64">
            {/* Topmost layer first, matching what the user sees. */}
            <div className="space-y-1 pr-2">
              {layers
                .slice()
                .reverse()
                .map((layer) => {
                  const active = layer.id === selectedLayerId;
                  return (
                    <div
                      key={layer.id}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors',
                        active
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-transparent hover:bg-accent/50',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectLayer(active ? null : layer.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-slate-950 bg-checkerboard">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={layer.src}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{layer.name}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {Math.round(layer.width)}×{Math.round(layer.height)}
                          </span>
                        </span>
                      </button>

                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                      >
                        {layer.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>

                      <div className="flex flex-col">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="h-3 w-5"
                          onClick={() => reorderLayer(layer.id, 'up')}
                          title="Move up"
                          aria-label="Move layer up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="h-3 w-5"
                          onClick={() => reorderLayer(layer.id, 'down')}
                          title="Move down"
                          aria-label="Move layer down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>

                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeLayer(layer.id)}
                        title="Delete layer"
                        aria-label="Delete layer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
            </div>
          </ScrollArea>

          {selected && (
            <>
              <Separator />
              <div className="space-y-3 rounded-lg border border-border bg-slate-900/40 p-3">
                <p className="truncate text-xs font-medium">{selected.name}</p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Opacity</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(selected.opacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[selected.opacity * 100]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([value]) =>
                      updateLayer(selected.id, { opacity: value / 100 })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Rotation</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(selected.rotation)}°
                    </span>
                  </div>
                  <Slider
                    value={[selected.rotation]}
                    min={-180}
                    max={180}
                    step={1}
                    onValueChange={([value]) => updateLayer(selected.id, { rotation: value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-muted-foreground">X</span>
                    <input
                      type="number"
                      value={Math.round(selected.x)}
                      onChange={(event) =>
                        updateLayer(selected.id, { x: Number(event.target.value) })
                      }
                      className="h-7 w-full rounded border border-input bg-transparent px-2 text-xs tabular-nums"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-muted-foreground">Y</span>
                    <input
                      type="number"
                      value={Math.round(selected.y)}
                      onChange={(event) =>
                        updateLayer(selected.id, { y: Number(event.target.value) })
                      }
                      className="h-7 w-full rounded border border-input bg-transparent px-2 text-xs tabular-nums"
                    />
                  </label>
                </div>

                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Position, rotation and opacity apply to the <strong>Overlay</strong> merge
                  layout. The tiled layouts ignore them.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
