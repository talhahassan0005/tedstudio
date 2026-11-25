import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadRemote } from '@/lib/cloudinary';
import { db, recordRender } from '@/lib/db';
import { firstUrl, isReplicateConfigured, runModel, videoAddVersion } from '@/lib/replicate';
import type { VideoAiRequest, VideoResponse } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/video/add-to-video
 * body: { videoUrl, prompt, maskBase64? }
 *
 * Generative edit: adds/alters content in the clip from a text prompt. With a
 * mask the change is confined to the painted region; without one the whole
 * frame is in play.
 *
 * Which model runs is set by REPLICATE_VIDEO_ADD_VERSION — see lib/replicate.ts.
 * Input field names vary between models, so if you swap the model, check its
 * schema on Replicate and adjust the `input` below.
 */
export async function POST(request: Request) {
  if (!isReplicateConfigured()) {
    return NextResponse.json(
      { error: 'REPLICATE_API_TOKEN is not set. Add it to .env.local (server-side only).' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<VideoAiRequest>;
    const { videoUrl, prompt, maskBase64 } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: '`videoUrl` is required' }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: '`prompt` is required — describe what to add to the video' },
        { status: 400 },
      );
    }

    const input: Record<string, unknown> = {
      video: videoUrl,
      prompt: prompt.trim(),
    };
    if (maskBase64) input.mask = toDataUrl(maskBase64, 'image/png');

    const output = await runModel<unknown>(videoAddVersion(), input);
    db.generationLog.create({ data: { kind: 'video' } }).catch(() => {});

    const resultUrl = firstUrl(output);
    if (!resultUrl) {
      return NextResponse.json(
        { error: 'The model returned no video. Check the prediction logs on Replicate.' },
        { status: 502 },
      );
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ videoUrl: resultUrl, publicId: '' } satisfies VideoResponse);
    }

    const uploaded = await uploadRemote(resultUrl, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `ai_add_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'ai-add',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { videoUrl, prompt },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
