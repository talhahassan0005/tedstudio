import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/renders?kind=trim|merge|slideshow|music|ai-erase|ai-add
 * History of every server-side video operation, newest first. The video
 * routes record these automatically.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind');

    const renders = await db.render.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(renders);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
