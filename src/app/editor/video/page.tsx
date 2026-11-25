'use client';

import { useState } from 'react';
import { Clapperboard, Film, Music, RotateCcw, Scissors, Sparkles } from 'lucide-react';

import { Sidebar, type SidebarItem } from '@/components/layout/Sidebar';
import { ClipList } from '@/components/video-editor/ClipList';
import { ImageToVideoPanel } from '@/components/video-editor/ImageToVideoPanel';
import { MusicPanel } from '@/components/video-editor/MusicPanel';
import { VideoAIPanel } from '@/components/video-editor/VideoAIPanel';
import { VideoPreview } from '@/components/video-editor/VideoPreview';
import { VideoTimeline } from '@/components/video-editor/VideoTimeline';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ExportButton } from '@/components/shared/ExportButton';
import { LoadingOverlay } from '@/components/shared/LoadingOverlay';
import { QuotaBadge } from '@/components/shared/QuotaBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { useVideoEditorStore, type VideoTab } from '@/store/videoEditorStore';

const PANELS: SidebarItem[] = [
  { id: 'clips', label: 'Clips', icon: Film, hint: 'Upload, reorder, merge' },
  { id: 'trim', label: 'Trim', icon: Scissors, hint: 'Cut to a range' },
  { id: 'music', label: 'Music', icon: Music, hint: 'Add an audio track' },
  { id: 'slideshow', label: 'From images', icon: Clapperboard, hint: 'Stills to video' },
  { id: 'ai', label: 'AI Generate', icon: Sparkles, hint: 'Prompt → 1-minute video' },
];

export default function VideoEditorPage() {
  const [showingOriginal, setShowingOriginal] = useState(false);

  const {
    tab,
    setTab,
    clips,
    activeClipId,
    resultUrl,
    isProcessing,
    processingLabel,
    progress,
    setQuality,
    reset,
  } = useVideoEditorStore();

  const { exportAtQuality } = useVideoEditor();

  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? null;
  const originalUrl = activeClip?.url ?? null;
  // Default to showing the newest render, with a toggle back to the source.
  const previewUrl = showingOriginal ? originalUrl : (resultUrl ?? originalUrl);

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        items={PANELS}
        activeId={tab}
        onSelect={(id) => setTab(id as VideoTab)}
        title="Panels"
      />

      {/* Center: preview + timeline */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {activeClip?.name ?? 'Video editor'}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {clips.length === 0
                ? 'Write a prompt in the AI Generate panel'
                : `${clips.length} ${clips.length === 1 ? 'clip' : 'clips'} loaded`}
            </p>
          </div>

          <QuotaBadge kind="video" />

          <div className="flex items-center gap-2">
            {resultUrl && originalUrl && (
              <Button
                size="sm"
                variant={showingOriginal ? 'default' : 'outline'}
                onClick={() => setShowingOriginal((value) => !value)}
              >
                {showingOriginal ? 'Showing original' : 'Compare'}
              </Button>
            )}

            {resultUrl && <Badge variant="success">render ready</Badge>}

            {clips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} title="Start over">
                <RotateCcw />
                Reset
              </Button>
            )}

            <ExportButton
              kind="video"
              disabled={!previewUrl}
              onExportVideo={async (quality) => {
                setQuality(quality);
                await exportAtQuality();
              }}
            />
          </div>
        </div>

        <ErrorBoundary name="Preview">
          <VideoPreview
            src={previewUrl}
            className="min-h-[260px] flex-1"
            respectTrim={tab === 'trim'}
          />
        </ErrorBoundary>

        {tab === 'trim' && (
          <ErrorBoundary name="Timeline">
            <VideoTimeline />
          </ErrorBoundary>
        )}
      </section>

      {/* Right: panels. Fixed column on xl, bottom sheet below it. */}
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
              {tab === 'clips' && <ClipList />}
              {tab === 'trim' && <ClipList />}
              {tab === 'music' && <MusicPanel />}
              {tab === 'slideshow' && <ImageToVideoPanel />}
              {tab === 'ai' && <VideoAIPanel />}
            </ErrorBoundary>
          </div>
        </ScrollArea>
      </aside>

      <LoadingOverlay show={isProcessing} label={processingLabel} progress={progress} />
    </div>
  );
}
