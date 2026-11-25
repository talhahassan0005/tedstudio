/**
 * Shared TypeScript contracts for MediaStudio.
 * Anything crossing the client <-> API boundary is declared here.
 */

// ---------------------------------------------------------------------------
// Media primitives
// ---------------------------------------------------------------------------

export type ResourceType = 'image' | 'video' | 'audio' | 'raw';

export interface MediaAsset {
  id: string;
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: ResourceType;
  width?: number;
  height?: number;
  /** Seconds. Present for video/audio. */
  duration?: number;
  bytes?: number;
  originalFilename?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ApiErrorBody {
  error: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadResponse {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: ResourceType;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
}

export interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

// ---------------------------------------------------------------------------
// Image AI
// ---------------------------------------------------------------------------

export interface InpaintRequest {
  imageUrl: string;
  /** PNG data URL or bare base64. White = region to regenerate. */
  maskBase64: string;
  prompt: string;
}

export interface EraseRequest {
  imageUrl: string;
  /** PNG data URL or bare base64. White = region to erase. */
  maskBase64: string;
}

export interface RemoveBgRequest {
  imageUrl: string;
}

export interface ImageAiResponse {
  /** `data:image/png;base64,...` — ready to drop into an <img> or Konva image. */
  image: string;
  mimeType: string;
  /** Credits left on the Clipdrop account, when the provider reports it. */
  remainingCredits?: number;
}

export interface GenerateImageRequest {
  prompt: string;
  /** Diffusion steps. FLUX schnell caps at 8; default 4. */
  steps?: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
}

export interface GenerateImageResponse {
  /** `data:image/...;base64,...` — always present. */
  image: string;
  mimeType: string;
  /** Set when the result was also persisted to Cloudinary. */
  secureUrl?: string;
  publicId?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Video operations
// ---------------------------------------------------------------------------

export type Transition = 'fade' | 'slide' | 'none';

export interface CreateFromImagesRequest {
  imageUrls: string[];
  /** Seconds each still is held on screen. */
  durationPerImage: number;
  transition: Transition;
  outputName: string;
}

export interface TrimRequest {
  videoUrl: string;
  startTime: number;
  endTime: number;
}

export interface MergeRequest {
  videoUrls: string[];
}

export interface AddMusicRequest {
  videoUrl: string;
  audioUrl: string;
  /** 0..1 */
  volume: number;
}

export interface VideoAiRequest {
  videoUrl: string;
  /** PNG data URL or bare base64 — the region to operate on. */
  maskBase64?: string;
  prompt?: string;
}

export interface GenerateVideoRequest {
  prompt: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

export interface GenerateHybridVideoRequest {
  topic: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

export interface VideoResponse {
  videoUrl: string;
  publicId: string;
  duration?: number;
  format?: string;
  bytes?: number;
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export type ImageTool = 'select' | 'brush' | 'eraser' | 'crop' | 'zoom';

export interface Filters {
  brightness: number; // -1 .. 1   (0 = untouched)
  contrast: number; //   -100 .. 100
  saturation: number; // -2 .. 10
  blur: number; //        0 .. 40
  sharpen: number; //     0 .. 1
}

export const DEFAULT_FILTERS: Filters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  sharpen: 0,
};

export interface MaskStroke {
  id: string;
  points: number[];
  brushSize: number;
  /** `brush` paints the mask, `eraser` carves it back out. */
  mode: 'brush' | 'eraser';
}

export interface ImageLayer {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectRatio = 'free' | '1:1' | '4:3' | '16:9' | '3:4' | '9:16';

export const ASPECT_RATIOS: { label: string; value: AspectRatio; ratio: number | null }[] = [
  { label: 'Free', value: 'free', ratio: null },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '3:4', value: '3:4', ratio: 3 / 4 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
];

export type MergeLayout = 'horizontal' | 'vertical' | 'grid' | 'overlay';

// ---------------------------------------------------------------------------
// Video editor state
// ---------------------------------------------------------------------------

export interface VideoClip {
  id: string;
  name: string;
  url: string;
  publicId: string;
  duration: number;
  /** Trim window within the source clip, in seconds. */
  trimStart: number;
  trimEnd: number;
  thumbnailUrl?: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  publicId?: string;
  duration?: number;
  volume: number;
}

export interface SlideshowImage {
  id: string;
  url: string;
  name: string;
  duration: number;
}

export type ExportFormat = 'png' | 'jpg' | 'webp';
export type VideoQuality = '720p' | '1080p';

export interface ProjectSummary {
  id: string;
  name: string;
  kind: 'image' | 'video';
  thumbnailUrl?: string;
  /** Cloudinary public_id extracted from thumbnailUrl — used for deletion. */
  publicId?: string;
  updatedAt: string;
}
