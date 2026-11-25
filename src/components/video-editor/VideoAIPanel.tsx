'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brush, Camera, Eraser, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { errorMessage, postJson } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

/** Grab one frame from a video URL, at `atSecond`, as a data URL. */
async function captureFrame(
  url: string,
  atSecond: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;

    const fail = (message: string) => () => reject(new Error(message));

    video.onloadeddata = () => {
      // Seeking must wait until there is data, or Safari gives a black frame.
      video.currentTime = Math.min(atSecond, Math.max(0, (video.duration || 1) - 0.05));
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas is unavailable'));

      ctx.drawImage(video, 0, 0);
      try {
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        // A cross-origin video without CORS headers taints the canvas.
        reject(new Error('Cannot read frames from this video (CORS). Re-upload it to your own storage.'));
      }
    };

    video.onerror = fail('Could not load the video');
    video.src = url;
  });
}

export function VideoAIPanel() {
  const {
    aiPrompt,
    setAiPrompt,
    maskDataUrl,
    setMaskDataUrl,
    frameTime,
    setFrameTime,
    currentTime,
    duration,
    isProcessing,
    processingLabel,
  } = useVideoEditorStore();

  const { sourceUrl, eraseFromVideo, addToVideo, generateVideo, generateHybridVideo } = useVideoEditor();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null,
  );
  const [capturing, setCapturing] = useState(false);
  const [mode, setMode] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(32);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generationDuration, setGenerationDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [hybridTopic, setHybridTopic] = useState('');
  const [enhancing, setEnhancing] = useState<'hybrid' | 'clip' | null>(null);
  const drawingRef = useRef(false);

  const enhanceVideoPrompt = useCallback(async (kind: 'hybrid' | 'clip') => {
    const prompt = kind === 'hybrid' ? hybridTopic : generationPrompt;
    if (!prompt.trim()) return toast.error('Write a prompt first');
    setEnhancing(kind);
    try {
      const result = await postJson<{ enhanced: string }, { prompt: string }>(
        '/api/ai/enhance-prompt',
        { prompt: prompt.trim() },
      );
      if (kind === 'hybrid') setHybridTopic(result.enhanced);
      else setGenerationPrompt(result.enhanced);
      toast.success('Prompt enhanced');
    } catch (error) {
      toast.error('Could not enhance prompt', { description: errorMessage(error) });
    } finally {
      setEnhancing(null);
    }
  }, [generationPrompt, hybridTopic]);

  // --- capture --------------------------------------------------------------
  const grabFrame = useCallback(async () => {
    if (!sourceUrl) return toast.error('Add a clip first');

    setCapturing(true);
    try {
      const captured = await captureFrame(sourceUrl, currentTime);
      setFrame(captured);
      setFrameTime(currentTime);
      setMaskDataUrl(null);
    } catch (error) {
      toast.error('Could not capture a frame', { description: errorMessage(error) });
    } finally {
      setCapturing(false);
    }
  }, [sourceUrl, currentTime, setFrameTime, setMaskDataUrl]);

  // Size the paint canvas to the captured frame's real pixels, so the exported
  // mask matches the video's dimensions without any rescaling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [frame]);

  // --- painting -------------------------------------------------------------
  const pointFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const paint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const point = pointFromEvent(event);
      if (!canvas || !ctx || !point) return;

      ctx.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over';
      ctx.fillStyle = 'rgba(244,63,94,1)';
      ctx.beginPath();
      // Scale the brush with the frame so it feels the same at any resolution.
      ctx.arc(point.x, point.y, (brushSize * canvas.width) / 640 / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [mode, brushSize, pointFromEvent],
  );

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setMaskDataUrl(null);
  }, [setMaskDataUrl]);

  /** Flatten the painted overlay into a black/white mask. */
  const commitMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return toast.error('Capture a frame first');

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;

    const ctx = out.getContext('2d');
    if (!ctx) return toast.error('Canvas is unavailable');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, out.width, out.height);

    // Anything painted becomes solid white; everything else stays black.
    const painted = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
    if (!painted) return toast.error('Canvas is unavailable');

    const mask = ctx.getImageData(0, 0, out.width, out.height);
    let any = false;
    for (let i = 0; i < painted.data.length; i += 4) {
      if (painted.data[i + 3] > 10) {
        mask.data[i] = 255;
        mask.data[i + 1] = 255;
        mask.data[i + 2] = 255;
        mask.data[i + 3] = 255;
        any = true;
      } else {
        mask.data[i + 3] = 255;
      }
    }

    if (!any) return toast.error('Paint over the object first');

    ctx.putImageData(mask, 0, 0);
    setMaskDataUrl(out.toDataURL('image/png'));
    toast.success('Mask saved');
  }, [frame, setMaskDataUrl]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Video AI</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Mark an object on one frame; the model propagates the change through the clip.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="hybrid-video-topic">Automatic 1-minute hybrid video</Label>
          <Badge variant="secondary">low cost</Badge>
        </div>
        <Textarea
          id="hybrid-video-topic"
          value={hybridTopic}
          onChange={(event) => setHybridTopic(event.target.value)}
          placeholder="Topic or story, e.g. How solar energy powers a modern home…"
          rows={3}
          disabled={isProcessing}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void enhanceVideoPrompt('hybrid')}
          disabled={!hybridTopic.trim() || isProcessing || enhancing !== null}
        >
          {enhancing === 'hybrid' ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Enhance topic with AI
        </Button>
        <div className="flex gap-2">
          <select
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}
            disabled={isProcessing}
          >
            <option value="9:16">TikTok 9:16</option>
            <option value="16:9">YouTube 16:9</option>
            <option value="1:1">Square 1:1</option>
          </select>
          <Button
            className="flex-1"
            size="sm"
            onClick={() => generateHybridVideo({ topic: hybridTopic.trim(), aspectRatio })}
            disabled={!hybridTopic.trim() || isProcessing}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Create 1 min
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">AI-enhanced plan · 8 free Cloudflare images · 1 paid 5s Kling clip · 480p MP4</p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label htmlFor="kling-video-prompt">Generate a new AI clip</Label>
        <Textarea
          id="kling-video-prompt"
          value={generationPrompt}
          onChange={(event) => setGenerationPrompt(event.target.value)}
          placeholder="Describe the scene, subject and camera movement…"
          rows={3}
          disabled={isProcessing}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void enhanceVideoPrompt('clip')}
          disabled={!generationPrompt.trim() || isProcessing || enhancing !== null}
        >
          {enhancing === 'clip' ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Enhance prompt with AI
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            Duration
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={generationDuration}
              onChange={(event) => setGenerationDuration(Number(event.target.value))}
              disabled={isProcessing}
            >
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Format
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}
              disabled={isProcessing}
            >
              <option value="9:16">TikTok 9:16</option>
              <option value="16:9">YouTube 16:9</option>
              <option value="1:1">Square 1:1</option>
            </select>
          </label>
        </div>
        <Button
          className="w-full"
          size="sm"
          onClick={() => generateVideo({
            prompt: generationPrompt.trim(),
            duration: generationDuration,
            aspectRatio,
          })}
          disabled={!generationPrompt.trim() || isProcessing}
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Generate with Kling
        </Button>
        <p className="text-[11px] text-muted-foreground">Kling 4.0 Flash · 720p · paid API credits</p>
      </div>

      <Separator />

      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={grabFrame}
        disabled={!sourceUrl || capturing || isProcessing}
      >
        {capturing ? <Loader2 className="animate-spin" /> : <Camera />}
        {frame ? `Re-capture at ${currentTime.toFixed(1)}s` : 'Capture current frame'}
      </Button>

      {frame && (
        <>
          <div className="relative overflow-hidden rounded-lg border border-border bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame.dataUrl} alt="Captured frame" className="block w-full" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full cursor-crosshair opacity-50 touch-none"
              onPointerDown={(event) => {
                drawingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                paint(event);
              }}
              onPointerMove={(event) => {
                if (drawingRef.current) paint(event);
              }}
              onPointerUp={(event) => {
                drawingRef.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerLeave={() => {
                drawingRef.current = false;
              }}
            />
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] tabular-nums">
              {frameTime.toFixed(2)}s
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant={mode === 'brush' ? 'default' : 'ghost'}
              onClick={() => setMode('brush')}
              aria-label="Brush"
              title="Brush"
            >
              <Brush />
            </Button>
            <Button
              size="icon-sm"
              variant={mode === 'eraser' ? 'default' : 'ghost'}
              onClick={() => setMode('eraser')}
              aria-label="Eraser"
              title="Eraser"
            >
              <Eraser />
            </Button>
            <Slider
              value={[brushSize]}
              min={6}
              max={120}
              step={2}
              onValueChange={([value]) => setBrushSize(value)}
              className="mx-2 flex-1"
              aria-label="Brush size"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={clearMask}
              aria-label="Clear mask"
              title="Clear mask"
            >
              <Trash2 />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={commitMask}>
              Save mask
            </Button>
            {maskDataUrl && <Badge variant="success">mask ready</Badge>}
          </div>

          <Separator />

          <Button
            className="w-full"
            size="sm"
            onClick={eraseFromVideo}
            disabled={!maskDataUrl || isProcessing}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Eraser />}
            Erase from video
          </Button>

          <div className="space-y-2">
            <Label htmlFor="video-ai-prompt">Add something (experimental)</Label>
            <Textarea
              id="video-ai-prompt"
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder="Describe what to add to the clip…"
              rows={2}
              disabled={isProcessing}
            />
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={addToVideo}
              disabled={!aiPrompt.trim() || isProcessing}
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Generate
            </Button>
          </div>
        </>
      )}

      {isProcessing && processingLabel && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <span className="text-xs leading-relaxed text-muted-foreground">
            {processingLabel}
          </span>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        New clips use Kling. Erase and experimental editing still use Replicate and take minutes.
        {duration > 0 && ' Long clips cost more and may exceed your host’s request timeout.'}
      </p>
    </div>
  );
}
