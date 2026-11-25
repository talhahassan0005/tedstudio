'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Loader2 } from 'lucide-react';

import { filtersToCss, loadImage } from '@/hooks/useImageEditor';
import { cn, fitContain } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

export interface ImageEditorCanvasProps {
  className?: string;
}

/**
 * Konva stage holding the source image, the mask overlay and the crop
 * rectangle.
 *
 * Coordinate spaces, which are the thing to keep straight here:
 *   - stage coords: what Konva reports from pointer events
 *   - image coords: pixels in the source image
 * Strokes and the crop rect are both stored in *image* coords, so the exported
 * mask is always full resolution no matter the zoom or window size.
 */
export function ImageEditorCanvas({ className }: ImageEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number } | null>(null);

  const {
    workingSrc,
    originalSrc,
    showBefore,
    naturalSize,
    tool,
    zoom,
    stagePos,
    strokes,
    brushSize,
    filters,
    cropRect,
    aspectRatio,
    isProcessing,
    processingLabel,
    setNaturalSize,
    startStroke,
    extendStroke,
    endStroke,
    setStagePos,
    setZoom,
    setCropRect,
    layers,
    selectedLayerId,
    selectLayer,
    updateLayer,
    removeLayer,
  } = useImageEditorStore();

  const displayedSrc = showBefore && originalSrc ? originalSrc : workingSrc;

  // --- load the bitmap -----------------------------------------------------
  useEffect(() => {
    if (!displayedSrc) {
      setImage(null);
      return;
    }
    let cancelled = false;

    loadImage(displayedSrc)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        // Trust the decoded bitmap over whatever the upload response claimed.
        if (!showBefore) {
          setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        }
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [displayedSrc, showBefore, setNaturalSize]);

  // --- interactive layers (merge workflow) ---------------------------------
  // Each layer floats above the base image: click to select, drag to move,
  // transformer handles to resize/rotate, Delete key to remove.
  const [layerImages, setLayerImages] = useState<Record<string, HTMLImageElement>>({});
  const layerNodeRefs = useRef<Map<string, Konva.Image>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    let cancelled = false;
    for (const layer of layers) {
      if (layerImages[layer.id]) continue;
      loadImage(layer.src)
        .then((img) => {
          if (cancelled) return;
          setLayerImages((previous) =>
            previous[layer.id] ? previous : { ...previous, [layer.id]: img },
          );
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [layers, layerImages]);

  // Attach the transformer to whichever layer is selected.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node =
      tool === 'select' && selectedLayerId
        ? layerNodeRefs.current.get(selectedLayerId)
        : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerId, tool, layers, layerImages]);

  // Delete / Backspace removes the selected layer — unless typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (selectedLayerId) {
        event.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLayerId, removeLayer]);

  // --- track the container size -------------------------------------------
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    setBox({ width: element.clientWidth, height: element.clientHeight });

    return () => observer.disconnect();
  }, []);

  // --- fit the image into the viewport ------------------------------------
  const layout = useMemo(() => {
    const source = {
      width: naturalSize.width || image?.naturalWidth || 0,
      height: naturalSize.height || image?.naturalHeight || 0,
    };
    if (!source.width || !box.width) {
      return { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 };
    }

    const padding = 32;
    const fitted = fitContain(source, {
      width: Math.max(1, box.width - padding),
      height: Math.max(1, box.height - padding),
    });

    return {
      ...fitted,
      offsetX: (box.width - fitted.width) / 2,
      offsetY: (box.height - fitted.height) / 2,
    };
  }, [naturalSize, image, box]);

  /** Stage point -> image pixel. */
  const toImageCoords = useCallback(
    (point: { x: number; y: number }) => ({
      x: (point.x - layout.offsetX) / (layout.scale * zoom),
      y: (point.y - layout.offsetY) / (layout.scale * zoom),
    }),
    [layout, zoom],
  );

  const pointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    // Undo the stage's own pan before converting.
    return { x: pos.x - stagePos.x, y: pos.y - stagePos.y };
  }, [stagePos]);

  // --- pointer handling ----------------------------------------------------
  const onPointerDown = useCallback(() => {
    if (!image) return;
    const raw = pointerPosition();
    if (!raw) return;
    const point = toImageCoords(raw);

    if (tool === 'brush' || tool === 'eraser') {
      startStroke(point, tool === 'eraser' ? 'eraser' : 'brush');
      return;
    }

    if (tool === 'crop') {
      setCropDraft(point);
      setCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
    }
  }, [image, pointerPosition, toImageCoords, tool, startStroke, setCropRect]);

  const onPointerMove = useCallback(() => {
    if (!image) return;
    const raw = pointerPosition();
    if (!raw) return;
    const point = toImageCoords(raw);

    if (tool === 'brush' || tool === 'eraser') {
      extendStroke(point);
      return;
    }

    if (tool === 'crop' && cropDraft) {
      let width = point.x - cropDraft.x;
      let height = point.y - cropDraft.y;

      // Lock the drag to the chosen ratio, keeping the larger dimension.
      const ratio =
        aspectRatio === '1:1'
          ? 1
          : aspectRatio === '4:3'
            ? 4 / 3
            : aspectRatio === '16:9'
              ? 16 / 9
              : aspectRatio === '3:4'
                ? 3 / 4
                : aspectRatio === '9:16'
                  ? 9 / 16
                  : null;

      if (ratio) {
        const magnitude = Math.max(Math.abs(width), Math.abs(height) * ratio);
        width = Math.sign(width || 1) * magnitude;
        height = Math.sign(height || 1) * (magnitude / ratio);
      }

      setCropRect({
        x: Math.max(0, Math.min(cropDraft.x, cropDraft.x + width)),
        y: Math.max(0, Math.min(cropDraft.y, cropDraft.y + height)),
        width: Math.min(Math.abs(width), naturalSize.width),
        height: Math.min(Math.abs(height), naturalSize.height),
      });
    }
  }, [
    image,
    pointerPosition,
    toImageCoords,
    tool,
    extendStroke,
    cropDraft,
    aspectRatio,
    naturalSize,
    setCropRect,
  ]);

  const onPointerUp = useCallback(() => {
    endStroke();
    setCropDraft(null);
  }, [endStroke]);

  /** Ctrl/⌘ + wheel zooms; a plain wheel scrolls the page as usual. */
  const onWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      if (!event.evt.ctrlKey && !event.evt.metaKey) return;
      event.evt.preventDefault();
      setZoom(zoom * (event.evt.deltaY > 0 ? 0.92 : 1.08));
    },
    [zoom, setZoom],
  );

  const drawScale = layout.scale * zoom;
  const isDrawTool = tool === 'brush' || tool === 'eraser';

  if (!displayedSrc) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'relative flex items-center justify-center rounded-lg border border-dashed border-border bg-slate-950/50',
          className,
        )}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              {processingLabel || 'Processing…'}
            </p>
            <p className="text-xs text-muted-foreground">This may take a moment</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Upload an image to start editing</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden rounded-lg bg-slate-950 bg-checkerboard', className)}
      style={{ cursor: isDrawTool ? 'crosshair' : tool === 'crop' ? 'crosshair' : 'grab' }}
    >
      {/*
        The adjustment sliders preview as a CSS filter on the stage wrapper.
        Konva's own filters need a cached node and a full redraw per keystroke,
        which stutters badly on large images; this is instant, and
        `applyFilters()` bakes the identical values into the pixels. The mask
        overlay is inside the filtered element too, but it is only a
        translucent guide, so that is cosmetically irrelevant.
      */}
      <div
        className="absolute inset-0"
        style={{ filter: showBefore ? undefined : filtersToCss(filters) }}
      >
      <Stage
        ref={stageRef}
        width={box.width}
        height={box.height}
        x={stagePos.x}
        y={stagePos.y}
        draggable={tool === 'select' || tool === 'zoom'}
        onDragEnd={(event) => setStagePos({ x: event.target.x(), y: event.target.y() })}
        onWheel={onWheel}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        onClick={(event) => {
          // Click on empty space (the stage itself) deselects the layer.
          if (tool === 'select' && event.target === event.target.getStage()) {
            selectLayer(null);
          }
        }}
        onTap={(event) => {
          if (tool === 'select' && event.target === event.target.getStage()) {
            selectLayer(null);
          }
        }}
      >
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              x={layout.offsetX}
              y={layout.offsetY}
              width={layout.width * zoom}
              height={layout.height * zoom}
              listening={false}
            />
          )}
        </Layer>

        {/* Floating layers (merge workflow): select, drag, resize, rotate. */}
        {layers.length > 0 && !showBefore && (
          <Layer>
            <Group
              x={layout.offsetX}
              y={layout.offsetY}
              scaleX={drawScale}
              scaleY={drawScale}
            >
              {layers
                .filter((layer) => layer.visible && layerImages[layer.id])
                .map((layer) => (
                  <KonvaImage
                    key={layer.id}
                    ref={(node) => {
                      if (node) layerNodeRefs.current.set(layer.id, node);
                      else layerNodeRefs.current.delete(layer.id);
                    }}
                    image={layerImages[layer.id]}
                    // x/y at the CENTER with matching offsets, so rotation
                    // spins around the middle instead of the top-left corner.
                    x={layer.x + layer.width / 2}
                    y={layer.y + layer.height / 2}
                    offsetX={layer.width / 2}
                    offsetY={layer.height / 2}
                    width={layer.width}
                    height={layer.height}
                    rotation={layer.rotation}
                    opacity={layer.opacity}
                    draggable={tool === 'select'}
                    listening={tool === 'select'}
                    onClick={() => selectLayer(layer.id)}
                    onTap={() => selectLayer(layer.id)}
                    onDragStart={() => selectLayer(layer.id)}
                    onDragEnd={(event) => {
                      updateLayer(layer.id, {
                        x: event.target.x() - layer.width / 2,
                        y: event.target.y() - layer.height / 2,
                      });
                    }}
                    onTransformEnd={(event) => {
                      const node = event.target as Konva.Image;
                      const width = Math.max(10, layer.width * node.scaleX());
                      const height = Math.max(10, layer.height * node.scaleY());
                      // Bake the transformer's scale into width/height so the
                      // stored geometry stays plain numbers.
                      node.scaleX(1);
                      node.scaleY(1);
                      updateLayer(layer.id, {
                        width,
                        height,
                        rotation: node.rotation(),
                        x: node.x() - width / 2,
                        y: node.y() - height / 2,
                      });
                    }}
                  />
                ))}

              <Transformer
                ref={transformerRef}
                rotateEnabled
                keepRatio={false}
                borderStroke="#38bdf8"
                anchorStroke="#38bdf8"
                anchorFill="#0f172a"
                anchorSize={9}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
                }
              />
            </Group>
          </Layer>
        )}

        {/* Mask overlay — translucent red so the image stays readable. */}
        <Layer listening={false} opacity={0.45}>
          {!showBefore &&
            strokes.map((stroke) => (
              <Line
                key={stroke.id}
                points={stroke.points.flatMap((value, index) =>
                  index % 2 === 0
                    ? [value * drawScale + layout.offsetX]
                    : [value * drawScale + layout.offsetY],
                )}
                stroke={stroke.mode === 'eraser' ? '#0f172a' : '#f43f5e'}
                strokeWidth={stroke.brushSize * drawScale}
                lineCap="round"
                lineJoin="round"
                tension={0.3}
                globalCompositeOperation={
                  stroke.mode === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            ))}
        </Layer>

        {/* Crop selection */}
        {tool === 'crop' && cropRect && (
          <Layer listening={false}>
            <Rect
              x={cropRect.x * drawScale + layout.offsetX}
              y={cropRect.y * drawScale + layout.offsetY}
              width={cropRect.width * drawScale}
              height={cropRect.height * drawScale}
              stroke="#38bdf8"
              strokeWidth={2}
              dash={[6, 4]}
              fill="rgba(56,189,248,0.12)"
            />
          </Layer>
        )}
      </Stage>
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1.5 text-[11px]">
        <span className="rounded-md bg-slate-950/80 px-2 py-1 tabular-nums text-muted-foreground">
          {naturalSize.width}×{naturalSize.height}
        </span>
        <span className="rounded-md bg-slate-950/80 px-2 py-1 tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        {isDrawTool && (
          <span className="rounded-md bg-slate-950/80 px-2 py-1 tabular-nums text-muted-foreground">
            brush {brushSize}px
          </span>
        )}
      </div>

      {showBefore && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
          Showing original
        </span>
      )}

      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-950/75 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {processingLabel || 'Processing…'}
          </p>
          <p className="text-xs text-muted-foreground">This may take a moment</p>
        </div>
      )}
    </div>
  );
}
