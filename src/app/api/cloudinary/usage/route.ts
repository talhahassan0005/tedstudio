import { NextResponse } from 'next/server';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

export const runtime = 'nodejs';

interface CloudinaryUsage {
  used_percent: number;       // 0-100
  storage_used_gb: number;
  storage_limit_gb: number;
  credits_used_percent: number;
}

export async function GET() {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured' }, { status: 503 });
  }

  try {
    const client = getCloudinary();
    const usage = await (client.api as any).usage();

    const storageUsedBytes: number = usage.storage?.usage ?? 0;
    const storageLimitBytes: number = usage.storage?.limit ?? 26_843_545_600; // 25 GB default
    const usedPercent = storageLimitBytes > 0
      ? Math.round((storageUsedBytes / storageLimitBytes) * 100)
      : 0;

    const creditsUsed: number = usage.credits?.usage ?? 0;
    const creditsLimit: number = usage.credits?.limit ?? 1;
    const creditsPercent = creditsLimit > 0
      ? Math.round((creditsUsed / creditsLimit) * 100)
      : 0;

    const payload: CloudinaryUsage = {
      used_percent: usedPercent,
      storage_used_gb: Math.round((storageUsedBytes / 1_073_741_824) * 100) / 100,
      storage_limit_gb: Math.round((storageLimitBytes / 1_073_741_824) * 100) / 100,
      credits_used_percent: creditsPercent,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
