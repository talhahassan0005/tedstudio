'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { MediaAsset, ResourceType, UploadResponse } from '@/lib/types';
import { errorMessage, parseJsonResponse, resourceTypeFromFile, uid } from '@/lib/utils';

/** Build an editable asset from a file without any storage backend. */
async function localImageAsset(file: File): Promise<MediaAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Not a readable image'));
    img.src = dataUrl;
  });

  return {
    id: uid('asset'),
    publicId: '', // empty = local-only; callers skip library/history writes
    url: dataUrl,
    secureUrl: dataUrl,
    format: file.type.split('/')[1] ?? 'png',
    resourceType: 'image',
    width: size.width,
    height: size.height,
    bytes: file.size,
    originalFilename: file.name,
    createdAt: new Date().toISOString(),
  };
}

export interface UseUploadResult {
  upload: (file: File, resourceType?: ResourceType) => Promise<MediaAsset | null>;
  uploadMany: (files: File[], resourceType?: ResourceType) => Promise<MediaAsset[]>;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * Uploads through our own `/api/upload` route (so the Cloudinary secret stays
 * server-side) and reports real byte-level progress via XHR — `fetch` cannot
 * report upload progress.
 */
export function useUpload(): UseUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, resourceType?: ResourceType): Promise<MediaAsset | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('resourceType', resourceType ?? resourceTypeFromFile(file));

        const response = await new Promise<UploadResponse>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          };

          xhr.onload = () => {
            try {
              const body = JSON.parse(xhr.responseText || '{}') as UploadResponse & {
                error?: string;
              };
              if (xhr.status >= 200 && xhr.status < 300) resolve(body);
              else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.onabort = () => reject(new Error('Upload cancelled'));
          xhr.send(form);
        });

        const asset: MediaAsset = {
          id: uid('asset'),
          publicId: response.publicId,
          url: response.url,
          secureUrl: response.secureUrl,
          format: response.format,
          resourceType: response.resourceType,
          width: response.width,
          height: response.height,
          duration: response.duration,
          bytes: response.bytes,
          originalFilename: file.name,
          createdAt: new Date().toISOString(),
        };

        setProgress(100);
        return asset;
      } catch (err) {
        const message = errorMessage(err);

        // No Cloudinary configured? Images can still be edited entirely
        // locally — load the file as a data URL and carry on. Video/audio
        // stays an error: those features genuinely need hosted URLs.
        const kind = resourceType ?? resourceTypeFromFile(file);
        if (message.includes('Cloudinary is not configured') && kind === 'image') {
          try {
            const local = await localImageAsset(file);
            toast.info('Local mode — no storage configured', {
              description:
                'Editing and merging work fully, but the image lives in this tab only and will not be saved to your library.',
            });
            setProgress(100);
            return local;
          } catch {
            /* fall through to the normal error */
          }
        }

        setError(message);
        toast.error('Upload failed', { description: message });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const uploadMany = useCallback(
    async (files: File[], resourceType?: ResourceType): Promise<MediaAsset[]> => {
      const assets: MediaAsset[] = [];
      // Sequential on purpose: parallel uploads of large media starve each other
      // and make the progress bar meaningless.
      for (const file of files) {
        const asset = await upload(file, resourceType);
        if (asset) assets.push(asset);
      }
      return assets;
    },
    [upload],
  );

  return { upload, uploadMany, isUploading, progress, error };
}

/**
 * Alternative flow: upload straight from the browser to Cloudinary using a
 * signature from our server. Keeps large files off our own bandwidth, at the
 * cost of exposing the cloud name and API key (both are public by design).
 */
export async function uploadDirectToCloudinary(
  file: File,
  resourceType: ResourceType = 'image',
): Promise<UploadResponse> {
  const folder = `mediastudio/${resourceType}`;
  const sigRes = await fetch(`/api/cloudinary/signature?folder=${encodeURIComponent(folder)}`);
  const sig = await parseJsonResponse<{
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    folder: string;
  }>(sigRes);

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const endpointType = resourceType === 'audio' ? 'video' : resourceType;
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/${endpointType}/upload`,
    { method: 'POST', body: form },
  );

  const body = await parseJsonResponse<{
    public_id: string;
    url: string;
    secure_url: string;
    format: string;
    resource_type: ResourceType;
    width?: number;
    height?: number;
    duration?: number;
    bytes?: number;
  }>(res);

  return {
    publicId: body.public_id,
    url: body.url,
    secureUrl: body.secure_url,
    format: body.format,
    resourceType: body.resource_type,
    width: body.width,
    height: body.height,
    duration: body.duration,
    bytes: body.bytes,
  };
}
