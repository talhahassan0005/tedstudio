'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import { saveProject } from '@/lib/projects';
import type {
  EraseRequest,
  ExportFormat,
  Filters,
  ImageAiResponse,
  InpaintRequest,
  MaskStroke,
  MergeLayout,
  RemoveBgRequest,
  UploadResponse,
} from '@/lib/types';
import { downloadUrl, errorMessage, parseJsonResponse, postJson, uid } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

/**
 * Rasterise the stroke list into the black/white mask the Clipdrop endpoints
 * expect: white = act here, black = leave alone.
 *
 * Strokes are stored in the image's own pixel space (the canvas converts
 * pointer coords before recording them), so the mask always comes out at the
 * source resolution regardless of zoom or display size.
 */
export function buildMaskDataUrl(
  strokes: MaskStroke[],
  size: { width: number; height: number },
): string | null {
  if (!size.width || !size.height) return null;
  if (!strokes.some((stroke) => stroke.mode === 'brush')) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;

    // The eraser carves back out of the white region.
    ctx.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = stroke.brushSize;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0], stroke.points[1]);

    if (stroke.points.length === 2) {
      // A single tap: draw a dot rather than a zero-length line.
      ctx.arc(stroke.points[0], stroke.points[1], stroke.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 2; i < stroke.points.length; i += 2) {
        ctx.lineTo(stroke.points[i], stroke.points[i + 1]);
      }
      ctx.stroke();
    }
  }

  // Erased areas are transparent at this point; flatten them back to black.
  const flat = document.createElement('canvas');
  flat.width = size.width;
  flat.height = size.height;
  const flatCtx = flat.getContext('2d');
  if (!flatCtx) return canvas.toDataURL('image/png');

  flatCtx.fillStyle = '#000000';
  flatCtx.fillRect(0, 0, size.width, size.height);
  flatCtx.drawImage(canvas, 0, 0);

  return flat.toDataURL('image/png');
}

/** CSS filter string matching the adjustment sliders, for live preview. */
export function filtersToCss(filters: Filters): string {
  const parts = [
    `brightness(${(1 + filters.brightness).toFixed(3)})`,
    `contrast(${(1 + filters.contrast / 100).toFixed(3)})`,
    `saturate(${(1 + filters.saturation / 2).toFixed(3)})`,
  ];
  if (filters.blur > 0) parts.push(`blur(${(filters.blur / 10).toFixed(2)}px)`);
  return parts.join(' ');
}

/**
 * Sharpen in place with a 3×3 convolution, blended by `amount` (0..1).
 *
 * CSS has no sharpen filter, so this is the only place it can happen — it runs
 * when the adjustments are baked in and on export, not in the live preview.
 */
export function applySharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0 || width < 3 || height < 3) return;

  const source = ctx.getImageData(0, 0, width, height);
  const src = source.data;
  const out = new Uint8ClampedArray(src);

  // Standard sharpening kernel; `amount` blends it against the original.
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;

      // Alpha is left untouched — convolving it fringes cut-out edges.
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            sum += src[((y + ky) * width + (x + kx)) * 4 + channel] * kernel[k];
            k += 1;
          }
        }
        const original = src[index + channel];
        out[index + channel] = original + (sum - original) * amount;
      }
    }
  }

  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}

/**
 * Load an image and resolve once decoded. `crossOrigin` is required or the
 * canvas is tainted and `toDataURL` throws — Cloudinary serves the right CORS
 * headers for this.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/**
 * Prepare image + mask for the free Cloudflare inpainting model.
 *
 * CF takes raw file bytes as JSON integer arrays (~4× the size on the wire),
 * so everything is downscaled to ≤1024px and the image goes as JPEG. The
 * mask is re-rasterised from the strokes at the same scale so both line up
 * pixel-for-pixel.
 */
