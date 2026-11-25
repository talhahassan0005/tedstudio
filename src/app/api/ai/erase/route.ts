import { NextResponse } from 'next/server';

import { base64ToBlob, cleanup, fetchImageBlob, isClipdropConfigured } from '@/lib/clipdrop';
import type { EraseRequest, ImageAiResponse } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/ai/erase
 * body: { imageUrl, maskBase64 }
 *
 * Clipdrop "cleanup": removes whatever the mask covers and reconstructs the
 * background behind it. No prompt — the model infers the fill.
 */
export async function POST(request: Request) {
  if (!isClipdropConfigured()) {
    return NextResponse.json(
      { error: 'CLIPDROP_API_KEY is not set. Add it to .env.local (server-side only).' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<EraseRequest>;
    const { imageUrl, maskBase64 } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '`imageUrl` is required' }, { status: 400 });
    }
    if (!maskBase64) {
      return NextResponse.json(
        { error: '`maskBase64` is required — paint over the area to erase first' },
        { status: 400 },
      );
    }

    const image = await fetchImageBlob(imageUrl);
    const mask = base64ToBlob(maskBase64);

    const result = await cleanup({ image, mask, mode: 'quality' });

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
