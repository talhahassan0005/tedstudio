'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  Combine,
  ImagePlus,
  Layers,
  Loader2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

import { Sidebar, type SidebarItem } from '@/components/layout/Sidebar';
import { AIPanel } from '@/components/image-editor/AIPanel';
import { FiltersPanel } from '@/components/image-editor/FiltersPanel';
import { GeneratePanel } from '@/components/image-editor/GeneratePanel';
import { ImageMergePanel } from '@/components/image-editor/ImageMergePanel';
import { ImageToolbar } from '@/components/image-editor/ImageToolbar';
import { LayersPanel } from '@/components/image-editor/LayersPanel';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ExportButton } from '@/components/shared/ExportButton';
import { FileUploader } from '@/components/shared/FileUploader';
import { LoadingOverlay } from '@/components/shared/LoadingOverlay';
import { QuotaBadge } from '@/components/shared/QuotaBadge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useImageEditor } from '@/hooks/useImageEditor';
import { saveProject } from '@/lib/projects';
import type { MediaAsset } from '@/lib/types';
import { uid } from '@/lib/utils';
import { useImageEditorStore } from '@/store/imageEditorStore';

/**
 * Konva touches `window` and `canvas` while building its stage, so it cannot
 * be server-rendered. `ssr: false` keeps it out of the server bundle entirely.
 */
const ImageEditorCanvas = dynamic(
  () => import('@/components/image-editor/ImageEditorCanvas').then((m) => m.ImageEditorCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-lg border border-border bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ),
  },
);

type PanelId = 'generate' | 'ai' | 'adjust' | 'merge' | 'layers';

const PANELS: SidebarItem[] = [
  { id: 'generate', label: 'Generate', icon: ImagePlus, hint: 'Text to image' },
  { id: 'ai', label: 'AI tools', icon: Sparkles, hint: 'Inpaint, erase, cut out' },
  { id: 'adjust', label: 'Adjustments', icon: SlidersHorizontal, hint: 'Brightness, contrast' },
  { id: 'merge', label: 'Merge', icon: Combine, hint: 'Join several images' },
  { id: 'layers', label: 'Layers', icon: Layers, hint: 'Reorder and toggle' },
];

function ImageEditorContent() {
  const [panel, setPanel] = useState<PanelId>('ai');
  const searchParams = useSearchParams();

  const { asset, workingSrc, setAsset, setProjectId, isProcessing, processingLabel, progress, reset } =
    useImageEditorStore();
  const { exportImage, saveEdited } = useImageEditor();

  // Open a project from the dashboard via URL params.
  useEffect(() => {
    const url = searchParams.get('url');
    const projId = searchParams.get('projectId');
    const name = searchParams.get('name');
    const publicId = searchParams.get('publicId');
    if (!url) return;

    const a: MediaAsset = {
      id: uid('asset'),
      publicId: publicId ?? '',
      url,
      secureUrl: url,
      format: 'png',
      resourceType: 'image',
      originalFilename: name ?? 'Project image',
      createdAt: new Date().toISOString(),
    };
    setAsset(a);
    if (projId) setProjectId(projId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUploaded = (uploaded: MediaAsset) => {
    setAsset(uploaded);
    if (uploaded.publicId) {
      void saveProject({
        id: uid('proj'),
        name: uploaded.originalFilename ?? 'Untitled image',
        kind: 'image',
        thumbnailUrl: uploaded.secureUrl,
        publicId: uploaded.publicId,
      });
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        items={PANELS}
        activeId={panel}
        onSelect={(id) => setPanel(id as PanelId)}
        title="Panels"
      />

      {/* Center: canvas */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {asset?.originalFilename ?? 'Image editor'}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Ctrl/⌘ + scroll to zoom · drag with the select tool to pan
            </p>
          </div>

          <QuotaBadge />

          <div className="flex items-center gap-2">
            {workingSrc && (
              <Button variant="ghost" size="sm" onClick={reset} title="Start over">
                <RotateCcw />
                Reset
              </Button>
            )}
            {workingSrc && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveEdited()}
                disabled={isProcessing}
                title="Save the edited image to your library and dashboard"
              >
                <Save />
                Save
              </Button>
            )}
            <ExportButton
              kind="image"
              disabled={!workingSrc}
              onExportImage={(format, quality) => exportImage(format, quality)}
            />
          </div>
        </div>

        <ImageToolbar />

        <ErrorBoundary name="Canvas">
          {workingSrc ? (
            <ImageEditorCanvas className="min-h-[320px] flex-1" />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-md">
                <FileUploader
                  resourceType="image"
                  onUploaded={onUploaded}
                  label="Drop an image to start"
                  hint="PNG, JPG, WebP or AVIF — up to 200 MB"
                />
                <button
                  type="button"
                  onClick={() => setPanel('generate')}
                  className="link-underline mx-auto mt-4 block text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  …or generate one from a prompt instead
                </button>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </section>

      {/*
        Right-hand properties panel. On xl it is a fixed-width column; below
        that it becomes a bottom sheet so every control stays reachable on a
        tablet or phone. Rendered once either way, so panel state and DOM ids
        are never duplicated.
      */}
      <aside
        className={
          'shrink-0 border-border bg-slate-900/40 ' +
          'fixed inset-x-0 bottom-0 z-20 max-h-[45vh] overflow-y-auto border-t ' +
          'xl:static xl:inset-auto xl:max-h-none xl:w-80 xl:overflow-hidden xl:border-l xl:border-t-0'
        }
      >
        <ScrollArea className="h-full">
          <div className="p-4 pb-20 xl:pb-4">
            <ErrorBoundary name="Panel">
              {panel === 'generate' && <GeneratePanel />}
              {panel === 'ai' && <AIPanel />}
              {panel === 'adjust' && <FiltersPanel />}
              {panel === 'merge' && <ImageMergePanel />}
              {panel === 'layers' && <LayersPanel />}
            </ErrorBoundary>
          </div>
        </ScrollArea>
      </aside>

      <LoadingOverlay show={isProcessing} label={processingLabel} progress={progress} />
    </div>
  );
}

export default function ImageEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <ImageEditorContent />
    </Suspense>
  );
}