async function scaleForFreeModel(
  src: string,
  strokes: MaskStroke[],
  naturalSize: { width: number; height: number },
  maxDim = 1024,
): Promise<{ image: string; mask: string; width: number; height: number; downscaled: boolean }> {
  const img = await loadImage(src);
  const width = img.naturalWidth || naturalSize.width;
  const height = img.naturalHeight || naturalSize.height;
  const scale = Math.min(1, maxDim / Math.max(width, height));

  // Stable Diffusion requires dimensions in multiples of 8 — anything else
  // is a 500 from the API (those were the intermittent failures).
  const w = Math.max(8, Math.floor((width * scale) / 8) * 8);
  const h = Math.max(8, Math.floor((height * scale) / 8) * 8);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = w;
  imageCanvas.height = h;
  const imageCtx = imageCanvas.getContext('2d');
  if (!imageCtx) throw new Error('Canvas is unavailable');
  // JPEG has no alpha: without this, a background-removed image flattens to
  // BLACK and the model paints into a void. White is a sane neutral.
  imageCtx.fillStyle = '#ffffff';
  imageCtx.fillRect(0, 0, w, h);
  imageCtx.drawImage(img, 0, 0, w, h);

  const fullMask = buildMaskDataUrl(strokes, { width, height });
  if (!fullMask) throw new Error('Paint a mask first');

  const maskImg = await loadImage(fullMask);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) throw new Error('Canvas is unavailable');
  maskCtx.drawImage(maskImg, 0, 0, w, h);

  return {
    image: imageCanvas.toDataURL('image/jpeg', 0.9),
    mask: maskCanvas.toDataURL('image/png'),
    width: w,
    height: h,
    downscaled: scale < 1,
  };
}

/**
 * Paste ONLY the masked region of the model's output onto the untouched
 * original, at the original's full resolution.
 *
 * SD-style inpainting runs the whole frame through its VAE, so even the
 * unmasked areas come back subtly repainted — faces smear, textures go
 * plastic. Compositing through the mask means the model touches nothing
 * outside the painted strokes, and the result keeps the source resolution.
 */
async function compositeMaskedResult(
  originalSrc: string,
  resultSrc: string,
  strokes: MaskStroke[],
  naturalSize: { width: number; height: number },
): Promise<string> {
  const original = await loadImage(originalSrc);
  const result = await loadImage(resultSrc);

  const width = original.naturalWidth || naturalSize.width;
  const height = original.naturalHeight || naturalSize.height;

  const maskUrl = buildMaskDataUrl(strokes, { width, height });
  if (!maskUrl) return resultSrc;
  const maskImg = await loadImage(maskUrl);

  // Patch = model output scaled up, kept only where the mask is white.
  const patch = document.createElement('canvas');
  patch.width = width;
  patch.height = height;
  const patchCtx = patch.getContext('2d');
  if (!patchCtx) return resultSrc;

  patchCtx.drawImage(result, 0, 0, width, height);

  // Turn the black/white mask into an alpha mask (white -> opaque).
  const alpha = document.createElement('canvas');
  alpha.width = width;
  alpha.height = height;
  const alphaCtx = alpha.getContext('2d');
  if (!alphaCtx) return resultSrc;
  alphaCtx.drawImage(maskImg, 0, 0, width, height);

  const data = alphaCtx.getImageData(0, 0, width, height);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i + 3] = data.data[i]; // alpha := red channel
  }
  alphaCtx.putImageData(data, 0, 0);

  patchCtx.globalCompositeOperation = 'destination-in';
  patchCtx.drawImage(alpha, 0, 0);

  // Original underneath, model's patch on top.
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return resultSrc;
  outCtx.drawImage(original, 0, 0, width, height);
  outCtx.drawImage(patch, 0, 0);

  return out.toDataURL('image/png');
}

