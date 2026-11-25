import { NextResponse } from 'next/server';

import { CLOUDINARY_FOLDER, isCloudinaryConfigured, signUploadParams } from '@/lib/cloudinary';
import type { SignatureResponse } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cloudinary/signature?folder=mediastudio/image
 *
 * Hands the browser a short-lived signature so it can upload straight to
 * Cloudinary without the file passing through this server. The API secret
 * never leaves the server; only the signature and the public API key do.
 *
 * Every parameter the client sends with the upload must also be signed here,
 * or Cloudinary rejects the request.
 */
export async function GET(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Cloudinary is not configured. Copy .env.local.example to .env.local and fill it in.' },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedFolder = searchParams.get('folder') ?? CLOUDINARY_FOLDER;

    // Never sign an arbitrary client-supplied folder — pin it under our own.
    const folder = requestedFolder.startsWith(CLOUDINARY_FOLDER)
      ? requestedFolder.replace(/[^a-zA-Z0-9/_-]/g, '')
      : CLOUDINARY_FOLDER;

    const { signature, timestamp } = signUploadParams({ folder });

    const payload: SignatureResponse = {
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY as string,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
      folder,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
