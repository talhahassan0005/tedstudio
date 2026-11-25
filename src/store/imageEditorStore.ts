import { create } from 'zustand';

import {
  DEFAULT_FILTERS,
  type AspectRatio,
  type CropRect,
  type Filters,
  type ImageLayer,
  type ImageTool,
  type MaskStroke,
  type MediaAsset,
  type MergeLayout,
} from '@/lib/types';
import { uid } from '@/lib/utils';

interface ImageEditorState {
  // --- source ---
  asset: MediaAsset | null;
  /** Dashboard project ID for the currently open asset — reused on Save so edits update instead of duplicate. */
  projectId: string | null;
  /** What the canvas currently renders — the AI result once one exists. */
  workingSrc: string | null;
  /** Kept so the before/after toggle always has something to compare to. */
  originalSrc: string | null;
  naturalSize: { width: number; height: number };

  // --- viewport ---
  tool: ImageTool;
  zoom: number;
  stagePos: { x: number; y: number };

  // --- mask ---
  strokes: MaskStroke[];
  brushSize: number;
  isDrawing: boolean;

  // --- adjustments ---
  filters: Filters;

  // --- crop ---
  cropRect: CropRect | null;
  aspectRatio: AspectRatio;

  // --- layers (merge/join) ---
  layers: ImageLayer[];
  selectedLayerId: string | null;
  mergeLayout: MergeLayout;

  // --- AI ---
  isProcessing: boolean;
  processingLabel: string;
  progress: number | null;
  lastResult: string | null;
  showBefore: boolean;
  prompt: string;
  history: string[];

  // --- actions ---
  setAsset: (asset: MediaAsset | null) => void;
  setProjectId: (id: string | null) => void;
  setWorkingSrc: (src: string | null) => void;
  setNaturalSize: (size: { width: number; height: number }) => void;

  setTool: (tool: ImageTool) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (delta: number) => void;
  resetView: () => void;
  setStagePos: (pos: { x: number; y: number }) => void;

  startStroke: (point: { x: number; y: number }, mode: 'brush' | 'eraser') => void;
  extendStroke: (point: { x: number; y: number }) => void;
  endStroke: () => void;
  clearMask: () => void;
  undoStroke: () => void;
  setBrushSize: (size: number) => void;
  hasMask: () => boolean;

  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;

  setCropRect: (rect: CropRect | null) => void;
  setAspectRatio: (ratio: AspectRatio) => void;

  addLayer: (layer: Omit<ImageLayer, 'id'> & { id?: string }) => string;
  updateLayer: (id: string, patch: Partial<ImageLayer>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'up' | 'down') => void;
  selectLayer: (id: string | null) => void;
  setMergeLayout: (layout: MergeLayout) => void;
  clearLayers: () => void;

  setProcessing: (processing: boolean, label?: string) => void;
  setProgress: (progress: number | null) => void;
  applyResult: (src: string) => void;
  toggleShowBefore: () => void;
  setPrompt: (prompt: string) => void;
  undoHistory: () => void;
  reset: () => void;
}

