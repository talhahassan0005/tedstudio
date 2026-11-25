'use client';

import { useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { saveProject } from '@/lib/projects';
import type { GenerateImageRequest, GenerateImageResponse, MediaAsset } from '@/lib/types';
import { errorMessage, postJson, uid } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

const PROMPT_IDEAS = [
  'product photo of a perfume bottle on wet stone, studio light',
  'cozy mountain cabin at dusk, warm windows, snowfall',
  'flat lay of fresh vegetables on a dark slate table',
  'minimal poster background, soft gradient dunes',
];

export function GeneratePanel() {
  const { setAsset, setProjectId, isProcessing, setProcessing } = useImageEditorStore();

  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState(4);
  const [lastResults, setLastResults] = useState<GenerateImageResponse[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const enhance = async () => {
    if (!prompt.trim()) return void toast.error('Write a prompt first to enhance it');

    setIsEnhancing(true);
    try {
      const res = await postJson<{ enhanced: string }, { prompt: string }>(
        '/api/ai/enhance-prompt',
        { prompt: prompt.trim() },
      );
      setPrompt(res.enhanced);
      toast.success('Prompt enhanced');
    } catch (error) {
      toast.error('Could not enhance prompt', { description: errorMessage(error) });
    } finally {
      setIsEnhancing(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim()) return void toast.error('Write a prompt first — describe the image you want');

    setProcessing(true, 'Generating image…');
    try {
      const result = await postJson<GenerateImageResponse, GenerateImageRequest>(
        '/api/ai/generate',
        { prompt: prompt.trim(), steps },
      );

      loadIntoEditor(result);
      setLastResults((previous) => [result, ...previous].slice(0, 6));
      window.dispatchEvent(new Event('quota:refresh'));
      toast.success('Image generated', {
        description: result.secureUrl
          ? 'Saved to your library — ready for AI editing.'
          : 'Not persisted (Cloudinary is not configured); you can still edit and export it.',
      });
    } catch (error) {
      setProcessing(false);
      toast.error('Generation failed', { description: errorMessage(error) });
    }
  };

  /** Put a generated result onto the canvas as a normal editable asset. */
  const loadIntoEditor = (result: GenerateImageResponse) => {
    const src = result.secureUrl ?? result.image;
    const name = `Generated — ${prompt.trim().slice(0, 40) || 'image'}`;

    const asset: MediaAsset = {
      id: uid('asset'),
      publicId: result.publicId ?? '',
      url: src,
      secureUrl: src,
      format: result.mimeType.split('/')[1] ?? 'png',
      resourceType: 'image',
      width: result.width,
      height: result.height,
      originalFilename: name,
      createdAt: new Date().toISOString(),
    };
    setAsset(asset);
    setProcessing(false);

    // History entry — fire and forget. Thumbnails only work with a real URL;
    // a multi-MB data URL has no business in the projects table.
    if (result.secureUrl) {
      const projId = uid('proj');
      setProjectId(projId);
      void saveProject({
        id: projId,
        name,
        kind: 'image',
        thumbnailUrl: result.secureUrl,
        publicId: result.publicId,
      });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Generate image</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Text-to-image on Cloudflare Workers AI — free daily quota, then the result lands on the
          canvas ready for erase/inpaint.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="generate-prompt">Prompt</Label>
          <button
            type="button"
            onClick={enhance}
            disabled={isProcessing || isEnhancing || !prompt.trim()}
            title="Let AI expand and improve your prompt"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
          >
            {isEnhancing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            {isEnhancing ? 'Enhancing…' : 'Enhance with AI'}
          </button>
        </div>
        <Textarea
          id="generate-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the image you want…"
          rows={4}
          disabled={isProcessing || isEnhancing}
        />

        <div className="flex flex-wrap gap-1">
          {PROMPT_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setPrompt(idea)}
              disabled={isProcessing || isEnhancing}
              className="rounded-md border border-border px-2 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {idea.length > 42 ? `${idea.slice(0, 42)}…` : idea}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Quality (steps)</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{steps} / 8</span>
        </div>
        <Slider
          value={[steps]}
          min={1}
          max={8}
          step={1}
          onValueChange={([value]) => setSteps(value)}
          disabled={isProcessing}
        />
        <p className="text-[10px] leading-tight text-muted-foreground">
          More steps = sharper detail but a bigger bite out of the free daily quota.
        </p>
      </div>

      <Button className="w-full" onClick={generate} disabled={isProcessing || isEnhancing || !prompt.trim()}>
        {isProcessing ? <Loader2 className="animate-spin" /> : <Sparkles />}
        Generate
      </Button>

      {lastResults.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label>This session</Label>
            <div className="grid grid-cols-3 gap-2">
              {lastResults.map((result, index) => (
                <button
                  key={result.publicId ?? index}
                  type="button"
                  onClick={() => loadIntoEditor(result)}
                  title="Load onto the canvas"
                  className="liftable aspect-square overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.secureUrl ?? result.image}
                    alt="Generated result"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Click a thumbnail to put it back on the canvas.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
