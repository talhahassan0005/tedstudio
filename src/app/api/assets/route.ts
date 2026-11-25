import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/assets?type=image|video|audio — the media library.
 * Every successful upload is recorded here, so re-using a file never needs
 * a re-upload.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const assets = await db.asset.findMany({
      where: type ? { resourceType: type } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(assets);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
