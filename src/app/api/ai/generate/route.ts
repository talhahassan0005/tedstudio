import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, toUploadResponse, uploadBuffer } from '@/lib/cloudinary';
import { db, recordAsset } from '@/lib/db';
import { generateImage, isWorkersAiConfigured } from '@/lib/workers-ai';
import type { GenerateImageRequest, GenerateImageResponse } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_PROMPT = 2000;

/**
 * POST /api/ai/generate
 * body: { prompt, steps?, width?, height?, negativePrompt? }
 *
 * Text-to-image on Cloudflare Workers AI (free tier: 10k neurons/day).
 * When Cloudinary is configured the result is persisted there too, so the
 * image gets a stable URL that the inpaint/erase endpoints can fetch — the
 * generated picture drops straight into the editing pipeline.
 */
export async function POST(request: Request) {
  if (!isWorkersAiConfigured()) {
    return NextResponse.json(
      {
        error:
          'Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.local (free account works).',
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<GenerateImageRequest>;
    const { prompt, steps, width, height, negativePrompt } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${MAX_PROMPT} characters)` },
        { status: 400 },
      );
    }

    const result = await generateImage({
      prompt: prompt.trim(),
      steps,
      width,
      height,
      negativePrompt,
    });

    // Log generation for quota tracking — best-effort
    db.generationLog.create({ data: { kind: 'image' } }).catch(() => {});

    const payload: GenerateImageResponse = {
      image: toDataUrl(result.buffer.toString('base64'), result.mimeType),
      mimeType: result.mimeType,
    };

    // Persist for the editing pipeline — best-effort, generation still
    // succeeds if Cloudinary is missing or the upload fails.
    if (isCloudinaryConfigured()) {
      try {
        const uploaded = toUploadResponse(
          await uploadBuffer(result.buffer, {
            resource_type: 'image',
            folder: 'mediastudio/generated',
          }),
        );
        payload.secureUrl = uploaded.secureUrl;
        payload.publicId = uploaded.publicId;
        payload.width = uploaded.width;
        payload.height = uploaded.height;

        await recordAsset({
          publicId: uploaded.publicId,
          url: uploaded.url,
          secureUrl: uploaded.secureUrl,
          format: uploaded.format,
          resourceType: 'image',
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          originalFilename: `generated: ${prompt.trim().slice(0, 80)}`,
        });
      } catch (error) {
        console.error('[generate] cloudinary persist failed', error);
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
