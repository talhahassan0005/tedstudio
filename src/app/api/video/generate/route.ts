import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadRemote } from '@/lib/cloudinary';
import { db, recordRender } from '@/lib/db';
import { createKlingVideo, isKlingConfigured, waitForKlingVideo } from '@/lib/kling';
import type { GenerateVideoRequest, VideoResponse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(request: Request) {
  if (!isKlingConfigured()) {
    return NextResponse.json({ error: 'KLING_API_KEY is not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Partial<GenerateVideoRequest>;
    const prompt = body.prompt?.trim();
    const duration = body.duration ?? 5;
    const aspectRatio = body.aspectRatio ?? '9:16';

    if (!prompt) return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
    if (!Number.isInteger(duration) || duration < 3 || duration > 20) {
      return NextResponse.json({ error: '`duration` must be 3–20 seconds' }, { status: 400 });
    }
    if (!['16:9', '9:16', '1:1'].includes(aspectRatio)) {
      return NextResponse.json({ error: 'Unsupported aspect ratio' }, { status: 400 });
    }

    const taskId = await createKlingVideo({ prompt, duration, aspectRatio });
    const generated = await waitForKlingVideo(taskId);
    db.generationLog.create({ data: { kind: 'video' } }).catch(() => {});

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({
        videoUrl: generated.url,
        publicId: '',
        duration: generated.duration ?? duration,
      } satisfies VideoResponse);
    }

    const uploaded = await uploadRemote(generated.url, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `kling_${Date.now()}`,
    });
    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration ?? generated.duration ?? duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };
    await recordRender({
      kind: 'ai-add',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { provider: 'kling', taskId, prompt, duration, aspectRatio },
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
