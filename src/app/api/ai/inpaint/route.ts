import { NextResponse } from 'next/server';

import { base64ToBlob, fetchImageBlob, inpaint, isClipdropConfigured } from '@/lib/clipdrop';
import type { ImageAiResponse, InpaintRequest } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/ai/inpaint
 * body: { imageUrl, maskBase64, prompt }
 *
 * Regenerates the white region of the mask from `prompt`. The mask must match
 * the source image's pixel dimensions — the canvas exports it at natural size
 * for exactly this reason.
 */
export async function POST(request: Request) {
  if (!isClipdropConfigured()) {
    return NextResponse.json(
      { error: 'CLIPDROP_API_KEY is not set. Add it to .env.local (server-side only).' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<InpaintRequest>;
    const { imageUrl, maskBase64, prompt } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '`imageUrl` is required' }, { status: 400 });
    }
    if (!maskBase64) {
      return NextResponse.json({ error: '`maskBase64` is required' }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ error: '`prompt` is required for inpainting' }, { status: 400 });
    }

    const [image, mask] = [await fetchImageBlob(imageUrl), base64ToBlob(maskBase64)];

    const result = await inpaint({ image, mask, prompt: prompt.trim() });

    const payload: ImageAiResponse = {
      image: toDataUrl(result.buffer.toString('base64'), result.mimeType),
      mimeType: result.mimeType,
      remainingCredits: result.remainingCredits,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
