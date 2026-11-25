/**
 * Clipdrop API client. SERVER ONLY — reads CLIPDROP_API_KEY.
 *
 * Docs: https://clipdrop.co/apis/docs
 * All endpoints take multipart/form-data and answer with raw image bytes.
 */
import { stripDataUrlPrefix } from '@/lib/utils';

const BASE = {
  inpainting: 'https://clipdrop-api.co/inpainting/v1',
  cleanup: 'https://clipdrop-api.co/cleanup/v1',
  removeBackground: 'https://clipdrop-api.co/remove-background/v1',
} as const;

export interface ClipdropResult {
  buffer: Buffer;
  mimeType: string;
  remainingCredits?: number;
}

function apiKey(): string {
  const key = process.env.CLIPDROP_API_KEY;
  if (!key) {
    throw new Error('CLIPDROP_API_KEY is not set. Add it to .env.local (server-side only).');
  }
  return key;
}

/** Download a remote image into a Blob we can put in a FormData. */
export async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not fetch source image (${res.status} ${res.statusText})`);
  }
  const type = res.headers.get('content-type') ?? 'image/png';
  if (!type.startsWith('image/')) {
    throw new Error(`Source URL is not an image (got ${type})`);
  }
  return new Blob([await res.arrayBuffer()], { type });
}

/** Turn a base64 / data-URL mask into a Blob. */
export function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const clean = stripDataUrlPrefix(base64);
  return new Blob([Buffer.from(clean, 'base64')], { type: mimeType });
}

async function callClipdrop(endpoint: string, form: FormData): Promise<ClipdropResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-api-key': apiKey() },
    body: form,
  });

  const remainingHeader = res.headers.get('x-remaining-credits');
  const remainingCredits = remainingHeader ? Number(remainingHeader) : undefined;

  if (!res.ok) {
    // Clipdrop returns JSON on failure, image bytes on success.
    const detail = await res.text();
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep the raw body */
    }
    throw new Error(`Clipdrop ${res.status}: ${message.slice(0, 300) || res.statusText}`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type') ?? 'image/png',
    remainingCredits,
  };
}

/**
 * Inpainting — regenerate the masked region from a text prompt.
 * The mask must be the same pixel dimensions as the image: white = replace.
 */
export async function inpaint(args: {
  image: Blob;
  mask: Blob;
  prompt: string;
}): Promise<ClipdropResult> {
  const form = new FormData();
  form.append('image_file', args.image, 'image.png');
  form.append('mask_file', args.mask, 'mask.png');
  form.append('prompt', args.prompt);
  return callClipdrop(BASE.inpainting, form);
}

/**
 * Cleanup — erase the masked region and fill it from the surroundings.
 * `quality: 'hd'` is slower but noticeably better on large regions.
 */
export async function cleanup(args: {
  image: Blob;
  mask: Blob;
  mode?: 'fast' | 'quality';
}): Promise<ClipdropResult> {
  const form = new FormData();
  form.append('image_file', args.image, 'image.png');
  form.append('mask_file', args.mask, 'mask.png');
  form.append('mode', args.mode ?? 'quality');
  return callClipdrop(BASE.cleanup, form);
}

/** Remove background — returns a PNG with transparency. */
export async function removeBackground(args: { image: Blob }): Promise<ClipdropResult> {
  const form = new FormData();
  form.append('image_file', args.image, 'image.png');
  return callClipdrop(BASE.removeBackground, form);
}

export function isClipdropConfigured(): boolean {
  return Boolean(process.env.CLIPDROP_API_KEY);
}
