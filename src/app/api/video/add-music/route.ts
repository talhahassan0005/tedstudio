import path from 'node:path';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadFile } from '@/lib/cloudinary';
import { addMusic, cleanup, createWorkDir, downloadTo } from '@/lib/ffmpeg-helpers';
import { recordRender } from '@/lib/db';
import type { AddMusicRequest, VideoResponse } from '@/lib/types';
import { errorMessage, fileExtension } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/video/add-music
 * body: { videoUrl, audioUrl, volume, keepOriginalAudio?, loopAudio? }
 *
 * Replaces the clip's audio with the supplied track at `volume`, or mixes the
 * two when `keepOriginalAudio` is set. Output stops at the shorter stream.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured.' }, { status: 503 });
  }

  let workDir: string | null = null;

  try {
    const body = (await request.json()) as Partial<
      AddMusicRequest & { keepOriginalAudio: boolean; loopAudio: boolean }
    >;
    const {
      videoUrl,
      audioUrl,
      volume = 0.8,
      keepOriginalAudio = false,
      loopAudio = false,
    } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: '`videoUrl` is required' }, { status: 400 });
    }
    if (!audioUrl) {
      return NextResponse.json({ error: '`audioUrl` is required' }, { status: 400 });
    }
    if (typeof volume !== 'number' || volume < 0 || volume > 2) {
      return NextResponse.json({ error: '`volume` must be between 0 and 2' }, { status: 400 });
    }

    workDir = await createWorkDir('mediastudio-music-');

    const videoPath = await downloadTo(videoUrl, workDir, 'input.mp4');
    const audioExt = (() => {
      try {
        return fileExtension(new URL(audioUrl).pathname) || 'mp3';
      } catch {
        return 'mp3';
      }
    })();
    const audioPath = await downloadTo(audioUrl, workDir, `audio.${audioExt}`);
    const outputPath = path.join(workDir, 'with-music.mp4');

    await addMusic({
      videoPath,
      audioPath,
      outputPath,
      volume,
      keepOriginalAudio,
      loopAudio,
    });

    const uploaded = await uploadFile(outputPath, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `music_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'music',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { videoUrl, audioUrl, volume, keepOriginalAudio, loopAudio },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    if (workDir) await cleanup(workDir);
  }
}
