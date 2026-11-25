import path from 'node:path';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadFile } from '@/lib/cloudinary';
import {
  cleanup,
  createSlideshow,
  createWorkDir,
  downloadTo,
  probe,
} from '@/lib/ffmpeg-helpers';
import { recordRender } from '@/lib/db';
import type { CreateFromImagesRequest, Transition, VideoResponse } from '@/lib/types';
import { errorMessage, fileExtension } from '@/lib/utils';

export const runtime = 'nodejs';
// Encoding a slideshow is slow; raise this on your host if you allow many images.
export const maxDuration = 300;

const MAX_IMAGES = 40;
const TRANSITIONS: Transition[] = ['fade', 'slide', 'none'];

/**
 * POST /api/video/create-from-images
 * body: { imageUrls, durationPerImage, transition, outputName }
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured.' }, { status: 503 });
  }

  let workDir: string | null = null;

  try {
    const body = (await request.json()) as Partial<CreateFromImagesRequest>;
    const {
      imageUrls,
      durationPerImage = 2,
      transition = 'fade',
      outputName = 'slideshow',
    } = body;

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: '`imageUrls` must be a non-empty array' }, { status: 400 });
    }
    if (imageUrls.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images (max ${MAX_IMAGES})` },
        { status: 400 },
      );
    }
    if (!TRANSITIONS.includes(transition)) {
      return NextResponse.json(
        { error: `\`transition\` must be one of: ${TRANSITIONS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!Number.isFinite(durationPerImage) || durationPerImage <= 0) {
      return NextResponse.json({ error: '`durationPerImage` must be > 0' }, { status: 400 });
    }

    workDir = await createWorkDir('mediastudio-slideshow-');

    // Download every still first — ffmpeg needs them all on disk up front.
    const imagePaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i += 1) {
      const ext = fileExtension(new URL(imageUrls[i]).pathname) || 'jpg';
      imagePaths.push(
        await downloadTo(imageUrls[i], workDir, `img_${String(i).padStart(3, '0')}.${ext}`),
      );
    }

    const outputPath = path.join(workDir, 'slideshow.mp4');

    await createSlideshow({
      imagePaths,
      outputPath,
      durationPerImage,
      transition,
      quality: '1080p',
    });

    const info = await probe(outputPath).catch(() => null);

    const uploaded = await uploadFile(outputPath, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `${outputName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`,
    });

    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration ?? info?.duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };

    await recordRender({
      kind: 'slideshow',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { imageCount: imageUrls.length, durationPerImage, transition },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    if (workDir) await cleanup(workDir);
  }
}
