import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className joiner (the shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short, collision-resistant id that works in both browser and Node. */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/** `92.5` -> `"1:32"`. Used by the video timeline. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`;
}

/** `1536` -> `"1.5 KB"`. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Strip a `data:*;base64,` prefix if present, leaving bare base64. */
export function stripDataUrlPrefix(input: string): string {
  const comma = input.indexOf(',');
  return input.startsWith('data:') && comma !== -1 ? input.slice(comma + 1) : input;
}

export function toDataUrl(base64: string, mimeType = 'image/png'): string {
  return base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
}

/** Browser-only: turn a data URL into a File for multipart upload. */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/** Browser-only: trigger a download for a data/blob/remote URL. */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  let href = url;
  let revoke = false;

  // Remote URLs need fetching first, otherwise the browser navigates
  // instead of downloading (the `download` attr is same-origin only).
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    href = URL.createObjectURL(blob);
    revoke = true;
  }

  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) URL.revokeObjectURL(href);
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function resourceTypeFromFile(file: File): 'image' | 'video' | 'audio' | 'raw' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'raw';
}

/**
 * Fit `src` inside `box` without distortion. Returns the drawn size and the
 * scale that was applied — the image editor needs both.
 */
export function fitContain(
  src: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number; scale: number } {
  if (!src.width || !src.height) return { width: 0, height: 0, scale: 1 };
  const scale = Math.min(box.width / src.width, box.height / src.height, 1);
  return { width: src.width * scale, height: src.height * scale, scale };
}

/** Read a JSON API response, surfacing `{ error }` bodies as thrown Errors. */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 300) || `Request failed (${res.status})`);
  }
  if (!res.ok) {
    const err = body as ApiLike;
    throw new Error(err?.error || err?.detail || `Request failed (${res.status})`);
  }
  return body as T;
}

type ApiLike = { error?: string; detail?: string };

/** Typed `fetch` for our own API routes. */
export async function postJson<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  init?: RequestInit,
): Promise<TResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  return parseJsonResponse<TResponse>(res);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong';
}
