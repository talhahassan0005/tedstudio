import { NextResponse } from 'next/server';

import { fetchImageBlob, isClipdropConfigured, removeBackground } from '@/lib/clipdrop';
import type { ImageAiResponse, RemoveBgRequest } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/ai/remove-bg
 * body: { imageUrl }
 *
 * Returns a PNG with an alpha channel, so the result must stay PNG —
 * exporting it as JPG will flatten the transparency onto black.
 */
export async function POST(request: Request) {
  if (!isClipdropConfigured()) {
    return NextResponse.json(
      { error: 'CLIPDROP_API_KEY is not set. Add it to .env.local (server-side only).' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<RemoveBgRequest>;
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '`imageUrl` is required' }, { status: 400 });
    }

    const image = await fetchImageBlob(imageUrl);
    const result = await removeBackground({ image });

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
