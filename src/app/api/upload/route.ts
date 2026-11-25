import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, toUploadResponse, uploadBuffer } from '@/lib/cloudinary';
import { recordAsset } from '@/lib/db';
import type { UploadResponse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * The resource type Cloudinary's API accepts. Note that audio has no type of
 * its own — Cloudinary stores it under `video`.
 */
type CloudinaryResourceType = 'image' | 'video' | 'raw';

const ALLOWED: Record<string, CloudinaryResourceType> = {
  image: 'image',
  video: 'video',
  audio: 'video',
  raw: 'raw',
};

/**
 * POST /api/upload
 * multipart/form-data: { file: File, resourceType?: 'image'|'video'|'audio' }
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Cloudinary is not configured. Copy .env.local.example to .env.local and fill it in.' },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    const requested = String(form.get('resourceType') ?? '');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file supplied under the `file` field' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
        { status: 413 },
      );
    }

    // Trust the declared type only if we recognise it; otherwise sniff the MIME.
    const kind: CloudinaryResourceType =
      ALLOWED[requested] ??
      (file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/') || file.type.startsWith('audio/')
          ? 'video'
          : 'raw');

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadBuffer(buffer, {
      resource_type: kind,
      folder: requested === 'audio' ? 'mediastudio/audio' : `mediastudio/${kind}`,
      // Keep the original filename visible in the Cloudinary media library.
      use_filename: true,
      unique_filename: true,
      filename_override: file.name,
    });

    const payload: UploadResponse = toUploadResponse(result);

    // Media library entry — best-effort, never fails the upload.
    await recordAsset({
      publicId: payload.publicId,
      url: payload.url,
      secureUrl: payload.secureUrl,
      format: payload.format,
      resourceType: requested === 'audio' ? 'audio' : payload.resourceType,
      width: payload.width,
      height: payload.height,
      duration: payload.duration,
      bytes: payload.bytes,
      originalFilename: file.name,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
