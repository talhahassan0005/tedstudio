import path from 'node:path';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadFile } from '@/lib/cloudinary';
import { cleanup, createWorkDir, downloadTo, probe, trimVideo } from '@/lib/ffmpeg-helpers';
import { recordRender } from '@/lib/db';
import type { TrimRequest, VideoResponse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/video/trim
 * body: { videoUrl, startTime, endTime, accurate? }
 *
 * Stream-copy is tried first (instant, but snaps to the nearest keyframe).
 * Pass `accurate: true` to re-encode and land exactly on the given times.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured.' }, { status: 503 });
  }

  let workDir: string | null = null;

  try {
    const body = (await request.json()) as Partial<TrimRequest & { accurate: boolean }>;
    const { videoUrl, startTime, endTime, accurate = false } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: '`videoUrl` is required' }, { status: 400 });
    }
    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json(
        { error: '`startTime` and `endTime` must be numbers (seconds)' },
        { status: 400 },
      );
    }
    if (endTime <= startTime) {
      return NextResponse.json(
        { error: '`endTime` must be greater than `startTime`' },
        { status: 400 },
      );
    }

    workDir = await createWorkDir('mediastudio-trim-');
    const inputPath = await downloadTo(videoUrl, workDir, 'input.mp4');
    const outputPath = path.join(workDir, 'trimmed.mp4');

    const source = await probe(inputPath).catch(() => null);
    if (source && source.duration > 0 && startTime >= source.duration) {
      return NextResponse.json(
        { error: `startTime (${startTime}s) is past the end of the video (${source.duration.toFixed(1)}s)` },
        { status: 400 },
      );
    }

    await trimVideo({
      inputPath,
      outputPath,
      startTime,
      // Never ask ffmpeg for more than the source actually has.
      endTime: source?.duration ? Math.min(endTime, source.duration) : endTime,
      accurate,
    });

    const uploaded = await uploadFile(outputPath, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `trim_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'trim',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { videoUrl, startTime, endTime, accurate },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    if (workDir) await cleanup(workDir);
  }
}
