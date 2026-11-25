import { NextResponse } from 'next/server';

import { destroyAsset, isCloudinaryConfigured } from '@/lib/cloudinary';
import { db } from '@/lib/db';
import type { ProjectSummary } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toSummary(project: {
  id: string;
  name: string;
  kind: string;
  thumbnailUrl: string | null;
  publicId: string | null;
  updatedAt: Date;
}): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    kind: project.kind === 'video' ? 'video' : 'image',
    thumbnailUrl: project.thumbnailUrl ?? undefined,
    publicId: project.publicId ?? undefined,
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** GET /api/projects — newest first. */
export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 48,
    });
    return NextResponse.json(projects.map(toSummary));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/projects — create, or upsert when an `id` is supplied.
 * body: { id?, name, kind: 'image'|'video', thumbnailUrl? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ProjectSummary>;
    const { id, name, kind, thumbnailUrl } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '`name` is required' }, { status: 400 });
    }
    if (kind !== 'image' && kind !== 'video') {
      return NextResponse.json({ error: '`kind` must be "image" or "video"' }, { status: 400 });
    }

    const publicId = (body as { publicId?: string }).publicId ?? null;
    const data = { name: name.trim().slice(0, 200), kind, thumbnailUrl: thumbnailUrl ?? null, publicId };

    const project = id
      ? await db.project.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        })
      : await db.project.create({ data });

    return NextResponse.json(toSummary(project), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/** DELETE /api/projects — clear the whole list (dashboard "Clear"). */
export async function DELETE() {
  try {
    // Delete Cloudinary assets before wiping the DB rows.
    if (isCloudinaryConfigured()) {
      const projects = await db.project.findMany({ select: { publicId: true, kind: true } });
      await Promise.allSettled(
        projects
          .filter((p) => p.publicId)
          .map((p) =>
            destroyAsset(p.publicId!, p.kind === 'video' ? 'video' : 'image'),
          ),
      );
    }
    await db.project.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
