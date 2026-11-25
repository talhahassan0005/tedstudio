'use client';

import { useCallback } from 'react';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { FileAudio, FileVideo, ImageIcon, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { cn, formatBytes } from '@/lib/utils';
import type { MediaAsset, ResourceType } from '@/lib/types';
import { useUpload } from '@/hooks/useUpload';

const ACCEPT: Record<ResourceType, Accept> = {
  image: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'] },
  video: { 'video/*': ['.mp4', '.mov', '.webm', '.mkv', '.avi'] },
  audio: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg'] },
  raw: {},
};

const ICONS: Record<ResourceType, typeof ImageIcon> = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  raw: UploadCloud,
};

export interface FileUploaderProps {
  resourceType: ResourceType;
  multiple?: boolean;
  /** Fires once per successfully uploaded file. */
  onUploaded: (asset: MediaAsset) => void;
  /** Fires once with every asset, after a multi-file batch finishes. */
  onUploadedMany?: (assets: MediaAsset[]) => void;
  label?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
  maxSizeMb?: number;
}

export function FileUploader({
  resourceType,
  multiple = false,
  onUploaded,
  onUploadedMany,
  label,
  hint,
  className,
  compact = false,
  maxSizeMb = 200,
}: FileUploaderProps) {
  const { upload, isUploading, progress } = useUpload();
  const Icon = ICONS[resourceType];

  const onDrop = useCallback(
    async (accepted: File[], rejected: readonly FileRejection[]) => {
      for (const rejection of rejected) {
        toast.error(`${rejection.file.name} was rejected`, {
          description: rejection.errors[0]?.message,
        });
      }
      if (accepted.length === 0) return;

      const assets: MediaAsset[] = [];
      // Sequential: parallel uploads of big media make progress meaningless.
      for (const file of accepted) {
        const asset = await upload(file, resourceType);
        if (asset) {
          assets.push(asset);
          onUploaded(asset);
        }
      }
      if (assets.length > 0) {
        onUploadedMany?.(assets);
        toast.success(
          assets.length === 1 ? 'Uploaded' : `${assets.length} files uploaded`,
        );
      }
    },
    [upload, resourceType, onUploaded, onUploadedMany],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT[resourceType],
    multiple,
    maxSize: maxSizeMb * 1024 * 1024,
    disabled: isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-slate-900/40 text-center transition-colors',
        compact ? 'p-4' : 'p-8',
        isDragActive && 'border-primary bg-primary/5',
        isUploading && 'cursor-wait opacity-70',
        !isUploading && 'hover:border-primary/60 hover:bg-slate-900/70',
        className,
      )}
    >
      <input {...getInputProps()} />

      {isUploading ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Uploading… {progress}%</p>
          <div
            className="h-1 w-32 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <Icon
            className={cn(
              'text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:text-primary',
              compact ? 'h-5 w-5' : 'h-8 w-8',
              isDragActive && '-translate-y-1 scale-110 text-primary',
            )}
          />
          <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
            {label ?? (isDragActive ? 'Drop to upload' : `Drop ${resourceType} here`)}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {hint ?? `or click to browse — up to ${formatBytes(maxSizeMb * 1024 * 1024, 0)}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
