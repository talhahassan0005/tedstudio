import { create } from 'zustand';

import type {
  AudioTrack,
  SlideshowImage,
  Transition,
  VideoClip,
  VideoQuality,
} from '@/lib/types';
import { clamp, uid } from '@/lib/utils';

export type VideoTab = 'clips' | 'trim' | 'music' | 'slideshow' | 'ai';

interface VideoEditorState {
  // --- clips ---
  clips: VideoClip[];
  activeClipId: string | null;

  // --- playback ---
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  volume: number;
  muted: boolean;

  // --- trim ---
  trimStart: number;
  trimEnd: number;

  // --- audio ---
  audio: AudioTrack | null;
  keepOriginalAudio: boolean;

  // --- slideshow ---
  slideshowImages: SlideshowImage[];
  durationPerImage: number;
  transition: Transition;

  // --- AI ---
  aiPrompt: string;
  maskDataUrl: string | null;
  frameTime: number;

  // --- output ---
  resultUrl: string | null;
  resultPublicId: string | null;
  quality: VideoQuality;

  // --- ui ---
  tab: VideoTab;
  isProcessing: boolean;
  processingLabel: string;
  progress: number | null;
  showBefore: boolean;

  // --- actions ---
  addClip: (
    clip: Omit<VideoClip, 'id' | 'trimStart' | 'trimEnd'> & {
      id?: string;
      trimStart?: number;
      trimEnd?: number;
    },
  ) => string;
  removeClip: (id: string) => void;
  reorderClips: (from: number, to: number) => void;
  moveClip: (id: string, direction: 'up' | 'down') => void;
  setActiveClip: (id: string | null) => void;
  updateClip: (id: string, patch: Partial<VideoClip>) => void;
  clearClips: () => void;
  activeClip: () => VideoClip | null;

  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;

  setTrim: (start: number, end: number) => void;
  setTrimStart: (start: number) => void;
  setTrimEnd: (end: number) => void;
  resetTrim: () => void;

  setAudio: (audio: AudioTrack | null) => void;
  setAudioVolume: (volume: number) => void;
  setKeepOriginalAudio: (keep: boolean) => void;

  addSlideshowImage: (
    image: Omit<SlideshowImage, 'id' | 'duration'> & { id?: string; duration?: number },
  ) => void;
  removeSlideshowImage: (id: string) => void;
  moveSlideshowImage: (id: string, direction: 'up' | 'down') => void;
  setSlideshowImageDuration: (id: string, duration: number) => void;
  setDurationPerImage: (duration: number) => void;
  setTransition: (transition: Transition) => void;
  clearSlideshow: () => void;

  setAiPrompt: (prompt: string) => void;
  setMaskDataUrl: (mask: string | null) => void;
  setFrameTime: (time: number) => void;

  setResult: (url: string | null, publicId?: string | null) => void;
  setQuality: (quality: VideoQuality) => void;

  setTab: (tab: VideoTab) => void;
  setProcessing: (processing: boolean, label?: string) => void;
  setProgress: (progress: number | null) => void;
  toggleShowBefore: () => void;
  reset: () => void;
}

