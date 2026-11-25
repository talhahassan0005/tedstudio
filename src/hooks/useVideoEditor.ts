'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import type {
  AddMusicRequest,
  CreateFromImagesRequest,
  GenerateVideoRequest,
  GenerateHybridVideoRequest,
  MergeRequest,
  TrimRequest,
  VideoAiRequest,
  VideoResponse,
} from '@/lib/types';
import { downloadUrl, errorMessage, postJson } from '@/lib/utils';
import { useVideoEditorStore } from '@/store/videoEditorStore';

export function useVideoEditor() {
  // Destructured rather than used as `store.x` so every callback below can
  // declare honest dependencies (Zustand's action identities are stable).
  const {
    clips,
    activeClipId,
    trimStart,
    trimEnd,
    audio,
    keepOriginalAudio,
    slideshowImages,
    durationPerImage,
    transition,
    maskDataUrl,
    aiPrompt,
    resultUrl,
    resultPublicId,
    quality,
    setProcessing,
    setResult,
    addClip,
  } = useVideoEditorStore();

  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? null;
  /** Operate on the newest render when there is one, else the selected clip. */
  const sourceUrl = resultUrl ?? activeClip?.url ?? null;

  // -------------------------------------------------------------------------
  // Trim
  // -------------------------------------------------------------------------

  const trim = useCallback(
    async (accurate = false) => {
      if (!sourceUrl) return void toast.error('Add a clip first');
      if (trimEnd <= trimStart) return void toast.error('Drag the handles to select a range');

      setProcessing(true, 'Trimming video…');
      try {
        const result = await postJson<VideoResponse, TrimRequest & { accurate: boolean }>(
          '/api/video/trim',
          { videoUrl: sourceUrl, startTime: trimStart, endTime: trimEnd, accurate },
        );
        setResult(result.videoUrl, result.publicId);
        toast.success('Trimmed', {
          description: `${(trimEnd - trimStart).toFixed(1)}s kept`,
        });
      } catch (error) {
        setProcessing(false);
        toast.error('Trim failed', { description: errorMessage(error) });
      }
    },
    [sourceUrl, trimStart, trimEnd, setProcessing, setResult],
  );

  // -------------------------------------------------------------------------
  // Merge
  // -------------------------------------------------------------------------

  const merge = useCallback(async () => {
    if (clips.length < 2) return void toast.error('Add at least two clips to merge');

    setProcessing(true, `Merging ${clips.length} clips…`);
    try {
      const result = await postJson<VideoResponse, MergeRequest>('/api/video/merge', {
        videoUrls: clips.map((clip) => clip.url),
      });
      setResult(result.videoUrl, result.publicId);
      toast.success(`${clips.length} clips merged`);
    } catch (error) {
      setProcessing(false);
      toast.error('Merge failed', { description: errorMessage(error) });
    }
  }, [clips, setProcessing, setResult]);

  // -------------------------------------------------------------------------
  // Slideshow
  // -------------------------------------------------------------------------

  const createFromImages = useCallback(async () => {
    const images = slideshowImages;
    if (images.length === 0) return void toast.error('Add some images first');

    setProcessing(true, `Building a video from ${images.length} images…`);
    try {
      const result = await postJson<VideoResponse, CreateFromImagesRequest>(
        '/api/video/create-from-images',
        {
          imageUrls: images.map((img) => img.url),
          durationPerImage,
          transition,
          outputName: 'slideshow',
        },
      );

      setResult(result.videoUrl, result.publicId);

      // Make the render available as a clip, so it can be trimmed or scored.
      addClip({
        name: 'Slideshow',
        url: result.videoUrl,
        publicId: result.publicId,
        duration: result.duration ?? images.length * durationPerImage,
        trimStart: 0,
        trimEnd: result.duration ?? images.length * durationPerImage,
      });

      toast.success('Video created from images');
    } catch (error) {
      setProcessing(false);
      toast.error('Could not create the video', { description: errorMessage(error) });
    }
  }, [slideshowImages, durationPerImage, transition, setProcessing, setResult, addClip]);

  // -------------------------------------------------------------------------
  // Music
  // -------------------------------------------------------------------------

  const addMusicTrack = useCallback(
    async (loopAudio = false) => {
      if (!sourceUrl) return void toast.error('Add a clip first');
      if (!audio) return void toast.error('Upload an audio track first');

      setProcessing(true, 'Mixing audio…');
      try {
        const result = await postJson<
          VideoResponse,
          AddMusicRequest & { keepOriginalAudio: boolean; loopAudio: boolean }
        >('/api/video/add-music', {
          videoUrl: sourceUrl,
          audioUrl: audio.url,
          volume: audio.volume,
          keepOriginalAudio,
          loopAudio,
        });
        setResult(result.videoUrl, result.publicId);
        toast.success('Music added');
      } catch (error) {
        setProcessing(false);
        toast.error('Could not add music', { description: errorMessage(error) });
      }
    },
    [sourceUrl, audio, keepOriginalAudio, setProcessing, setResult],
  );

  // -------------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------------

  const eraseFromVideo = useCallback(async () => {
    if (!sourceUrl) return void toast.error('Add a clip first');
    if (!maskDataUrl) return void toast.error('Draw over the object to remove first');

    setProcessing(true, 'Removing object from every frame — this takes a few minutes…');
    try {
      const result = await postJson<VideoResponse, VideoAiRequest>(
        '/api/video/erase-from-video',
        { videoUrl: sourceUrl, maskBase64: maskDataUrl },
      );
      setResult(result.videoUrl, result.publicId);
      window.dispatchEvent(new Event('quota:refresh'));
      toast.success('Object removed from the video');
    } catch (error) {
      setProcessing(false);
      toast.error('AI erase failed', { description: errorMessage(error) });
    }
  }, [sourceUrl, maskDataUrl, setProcessing, setResult]);

  const addToVideo = useCallback(async () => {
    if (!sourceUrl) return void toast.error('Add a clip first');
    if (!aiPrompt.trim()) return void toast.error('Describe what to add');

    setProcessing(true, 'Generating — this takes a few minutes…');
    try {
      const result = await postJson<VideoResponse, VideoAiRequest>('/api/video/add-to-video', {
        videoUrl: sourceUrl,
        prompt: aiPrompt.trim(),
        maskBase64: maskDataUrl ?? undefined,
      });
      setResult(result.videoUrl, result.publicId);
      window.dispatchEvent(new Event('quota:refresh'));
      toast.success('Done');
    } catch (error) {
      setProcessing(false);
      toast.error('AI generation failed', { description: errorMessage(error) });
    }
  }, [sourceUrl, aiPrompt, maskDataUrl, setProcessing, setResult]);

  const generateVideo = useCallback(async (request: GenerateVideoRequest) => {
    if (!request.prompt.trim()) return void toast.error('Describe the video first');
    setProcessing(true, 'Kling is generating your video — this can take a few minutes…');
    try {
      const result = await postJson<VideoResponse, GenerateVideoRequest>(
        '/api/video/generate',
        request,
      );
      setResult(result.videoUrl, result.publicId);
      addClip({
        name: 'Kling AI clip',
        url: result.videoUrl,
        publicId: result.publicId,
        duration: result.duration ?? request.duration,
      });
      window.dispatchEvent(new Event('quota:refresh'));
      toast.success('AI video generated');
    } catch (error) {
      setProcessing(false);
      toast.error('Video generation failed', { description: errorMessage(error) });
    }
  }, [addClip, setProcessing, setResult]);

  const generateHybridVideo = useCallback(async (request: GenerateHybridVideoRequest) => {
    if (!request.topic.trim()) return void toast.error('Enter a topic first');
    setProcessing(true, 'Planning scenes, generating Cloudflare images and one Kling clip…');
    try {
      const result = await postJson<VideoResponse, GenerateHybridVideoRequest>('/api/video/hybrid', request);
      setResult(result.videoUrl, result.publicId);
      addClip({ name: '1-minute hybrid AI video', url: result.videoUrl, publicId: result.publicId, duration: result.duration ?? 60 });
      window.dispatchEvent(new Event('quota:refresh'));
      toast.success('Hybrid video generated');
    } catch (error) {
      setProcessing(false);
      toast.error('Hybrid generation failed', { description: errorMessage(error) });
    }
  }, [addClip, setProcessing, setResult]);

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  const exportVideo = useCallback(async () => {
    const url = resultUrl ?? activeClip?.url;
    if (!url) return void toast.error('Nothing to export yet');

    try {
      toast.info('Preparing download…');
      await downloadUrl(url, `ted-studio-${Date.now()}.mp4`);
      toast.success('Downloaded');
    } catch (error) {
      toast.error('Export failed', { description: errorMessage(error) });
    }
  }, [resultUrl, activeClip?.url]);

  /**
   * Re-encode at the chosen quality before downloading.
   * Cloudinary can do this as a delivery transformation, so no extra FFmpeg
   * round-trip is needed.
   */
  const exportAtQuality = useCallback(async () => {
    const publicId = resultPublicId;
    const url = resultUrl ?? activeClip?.url;
    if (!url) return void toast.error('Nothing to export yet');

    const height = quality === '720p' ? 720 : 1080;

    // Insert a transformation segment into the delivery URL when we can.
    const transformed =
      publicId && url.includes('/upload/')
        ? url.replace('/upload/', `/upload/h_${height},c_scale,q_auto,f_mp4/`)
        : url;

    try {
      toast.info(`Preparing ${quality} download…`);
      await downloadUrl(transformed, `ted-studio-${quality}-${Date.now()}.mp4`);
      toast.success(`Downloaded ${quality}`);
    } catch (error) {
      toast.error('Export failed', { description: errorMessage(error) });
    }
  }, [resultUrl, resultPublicId, quality, activeClip?.url]);

  return {
    activeClip,
    sourceUrl,
    trim,
    merge,
    createFromImages,
    addMusicTrack,
    eraseFromVideo,
    addToVideo,
    generateVideo,
    generateHybridVideo,
    exportVideo,
    exportAtQuality,
  };
}