const INITIAL = {
  asset: null,
  projectId: null,
  workingSrc: null,
  originalSrc: null,
  naturalSize: { width: 0, height: 0 },

  tool: 'brush' as ImageTool,
  zoom: 1,
  stagePos: { x: 0, y: 0 },

  strokes: [] as MaskStroke[],
  brushSize: 40,
  isDrawing: false,

  filters: { ...DEFAULT_FILTERS },

  cropRect: null,
  aspectRatio: 'free' as AspectRatio,

  layers: [] as ImageLayer[],
  selectedLayerId: null,
  mergeLayout: 'horizontal' as MergeLayout,

  isProcessing: false,
  processingLabel: '',
  progress: null,
  lastResult: null,
  showBefore: false,
  prompt: '',
  history: [] as string[],
};

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
  ...INITIAL,

  // --- source ---
  setAsset: (asset) =>
    set({
      asset,
      projectId: null,
      workingSrc: asset?.secureUrl ?? null,
      originalSrc: asset?.secureUrl ?? null,
      naturalSize:
        asset?.width && asset?.height
          ? { width: asset.width, height: asset.height }
          : { width: 0, height: 0 },
      strokes: [],
      filters: { ...DEFAULT_FILTERS },
      cropRect: null,
      lastResult: null,
      showBefore: false,
      history: [],
    }),

  setProjectId: (projectId) => set({ projectId }),
  setWorkingSrc: (src) => set({ workingSrc: src }),
  setNaturalSize: (naturalSize) => set({ naturalSize }),

  // --- viewport ---
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(8, Math.max(0.1, zoom)) }),
  zoomBy: (delta) => set((s) => ({ zoom: Math.min(8, Math.max(0.1, s.zoom + delta)) })),
  resetView: () => set({ zoom: 1, stagePos: { x: 0, y: 0 } }),
  setStagePos: (stagePos) => set({ stagePos }),

  // --- mask ---
  startStroke: (point, mode) =>
    set((s) => ({
      isDrawing: true,
      strokes: [
        ...s.strokes,
        { id: uid('stroke'), points: [point.x, point.y], brushSize: s.brushSize, mode },
      ],
    })),

  extendStroke: (point) =>
    set((s) => {
      if (!s.isDrawing || s.strokes.length === 0) return s;
      const strokes = s.strokes.slice();
      const last = strokes[strokes.length - 1];
      strokes[strokes.length - 1] = { ...last, points: [...last.points, point.x, point.y] };
      return { strokes };
    }),

  endStroke: () => set({ isDrawing: false }),
  clearMask: () => set({ strokes: [], isDrawing: false }),
  undoStroke: () => set((s) => ({ strokes: s.strokes.slice(0, -1) })),
  setBrushSize: (brushSize) => set({ brushSize: Math.min(300, Math.max(2, brushSize)) }),
  hasMask: () => get().strokes.some((stroke) => stroke.mode === 'brush'),

  // --- adjustments ---
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  // --- crop ---
  setCropRect: (cropRect) => set({ cropRect }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),

  // --- layers ---
  addLayer: (layer) => {
    const id = layer.id ?? uid('layer');
    set((s) => ({ layers: [...s.layers, { ...layer, id }], selectedLayerId: id }));
    return id;
  },

  updateLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    })),

  removeLayer: (id) =>
    set((s) => ({
      layers: s.layers.filter((layer) => layer.id !== id),
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),

  reorderLayer: (id, direction) =>
    set((s) => {
      const index = s.layers.findIndex((layer) => layer.id === id);
      if (index === -1) return s;
      const target = direction === 'up' ? index + 1 : index - 1;
      if (target < 0 || target >= s.layers.length) return s;
      const layers = s.layers.slice();
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { layers };
    }),

  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  setMergeLayout: (mergeLayout) => set({ mergeLayout }),
  clearLayers: () => set({ layers: [], selectedLayerId: null }),

  // --- AI ---
  setProcessing: (isProcessing, processingLabel = '') =>
    set({ isProcessing, processingLabel, progress: isProcessing ? 0 : null }),

  setProgress: (progress) => set({ progress }),

  applyResult: (src) =>
    set((s) => ({
      history: s.workingSrc ? [...s.history, s.workingSrc] : s.history,
      workingSrc: src,
      lastResult: src,
      strokes: [],
      showBefore: false,
      isProcessing: false,
      progress: null,
      processingLabel: '',
    })),

  toggleShowBefore: () => set((s) => ({ showBefore: !s.showBefore })),
  setPrompt: (prompt) => set({ prompt }),

  undoHistory: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      const history = s.history.slice();
      const previous = history.pop() as string;
      return { history, workingSrc: previous, lastResult: null, showBefore: false };
    }),

  reset: () => set({ ...INITIAL, filters: { ...DEFAULT_FILTERS } }),
}));
