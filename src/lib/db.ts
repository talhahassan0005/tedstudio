/**
 * Prisma client singleton. SERVER ONLY.
 *
 * Next.js hot-reload re-evaluates modules, which would otherwise open a new
 * SQLite connection per save — the global stash is the standard fix.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// ---------------------------------------------------------------------------
// Best-effort recorders
// ---------------------------------------------------------------------------
// Persistence must never break the operation it documents: a failed DB write
// logs and moves on, the upload/render itself still succeeds.

export interface AssetRecord {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
  originalFilename?: string;
  projectId?: string;
}

export async function recordAsset(asset: AssetRecord): Promise<void> {
  try {
    await db.asset.upsert({
      where: { publicId: asset.publicId },
      update: {},
      create: asset,
    });
  } catch (error) {
    console.error('[db] failed to record asset', error);
  }
}

export interface RenderRecord {
  kind: 'trim' | 'merge' | 'slideshow' | 'music' | 'ai-erase' | 'ai-add';
  videoUrl: string;
  publicId: string;
  duration?: number;
  bytes?: number;
  params?: unknown;
  projectId?: string;
}

export async function recordRender(render: RenderRecord): Promise<void> {
  try {
    await db.render.create({
      data: {
        kind: render.kind,
        videoUrl: render.videoUrl,
        publicId: render.publicId,
        duration: render.duration,
        bytes: render.bytes,
        params: render.params === undefined ? undefined : JSON.stringify(render.params),
        projectId: render.projectId,
      },
    });
  } catch (error) {
    console.error('[db] failed to record render', error);
  }
}
