/**
 * Cloudinary helpers. SERVER ONLY — this module reads the API secret.
 * Never import it from a Client Component.
 */
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import type { ResourceType, UploadResponse } from '@/lib/types';

export const CLOUDINARY_FOLDER = 'mediastudio';

let configured = false;

function configure() {
  if (configured) return;

  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local',
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export function getCloudinary() {
  configure();
  return cloudinary;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/** Upload a Buffer (or Uint8Array) using the streaming upload API. */
export function uploadBuffer(
  buffer: Buffer,
  options: UploadApiOptions = {},
): Promise<UploadApiResponse> {
  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, resource_type: 'auto', ...options },
      (error, result) => {
        if (error) return reject(new Error(error.message));
        if (!result) return reject(new Error('Cloudinary returned an empty response'));
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/** Upload a file that already exists on the server's disk. */
export async function uploadFile(
  path: string,
  options: UploadApiOptions = {},
): Promise<UploadApiResponse> {
  const client = getCloudinary();
  return client.uploader.upload(path, {
    folder: CLOUDINARY_FOLDER,
    resource_type: 'auto',
    ...options,
  });
}

/** Upload straight from a remote URL — Cloudinary fetches it server-side. */
export async function uploadRemote(
  url: string,
  options: UploadApiOptions = {},
): Promise<UploadApiResponse> {
  const client = getCloudinary();
  return client.uploader.upload(url, {
    folder: CLOUDINARY_FOLDER,
    resource_type: 'auto',
    ...options,
  });
}

export async function destroyAsset(
  publicId: string,
  resourceType: ResourceType = 'image',
): Promise<void> {
  const client = getCloudinary();
  await client.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Signature for a direct browser -> Cloudinary upload.
 * Only the params that the client will send may be signed.
 */
export function signUploadParams(params: Record<string, string | number>): {
  signature: string;
  timestamp: number;
} {
  const client = getCloudinary();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = client.utils.api_sign_request(
    { timestamp, ...params },
    process.env.CLOUDINARY_API_SECRET as string,
  );
  return { signature, timestamp };
}

/** Normalise a Cloudinary response into our own `UploadResponse`. */
export function toUploadResponse(result: UploadApiResponse): UploadResponse {
  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    format: result.format,
    resourceType: (result.resource_type as ResourceType) ?? 'image',
    width: result.width,
    height: result.height,
    duration: (result as { duration?: number }).duration,
    bytes: result.bytes,
  };
}

/** Public delivery URL built without the SDK (safe to call on the client). */
export function buildDeliveryUrl(
  publicId: string,
  opts: { resourceType?: ResourceType; transformation?: string; format?: string } = {},
): string {
  const cloudName =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const { resourceType = 'image', transformation, format } = opts;
  const parts = [
    'https://res.cloudinary.com',
    cloudName,
    resourceType,
    'upload',
    transformation,
    format ? `${publicId}.${format}` : publicId,
  ].filter(Boolean);
  return parts.join('/');
}

/** A single still frame from a video — used for timeline/clip thumbnails. */
export function videoThumbnailUrl(publicId: string, atSecond = 0): string {
  return buildDeliveryUrl(publicId, {
    resourceType: 'video',
    transformation: `so_${atSecond},w_320,c_fill,q_auto`,
    format: 'jpg',
  });
}
