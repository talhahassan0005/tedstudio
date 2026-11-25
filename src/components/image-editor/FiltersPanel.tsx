'use client';

import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useImageEditor } from '@/hooks/useImageEditor';
import { DEFAULT_FILTERS, type Filters } from '@/lib/types';
import { useImageEditorStore } from '@/store/imageEditorStore';

interface Control {
  key: keyof Filters;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Turn the raw value into something readable. */
  format: (value: number) => string;
}

const CONTROLS: Control[] = [
  {
    key: 'brightness',
    label: 'Brightness',
    min: -0.6,
    max: 0.6,
    step: 0.01,
    format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`,
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: -60,
    max: 60,
    step: 1,
    format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`,
  },
  {
    key: 'saturation',
    label: 'Saturation',
    min: -2,
    max: 4,
    step: 0.05,
    format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 50)}`,
  },
  {
    key: 'blur',
    label: 'Blur',
    min: 0,
    max: 40,
    step: 1,
    format: (v) => (v === 0 ? 'off' : `${v}`),
  },
  {
    key: 'sharpen',
    label: 'Sharpen',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`),
  },
];

export function FiltersPanel() {
  const { filters, setFilter, resetFilters, workingSrc, isProcessing } = useImageEditorStore();
  const { applyFilters } = useImageEditor();

  const dirty = CONTROLS.some((control) => filters[control.key] !== DEFAULT_FILTERS[control.key]);
  const disabled = !workingSrc || isProcessing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Adjustments</h2>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={resetFilters}
          disabled={!dirty}
          title="Reset adjustments"
          aria-label="Reset adjustments"
        >
          <RotateCcw />
        </Button>
      </div>

      <div className="space-y-4">
        {CONTROLS.map((control) => (
          <div key={control.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{control.label}</label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {control.format(filters[control.key])}
              </span>
            </div>
            <Slider
              value={[filters[control.key]]}
              min={control.min}
              max={control.max}
              step={control.step}
              onValueChange={([value]) => setFilter(control.key, value)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <Separator />

      <Button className="w-full" onClick={applyFilters} disabled={disabled || !dirty} size="sm">
        <Check />
        Bake into image
      </Button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Sliders preview live and are applied on export. Baking rewrites the pixels, so AI tools
        and further edits see the adjusted version.
        {filters.sharpen > 0 && (
          <>
            {' '}
            <span className="text-amber-400">
              Sharpen is applied at export only — CSS has no sharpen filter, so it does not show
              in the live preview.
            </span>
          </>
        )}
      </p>
    </div>
  );
}
