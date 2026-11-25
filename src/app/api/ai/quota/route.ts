import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Image: Cloudflare Workers AI free tier = 10,000 neurons/day.
// FLUX.1 schnell at 4 steps (1024×1024) costs ~77 neurons → ~130 images/day.
// At 8 steps ~65/day. Using 100 as a safe average estimate.
const IMAGE_DAILY_LIMIT = 100;
const IMAGE_MONTHLY_LIMIT = 3000;

// Video: Replicate is fully paid — no free quota.
// Show usage only (no hard limit enforced here).
const VIDEO_DAILY_LIMIT = null;
const VIDEO_MONTHLY_LIMIT = null;

interface QuotaStats {
  image: { today: number; thisMonth: number; dailyLimit: number | null; monthlyLimit: number | null };
  video: { today: number; thisMonth: number; dailyLimit: number | null; monthlyLimit: number | null };
}

export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [imgDay, imgMonth, vidDay, vidMonth] = await Promise.all([
      db.generationLog.count({ where: { kind: 'image', createdAt: { gte: startOfDay } } }),
      db.generationLog.count({ where: { kind: 'image', createdAt: { gte: startOfMonth } } }),
      db.generationLog.count({ where: { kind: 'video', createdAt: { gte: startOfDay } } }),
      db.generationLog.count({ where: { kind: 'video', createdAt: { gte: startOfMonth } } }),
    ]);

    return NextResponse.json({
      image: { today: imgDay, thisMonth: imgMonth, dailyLimit: IMAGE_DAILY_LIMIT, monthlyLimit: IMAGE_MONTHLY_LIMIT },
      video: { today: vidDay, thisMonth: vidMonth, dailyLimit: VIDEO_DAILY_LIMIT, monthlyLimit: VIDEO_MONTHLY_LIMIT },
    } satisfies QuotaStats);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
