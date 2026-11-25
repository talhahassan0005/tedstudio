'use client';

/**
 * Crash/refresh safety for both editors.
 *
 * Editor state lives in Zustand (memory only), so a refresh used to wipe the
 * session. This module mirrors the durable parts of both stores into
 * IndexedDB and restores them on the next load.
 *
 * Why not zustand's persist middleware: the image editor holds multi-MB data
 * URLs, and persist re-serialises the whole snapshot on EVERY store write —
 * including the ~60Hz writes while a brush stroke is being drawn. The manual
 * subscription below debounces BEFORE serialisation, so drawing stays smooth.
 *
 * Why IndexedDB, not localStorage: local-mode images are data URLs far past
 * localStorage's ~5MB ceiling.
 */

import { useImageEditorStore } from '@/store/imageEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';

const DB_NAME = 'ted-studio';
const STORE = 'editor-state';
const VERSION_KEY = 'v';
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Tiny IndexedDB key-value helpers
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });
  db.close();
  return value;
}

// ---------------------------------------------------------------------------
// What survives a refresh
// ---------------------------------------------------------------------------

type ImageState = ReturnType<typeof useImageEditorStore.getState>;
type VideoState = ReturnType<typeof useVideoEditorStore.getState>;

/** Durable image-editor fields. History is excluded: N data URLs is too fat. */
function pickImage(s: ImageState) {
  return {
    [VERSION_KEY]: SCHEMA_VERSION,
    asset: s.asset,
    workingSrc: s.workingSrc,
    originalSrc: s.originalSrc,
    naturalSize: s.naturalSize,
    filters: s.filters,
    strokes: s.strokes,
    brushSize: s.brushSize,
    tool: s.tool,
    prompt: s.prompt,
    layers: s.layers,
    mergeLayout: s.mergeLayout,
  };
}

/** Durable video-editor fields. Playback position and flags stay transient. */
function pickVideo(s: VideoState) {
  return {
    [VERSION_KEY]: SCHEMA_VERSION,
    clips: s.clips,
    activeClipId: s.activeClipId,
    duration: s.duration,
    trimStart: s.trimStart,
    trimEnd: s.trimEnd,
    audio: s.audio,
    keepOriginalAudio: s.keepOriginalAudio,
    slideshowImages: s.slideshowImages,
    durationPerImage: s.durationPerImage,
    transition: s.transition,
    aiPrompt: s.aiPrompt,
    resultUrl: s.resultUrl,
    resultPublicId: s.resultPublicId,
    quality: s.quality,
  };
}

// ---------------------------------------------------------------------------
// Restore + subscribe
// ---------------------------------------------------------------------------

let started = false;

export async function restoreEditorState(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const [image, video] = await Promise.all([
      idbGet<Record<string, unknown>>('image'),
      idbGet<Record<string, unknown>>('video'),
    ]);

    if (image && image[VERSION_KEY] === SCHEMA_VERSION) {
      const { [VERSION_KEY]: _v, ...data } = image;
      useImageEditorStore.setState(data as Partial<ImageState>);
    }
    if (video && video[VERSION_KEY] === SCHEMA_VERSION) {
      // Panel selection is UI-only. Always use the current app default after refresh.
      const { [VERSION_KEY]: _v, tab: _oldTab, ...data } = video;
      useVideoEditorStore.setState(data as Partial<VideoState>);
    }
  } catch (error) {
    // Private mode / blocked storage: the app still works, just without
    // refresh survival. Never let this break the editor.
    console.warn('[persistence] restore skipped:', error);
  }
}

export function startEditorPersistence(): () => void {
  if (started || typeof indexedDB === 'undefined') return () => undefined;
  started = true;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    const imageSnapshot = pickImage(useImageEditorStore.getState());
    const videoSnapshot = pickVideo(useVideoEditorStore.getState());
    void idbSet('image', imageSnapshot).catch(() => undefined);
    void idbSet('video', videoSnapshot).catch(() => undefined);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const unsubImage = useImageEditorStore.subscribe(schedule);
  const unsubVideo = useVideoEditorStore.subscribe(schedule);

  // Tab closing/hiding: skip the debounce and write right now. IndexedDB is
  // async so this is best-effort, but the debounce keeps the loss window tiny.
  const onHide = () => {
    if (timer) clearTimeout(timer);
    flush();
  };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });

  return () => {
    unsubImage();
    unsubVideo();
    window.removeEventListener('pagehide', onHide);
    started = false;
  };
}
