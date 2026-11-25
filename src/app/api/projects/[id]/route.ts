import { NextResponse } from 'next/server';

import { destroyAsset, isCloudinaryConfigured } from '@/lib/cloudinary';
import { db } from '@/lib/db';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

/** GET /api/projects/:id — full project with its assets and render history. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const project = await db.project.findUnique({
      where: { id: params.id },
      include: {
        assets: { orderBy: { createdAt: 'desc' } },
        renders: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/** PATCH /api/projects/:id — rename / update the thumbnail. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = (await request.json()) as { name?: string; thumbnailUrl?: string | null };

    const data: { name?: string; thumbnailUrl?: string | null } = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      data.name = body.name.trim().slice(0, 200);
    }
    if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const project = await db.project.update({ where: { id: params.id }, data });
    return NextResponse.json(project);
  } catch (error) {
    // Prisma throws P2025 when the row does not exist.
    const message = errorMessage(error);
    const status = message.includes('No record was found') || message.includes('P2025') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/projects/:id */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const project = await db.project.findUnique({
      where: { id: params.id },
      select: { publicId: true, kind: true },
    });

    await db.project.delete({ where: { id: params.id } });

    // Delete the Cloudinary asset after the DB row is gone — best-effort.
    if (project?.publicId && isCloudinaryConfigured()) {
      destroyAsset(project.publicId, project.kind === 'video' ? 'video' : 'image').catch(
        (err) => console.error('[delete project] cloudinary destroy failed', err),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes('No record was found') || message.includes('P2025') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