const INITIAL = {
  clips: [] as VideoClip[],
  activeClipId: null,

  currentTime: 0,
  isPlaying: false,
  duration: 0,
  volume: 1,
  muted: false,

  trimStart: 0,
  trimEnd: 0,

  audio: null,
  keepOriginalAudio: false,

  slideshowImages: [] as SlideshowImage[],
  durationPerImage: 2,
  transition: 'fade' as Transition,

  aiPrompt: '',
  maskDataUrl: null,
  frameTime: 0,

  resultUrl: null,
  resultPublicId: null,
  quality: '1080p' as VideoQuality,

  tab: 'ai' as VideoTab,
  isProcessing: false,
  processingLabel: '',
  progress: null,
  showBefore: false,
};

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
  ...INITIAL,

  // --- clips ---
  addClip: (clip) => {
    const id = clip.id ?? uid('clip');
    const full: VideoClip = {
      ...clip,
      id,
      // Default the trim window to the whole clip when the caller omits it.
      trimStart: clip.trimStart ?? 0,
      trimEnd: clip.trimEnd ?? clip.duration,
    };
    set((s) => {
      const isFirst = s.clips.length === 0;
      return {
        clips: [...s.clips, full],
        activeClipId: isFirst ? id : s.activeClipId,
        // Seed the trim window and timeline from the first clip added.
        duration: isFirst ? full.duration : s.duration,
        trimStart: isFirst ? 0 : s.trimStart,
        trimEnd: isFirst ? full.duration : s.trimEnd,
      };
    });
    return id;
  },

  removeClip: (id) =>
    set((s) => {
      const clips = s.clips.filter((clip) => clip.id !== id);
      const activeClipId = s.activeClipId === id ? (clips[0]?.id ?? null) : s.activeClipId;
      const active = clips.find((clip) => clip.id === activeClipId) ?? null;
      return {
        clips,
        activeClipId,
        duration: active?.duration ?? 0,
        trimStart: active?.trimStart ?? 0,
        trimEnd: active?.trimEnd ?? active?.duration ?? 0,
        currentTime: 0,
      };
    }),

  reorderClips: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.clips.length || to >= s.clips.length) {
        return s;
      }
      const clips = s.clips.slice();
      const [moved] = clips.splice(from, 1);
      clips.splice(to, 0, moved);
      return { clips };
    }),

  moveClip: (id, direction) => {
    const { clips, reorderClips } = get();
    const index = clips.findIndex((clip) => clip.id === id);
    if (index === -1) return;
    reorderClips(index, direction === 'up' ? index - 1 : index + 1);
  },

  setActiveClip: (id) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === id) ?? null;
      return {
        activeClipId: id,
        currentTime: 0,
        isPlaying: false,
        duration: clip?.duration ?? 0,
        trimStart: clip?.trimStart ?? 0,
        trimEnd: clip?.trimEnd ?? clip?.duration ?? 0,
      };
    }),

  updateClip: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
    })),

  clearClips: () =>
    set({ clips: [], activeClipId: null, duration: 0, trimStart: 0, trimEnd: 0, currentTime: 0 }),

  activeClip: () => {
    const { clips, activeClipId } = get();
    return clips.find((clip) => clip.id === activeClipId) ?? null;
  },

  // --- playback ---
  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setDuration: (duration) =>
    set((s) => ({
      duration,
      // A freshly loaded <video> is the first reliable duration we get.
      trimEnd: s.trimEnd > 0 ? Math.min(s.trimEnd, duration) : duration,
    })),
  setVolume: (volume) => set({ volume: clamp(volume, 0, 1), muted: volume === 0 }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),

  // --- trim ---
  setTrim: (start, end) =>
    set((s) => ({
      trimStart: clamp(start, 0, Math.max(0, end - 0.1)),
      trimEnd: clamp(end, start + 0.1, s.duration || end),
    })),

  setTrimStart: (start) =>
    set((s) => ({ trimStart: clamp(start, 0, Math.max(0, s.trimEnd - 0.1)) })),

  setTrimEnd: (end) =>
    set((s) => ({ trimEnd: clamp(end, s.trimStart + 0.1, s.duration || end) })),

  resetTrim: () => set((s) => ({ trimStart: 0, trimEnd: s.duration })),

  // --- audio ---
  setAudio: (audio) => set({ audio }),
  setAudioVolume: (volume) =>
    set((s) => ({ audio: s.audio ? { ...s.audio, volume: clamp(volume, 0, 1) } : null })),
  setKeepOriginalAudio: (keepOriginalAudio) => set({ keepOriginalAudio }),

  // --- slideshow ---
  addSlideshowImage: (image) =>
    set((s) => ({
      slideshowImages: [
        ...s.slideshowImages,
        {
          ...image,
          id: image.id ?? uid('slide'),
          // Fall back to the panel-wide default when no per-image value is given.
          duration: image.duration ?? s.durationPerImage,
        },
      ],
    })),

  removeSlideshowImage: (id) =>
    set((s) => ({ slideshowImages: s.slideshowImages.filter((img) => img.id !== id) })),

  moveSlideshowImage: (id, direction) =>
    set((s) => {
      const index = s.slideshowImages.findIndex((img) => img.id === id);
      if (index === -1) return s;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= s.slideshowImages.length) return s;
      const images = s.slideshowImages.slice();
      [images[index], images[target]] = [images[target], images[index]];
      return { slideshowImages: images };
    }),

  setSlideshowImageDuration: (id, duration) =>
    set((s) => ({
      slideshowImages: s.slideshowImages.map((img) =>
        img.id === id ? { ...img, duration: clamp(duration, 0.5, 30) } : img,
      ),
    })),

  setDurationPerImage: (durationPerImage) =>
    set({ durationPerImage: clamp(durationPerImage, 0.5, 30) }),

  setTransition: (transition) => set({ transition }),
  clearSlideshow: () => set({ slideshowImages: [] }),

  // --- AI ---
  setAiPrompt: (aiPrompt) => set({ aiPrompt }),
  setMaskDataUrl: (maskDataUrl) => set({ maskDataUrl }),
  setFrameTime: (frameTime) => set({ frameTime }),

  // --- output ---
  setResult: (resultUrl, resultPublicId = null) =>
    set({
      resultUrl,
      resultPublicId,
      isProcessing: false,
      progress: null,
      processingLabel: '',
      showBefore: false,
    }),

  setQuality: (quality) => set({ quality }),

  // --- ui ---
  setTab: (tab) => set({ tab }),
  setProcessing: (isProcessing, processingLabel = '') =>
    set({ isProcessing, processingLabel, progress: isProcessing ? 0 : null }),
  setProgress: (progress) => set({ progress }),
  toggleShowBefore: () => set((s) => ({ showBefore: !s.showBefore })),
  reset: () => set({ ...INITIAL }),
}));