/** Download the current canvas as PNG - the no-storage fallback for Save. */
async function exportFallbackDownload(src: string, filters: Filters): Promise<void> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.filter = filtersToCss(filters);
  ctx.drawImage(img, 0, 0);
  ctx.filter = 'none';
  applySharpen(ctx, canvas.width, canvas.height, filters.sharpen);
  await downloadUrl(canvas.toDataURL('image/png'), `ted-studio-${Date.now()}.png`);
}

export function useImageEditor() {
  // Destructured rather than used as `store.x` so every callback below can
  // declare honest dependencies (Zustand's action identities are stable).
  const {
    asset,
    projectId,
    setProjectId,
    workingSrc,
    setWorkingSrc,
    naturalSize,
    strokes,
    prompt,
    filters,
    layers,
    mergeLayout,
    cropRect,
    setProcessing,
    applyResult,
    resetFilters,
    setCropRect,
    setNaturalSize,
    setTool,
  } = useImageEditorStore();

  // -------------------------------------------------------------------------
  // AI operations
  // -------------------------------------------------------------------------

  const runInpaint = useCallback(async () => {
    if (!workingSrc) return void toast.error('Upload an image first');
    if (!prompt.trim()) return void toast.error('Describe what to add in the prompt box');

    const mask = buildMaskDataUrl(strokes, naturalSize);
    if (!mask) return void toast.error('Paint over the area you want to change first');

    setProcessing(true, 'Inpainting…');
    try {
      const result = await postJson<ImageAiResponse, InpaintRequest>('/api/ai/inpaint', {
        imageUrl: workingSrc,
        maskBase64: mask,
        prompt: prompt.trim(),
      });
      applyResult(result.image);
      toast.success('Inpainting complete');
      return;
    } catch (error) {
      if (!errorMessage(error).includes('CLIPDROP_API_KEY')) {
        setProcessing(false);
        toast.error('Inpainting failed', { description: errorMessage(error) });
        return;
      }
    }

    // No Clipdrop key — fall back to the free Cloudflare model (≤1024px).
    try {
      setProcessing(true, 'Inpainting on the free model…');
      const scaled = await scaleForFreeModel(workingSrc, strokes, naturalSize);
      const result = await postJson<ImageAiResponse>('/api/ai/inpaint-free', {
        imageBase64: scaled.image,
        maskBase64: scaled.mask,
        width: scaled.width,
        height: scaled.height,
        prompt: prompt.trim(),
      });
      // Keep every unmasked pixel from the original, at full resolution.
      const merged = await compositeMaskedResult(
        workingSrc,
        result.image,
        strokes,
        naturalSize,
      );
      applyResult(merged);
      toast.success('Inpainted (free model)');
    } catch (error) {
      setProcessing(false);
      toast.error('Inpainting failed', { description: errorMessage(error) });
    }
  }, [workingSrc, prompt, strokes, naturalSize, setProcessing, applyResult]);

  const runErase = useCallback(async () => {
    if (!workingSrc) return void toast.error('Upload an image first');

    const mask = buildMaskDataUrl(strokes, naturalSize);
    if (!mask) return void toast.error('Paint over the object you want to erase first');

    setProcessing(true, 'Erasing object…');
    try {
      const result = await postJson<ImageAiResponse, EraseRequest>('/api/ai/erase', {
        imageUrl: workingSrc,
        maskBase64: mask,
      });
      applyResult(result.image);
      toast.success('Object erased');
      return;
    } catch (error) {
      if (!errorMessage(error).includes('CLIPDROP_API_KEY')) {
        setProcessing(false);
        toast.error('Erase failed', { description: errorMessage(error) });
        return;
      }
    }

    // Free fallback: erase = inpainting the masked area with "background".
    try {
      setProcessing(true, 'Erasing on the free model…');
      const scaled = await scaleForFreeModel(workingSrc, strokes, naturalSize);
      const result = await postJson<ImageAiResponse>('/api/ai/inpaint-free', {
        imageBase64: scaled.image,
        maskBase64: scaled.mask,
        width: scaled.width,
        height: scaled.height,
        prompt: 'empty background, nothing, clean scene matching the surroundings',
      });
      const merged = await compositeMaskedResult(
        workingSrc,
        result.image,
        strokes,
        naturalSize,
      );
      applyResult(merged);
      toast.success('Object erased (free model)');
    } catch (error) {
      setProcessing(false);
      toast.error('Erase failed', { description: errorMessage(error) });
    }
  }, [workingSrc, strokes, naturalSize, setProcessing, applyResult]);

  const runRemoveBackground = useCallback(async () => {
    if (!workingSrc) return void toast.error('Upload an image first');

    setProcessing(true, 'Removing background…');
    try {
      const result = await postJson<ImageAiResponse, RemoveBgRequest>('/api/ai/remove-bg', {
        imageUrl: workingSrc,
      });
      applyResult(result.image);
      toast.success('Background removed — export as PNG to keep transparency');
      return;
    } catch (error) {
      // No Clipdrop key? Fall back to the free in-browser model instead of
      // giving up — zero cost, runs entirely on the user's machine.
      if (!errorMessage(error).includes('CLIPDROP_API_KEY')) {
        setProcessing(false);
        toast.error('Background removal failed', { description: errorMessage(error) });
        return;
      }
    }

    try {
      // The model download happens once and then lives in the browser cache;
      // only talk about downloading on that first run.
      const warmedKey = 'mediastudio:bg-model-ready';
      let warmed = false;
      try {
        warmed = window.localStorage.getItem(warmedKey) === '1';
      } catch {
        /* private mode — treat as first run */
      }

      setProcessing(
        true,
        warmed
          ? 'Removing background (free, in-browser)…'
          : 'Downloading the free model (one time, ~40–80 MB)…',
      );
      if (!warmed) {
        toast.info('Downloading the free model', {
          description: 'This happens only once — future runs start instantly.',
        });
      }

      // Loaded from the CDN at runtime, NOT bundled: Next 14's webpack cannot
      // parse onnxruntime-web's minified ESM, so `webpackIgnore` leaves this
      // as a native browser import(). The library fetches its WASM and model
      // from the same CDN by itself.
      const mod = await import(
        /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm'
      );

      const { useImageEditorStore } = await import('@/store/imageEditorStore');
      const blob = await mod.removeBackground(workingSrc, {
        progress: (_key, current, total) => {
          if (total > 0) {
            useImageEditorStore.getState().setProgress((current / total) * 100);
          }
        },
      });

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the result'));
        reader.readAsDataURL(blob);
      });

      applyResult(dataUrl);
      try {
        window.localStorage.setItem(warmedKey, '1');
      } catch {
        /* ignore */
      }
      toast.success('Background removed (free, in-browser) — export as PNG for transparency');
    } catch (error) {
      setProcessing(false);
      toast.error('Background removal failed', { description: errorMessage(error) });
    }
  }, [workingSrc, setProcessing, applyResult]);

  // -------------------------------------------------------------------------
  // Local (canvas) operations
  // -------------------------------------------------------------------------

  /** Bake the adjustment sliders into the pixels. */
  const applyFilters = useCallback(async () => {
    if (!workingSrc) return void toast.error('Upload an image first');

    setProcessing(true, 'Applying adjustments…');
    try {
      const img = await loadImage(workingSrc);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');

      ctx.filter = filtersToCss(filters);
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      applySharpen(ctx, canvas.width, canvas.height, filters.sharpen);

      applyResult(canvas.toDataURL('image/png'));
      resetFilters();
      toast.success('Adjustments baked in');
    } catch (error) {
      setProcessing(false);
      toast.error('Could not apply adjustments', { description: errorMessage(error) });
    }
  }, [workingSrc, filters, setProcessing, applyResult, resetFilters]);

  /** Crop to the current selection rectangle (in image pixel coords). */
  const applyCrop = useCallback(async () => {
    const rect = cropRect;
    if (!workingSrc) return void toast.error('Upload an image first');
    if (!rect || rect.width < 2 || rect.height < 2) {
      return void toast.error('Drag out a crop area first');
    }

    setProcessing(true, 'Cropping…');
    try {
      const img = await loadImage(workingSrc);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');

      ctx.drawImage(
        img,
        Math.round(rect.x),
        Math.round(rect.y),
        Math.round(rect.width),
        Math.round(rect.height),
        0,
        0,
        Math.round(rect.width),
        Math.round(rect.height),
      );

      applyResult(canvas.toDataURL('image/png'));
      setCropRect(null);
      setNaturalSize({ width: canvas.width, height: canvas.height });
      setTool('select');
      toast.success('Cropped');
    } catch (error) {
      setProcessing(false);
      toast.error('Crop failed', { description: errorMessage(error) });
    }
  }, [
    workingSrc,
    cropRect,
    setProcessing,
    applyResult,
    setCropRect,
    setNaturalSize,
    setTool,
  ]);

  /**
   * Flatten the layer list into a single image.
   * `horizontal`/`vertical`/`grid` tile the sources; `overlay` respects each
   * layer's own x/y/size/opacity as set on the canvas.
   */
  const mergeLayers = useCallback(
    async (layout: MergeLayout = mergeLayout) => {
      const visible = layers.filter((layer) => layer.visible);
      if (visible.length < 2) {
        toast.error('Add at least two images to merge');
        return null;
      }

      setProcessing(true, 'Merging images…');
      try {
        const images = await Promise.all(visible.map((layer) => loadImage(layer.src)));

        let width: number;
        let height: number;

        if (layout === 'horizontal') {
          height = Math.max(...images.map((img) => img.naturalHeight));
          width = images.reduce(
            (sum, img) => sum + img.naturalWidth * (height / img.naturalHeight),
            0,
          );
        } else if (layout === 'vertical') {
          width = Math.max(...images.map((img) => img.naturalWidth));
          height = images.reduce(
            (sum, img) => sum + img.naturalHeight * (width / img.naturalWidth),
            0,
          );
        } else if (layout === 'grid') {
          const cols = Math.ceil(Math.sqrt(images.length));
          const rows = Math.ceil(images.length / cols);
          const cell = {
            width: Math.max(...images.map((img) => img.naturalWidth)),
            height: Math.max(...images.map((img) => img.naturalHeight)),
          };
          width = cell.width * cols;
          height = cell.height * rows;
        } else {
          width = Math.max(...visible.map((layer) => layer.x + layer.width));
          height = Math.max(...visible.map((layer) => layer.y + layer.height));
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable');

        if (layout === 'horizontal') {
          let x = 0;
          images.forEach((img) => {
            const scale = canvas.height / img.naturalHeight;
            const w = img.naturalWidth * scale;
            ctx.drawImage(img, x, 0, w, canvas.height);
            x += w;
          });
        } else if (layout === 'vertical') {
          let y = 0;
          images.forEach((img) => {
            const scale = canvas.width / img.naturalWidth;
            const h = img.naturalHeight * scale;
            ctx.drawImage(img, 0, y, canvas.width, h);
            y += h;
          });
        } else if (layout === 'grid') {
          const cols = Math.ceil(Math.sqrt(images.length));
          const cellW = canvas.width / cols;
          const cellH = canvas.height / Math.ceil(images.length / cols);
          images.forEach((img, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            // Letterbox each cell so nothing is distorted.
            const scale = Math.min(cellW / img.naturalWidth, cellH / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            ctx.drawImage(
              img,
              col * cellW + (cellW - w) / 2,
              row * cellH + (cellH - h) / 2,
              w,
              h,
            );
          });
        } else {
          visible.forEach((layer, i) => {
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
            ctx.rotate((layer.rotation * Math.PI) / 180);
            ctx.drawImage(
              images[i],
              -layer.width / 2,
              -layer.height / 2,
              layer.width,
              layer.height,
            );
            ctx.restore();
          });
        }

        const merged = canvas.toDataURL('image/png');
        applyResult(merged);
        setNaturalSize({ width: canvas.width, height: canvas.height });
        toast.success(`${visible.length} images merged`);
        return merged;
      } catch (error) {
        setProcessing(false);
        toast.error('Merge failed', { description: errorMessage(error) });
        return null;
      }
    },
    [layers, mergeLayout, setProcessing, applyResult, setNaturalSize],
  );

  // -------------------------------------------------------------------------
  // Save (persist the edited result to the library + dashboard)
  // -------------------------------------------------------------------------

  const saveEdited = useCallback(async () => {
    if (!workingSrc) return void toast.error('Nothing to save yet');

    setProcessing(true, 'Saving\u2026');
    try {
      // Save exactly what the user sees: current pixels + live adjustments.
      const img = await loadImage(workingSrc);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.filter = filtersToCss(filters);
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      applySharpen(ctx, canvas.width, canvas.height, filters.sharpen);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Could not encode image'))),
          'image/png',
        );
      });

      const filename = `ted-studio-${Date.now()}.png`;
      const form = new FormData();
      form.append('file', new File([blob], filename, { type: 'image/png' }));
      form.append('resourceType', 'image');

      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const uploaded = await parseJsonResponse<UploadResponse>(res);

      // Point the editor at the hosted copy and record it on the dashboard.
      // Reuse the existing project ID (if set by generate/upload) so we update
      // rather than create a duplicate entry.
      setWorkingSrc(uploaded.secureUrl);
      const existingId = projectId ?? uid('proj');
      setProjectId(existingId);
      void saveProject({
        id: existingId,
        name: `Edited \u2014 ${asset?.originalFilename ?? 'image'}`,
        kind: 'image',
        thumbnailUrl: uploaded.secureUrl,
        publicId: uploaded.publicId,
      });

      setProcessing(false);
      const isOverwrite = Boolean(projectId);
      toast.success('Saved', {
        description: isOverwrite
          ? 'Changes saved — the existing project on your dashboard has been updated.'
          : 'Added to your dashboard and library.',
      });
    } catch (error) {
      setProcessing(false);
      const message = errorMessage(error);

      // No Cloudinary? Still honour "save": hand the file to the user.
      if (message.includes('Cloudinary is not configured')) {
        try {
          await exportFallbackDownload(workingSrc, filters);
          toast.info('Storage is not configured — downloaded the file instead', {
            description: 'Once Cloudinary keys are set, Save will store it in your library.',
          });
          return;
        } catch {
          /* fall through */
        }
      }
      toast.error('Save failed', { description: message });
    }
  }, [workingSrc, filters, asset, projectId, setProjectId, setWorkingSrc, setProcessing]);

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  const exportImage = useCallback(
    async (format: ExportFormat = 'png', quality = 0.92) => {
      if (!workingSrc) return void toast.error('Nothing to export yet');

      try {
        const img = await loadImage(workingSrc);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable');

        // JPG has no alpha — flatten onto white so transparency is not black.
        if (format === 'jpg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.filter = filtersToCss(filters);
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';
        applySharpen(ctx, canvas.width, canvas.height, filters.sharpen);

        const mime =
          format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        const dataUrl = canvas.toDataURL(mime, quality);

        await downloadUrl(dataUrl, `ted-studio-${Date.now()}.${format}`);
        toast.success(`Exported ${canvas.width}×${canvas.height} ${format.toUpperCase()}`);
      } catch (error) {
        toast.error('Export failed', { description: errorMessage(error) });
      }
    },
    [workingSrc, filters],
  );

  return {
    saveEdited,
    runInpaint,
    runErase,
    runRemoveBackground,
    applyFilters,
    applyCrop,
    mergeLayers,
    exportImage,
    buildMask: () => buildMaskDataUrl(strokes, naturalSize),
  };
}
