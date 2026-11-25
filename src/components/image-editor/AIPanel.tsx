'use client';

import { Eraser, Loader2, Scissors, Sparkles, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useImageEditor } from '@/hooks/useImageEditor';
import { useImageEditorStore } from '@/store/imageEditorStore';

const PROMPT_IDEAS = [
  'a vase of fresh tulips',
  'a wooden bench',
  'soft golden sunlight',
  'a sleeping cat',
];

export function AIPanel() {
  const { workingSrc, prompt, setPrompt, strokes, isProcessing, processingLabel, setTool } =
    useImageEditorStore();
  const { runInpaint, runErase, runRemoveBackground } = useImageEditor();

  const hasMask = strokes.some((stroke) => stroke.mode === 'brush');
  const disabled = !workingSrc || isProcessing;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI tools</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paint a mask on the canvas first, then pick an action.
        </p>
      </div>

      {/* Mask status — the commonest reason an action is greyed out. */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-slate-900/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Mask</span>
        {hasMask ? (
          <Badge variant="success">{strokes.length} strokes</Badge>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setTool('brush')}
            disabled={!workingSrc}
          >
            Start painting
          </Button>
        )}
      </div>

      <Separator />

      {/* Inpaint */}
      <div className="space-y-2">
        <Label htmlFor="ai-prompt">Add something (inpaint)</Label>
        <Textarea
          id="ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe what should appear in the masked area…"
          disabled={disabled}
          rows={3}
        />

        <div className="flex flex-wrap gap-1">
          {PROMPT_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setPrompt(idea)}
              disabled={disabled}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {idea}
            </button>
          ))}
        </div>

        <Button
          className="w-full"
          onClick={runInpaint}
          disabled={disabled || !prompt.trim()}
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 />}
          Inpaint
        </Button>
      </div>

      <Separator />

      {/* Erase + remove background */}
      <div className="space-y-2">
        <Label>One-click</Label>

        <Button
          variant="outline"
          className="w-full"
          onClick={runErase}
          disabled={disabled}
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <Eraser />}
          Erase masked object
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={runRemoveBackground}
          disabled={disabled}
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <Scissors />}
          Remove background
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Erase needs a mask; background removal takes the whole image (export as PNG to keep
          transparency). Without a Clipdrop key everything falls back to free models —
          background removal in your browser, inpaint/erase on Cloudflare&rsquo;s daily free
          quota at up to 1024px.
        </p>
      </div>

      {isProcessing && processingLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">{processingLabel}</span>
        </div>
      )}
    </div>
  );
}
