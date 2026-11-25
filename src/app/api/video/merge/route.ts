import path from 'node:path';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadFile } from '@/lib/cloudinary';
import { cleanup, createWorkDir, downloadTo, mergeVideos } from '@/lib/ffmpeg-helpers';
import { recordRender } from '@/lib/db';
import type { MergeRequest, VideoQuality, VideoResponse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CLIPS = 20;

/**
 * POST /api/video/merge
 * body: { videoUrls, quality? }
 *
 * Joins clips in the order given. The fast `-c copy` concat demuxer runs first;
 * clips whose codecs/resolutions disagree fall back to a normalising re-encode.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured.' }, { status: 503 });
  }

  let workDir: string | null = null;

  try {
    const body = (await request.json()) as Partial<MergeRequest & { quality: VideoQuality }>;
    const { videoUrls, quality = '1080p' } = body;

    if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
      return NextResponse.json(
        { error: '`videoUrls` must contain at least two clips' },
        { status: 400 },
      );
    }
    if (videoUrls.length > MAX_CLIPS) {
      return NextResponse.json({ error: `Too many clips (max ${MAX_CLIPS})` }, { status: 400 });
    }

    workDir = await createWorkDir('mediastudio-merge-');

    const inputPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i += 1) {
      inputPaths.push(
        await downloadTo(videoUrls[i], workDir, `clip_${String(i).padStart(3, '0')}.mp4`),
      );
    }

    const outputPath = path.join(workDir, 'merged.mp4');

    await mergeVideos({
      inputPaths,
      outputPath,
      workDir,
      quality: quality === '720p' ? '720p' : '1080p',
    });

    const uploaded = await uploadFile(outputPath, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `merge_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'merge',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { videoUrls, quality },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    if (workDir) await cleanup(workDir);
  }
}
