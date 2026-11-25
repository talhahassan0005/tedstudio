import { NextResponse } from 'next/server';

import { inpaintWithWorkersAi, isWorkersAiConfigured } from '@/lib/workers-ai';
import type { ImageAiResponse } from '@/lib/types';
import { errorMessage, stripDataUrlPrefix, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

// CF wants file bytes as JSON integer arrays (~4× the file size), so the
// client downscales to ≤1024px first; this guard is the backstop.
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * POST /api/ai/inpaint-free
 * body: { imageBase64, maskBase64, prompt }
 *
 * The free fallback for inpaint AND erase, on Cloudflare Workers AI
 * (Stable Diffusion inpainting — same free daily quota as generation).
 * White mask pixels = region to regenerate. Erase is just this with a
 * "background" prompt.
 */
export async function POST(request: Request) {
  if (!isWorkersAiConfigured()) {
    return NextResponse.json(
      {
        error:
          'Not configured: set CLIPDROP_API_KEY for best quality, or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN for the free model.',
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      imageBase64?: string;
      maskBase64?: string;
      prompt?: string;
      width?: number;
      height?: number;
    };
    const { imageBase64, maskBase64, prompt, width, height } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: '`imageBase64` is required' }, { status: 400 });
    }
    if (!maskBase64) {
      return NextResponse.json({ error: '`maskBase64` is required' }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
    }

    const imageBytes = Buffer.from(stripDataUrlPrefix(imageBase64), 'base64');
    const maskBytes = Buffer.from(stripDataUrlPrefix(maskBase64), 'base64');

    if (imageBytes.length === 0 || maskBytes.length === 0) {
      return NextResponse.json({ error: 'Image or mask is empty' }, { status: 400 });
    }
    if (imageBytes.length + maskBytes.length > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large for the free model — it should be ≤1024px (the editor downscales automatically; try again).' },
        { status: 413 },
      );
    }

    const result = await inpaintWithWorkersAi({
      imageBytes,
      maskBytes,
      prompt: prompt.trim(),
      width: typeof width === 'number' ? width : undefined,
      height: typeof height === 'number' ? height : undefined,
    });

    const payload: ImageAiResponse = {
      image: toDataUrl(result.buffer.toString('base64'), result.mimeType),
      mimeType: result.mimeType,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
