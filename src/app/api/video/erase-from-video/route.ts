import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadRemote } from '@/lib/cloudinary';
import { recordRender } from '@/lib/db';
import { firstUrl, isReplicateConfigured, propainterVersion, runModel } from '@/lib/replicate';
import type { VideoAiRequest, VideoResponse } from '@/lib/types';
import { errorMessage, toDataUrl } from '@/lib/utils';

export const runtime = 'nodejs';
// Video inpainting is minutes, not seconds. Serverless hosts will cap this —
// move to a queue/webhook flow if your platform's ceiling is lower.
export const maxDuration = 600;

/**
 * POST /api/video/erase-from-video
 * body: { videoUrl, maskBase64 }
 *
 * Runs ProPainter on Replicate to propagate a single-frame mask through the
 * whole clip, removing whatever it covers. The result is copied into
 * Cloudinary because Replicate's delivery URLs expire after about an hour.
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
    const { videoUrl, maskBase64 } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: '`videoUrl` is required' }, { status: 400 });
    }
    if (!maskBase64) {
      return NextResponse.json(
        { error: '`maskBase64` is required — draw over the object to remove first' },
        { status: 400 },
      );
    }

    // Replicate accepts data URIs for file inputs, so the mask goes straight
    // across without a round-trip through storage.
    const output = await runModel<unknown>(propainterVersion(), {
      video: videoUrl,
      mask: toDataUrl(maskBase64, 'image/png'),
      // ProPainter's own defaults, surfaced here so they are easy to tune.
      resize_ratio: 1,
      mask_dilation: 8,
      ref_stride: 10,
      neighbor_length: 10,
      subvideo_length: 80,
    });

    const resultUrl = firstUrl(output);
    if (!resultUrl) {
      return NextResponse.json(
        { error: 'The model returned no video. Check the prediction logs on Replicate.' },
        { status: 502 },
      );
    }

    // Persist it, if we can; otherwise hand back the (temporary) Replicate URL.
    if (!isCloudinaryConfigured()) {
      return NextResponse.json({
        videoUrl: resultUrl,
        publicId: '',
      } satisfies VideoResponse);
    }

    const uploaded = await uploadRemote(resultUrl, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `ai_erase_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'ai-erase',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { videoUrl },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
