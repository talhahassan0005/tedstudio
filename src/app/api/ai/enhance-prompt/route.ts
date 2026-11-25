import { NextResponse } from 'next/server';

import { enhancePrompt, isWorkersAiConfigured } from '@/lib/workers-ai';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/ai/enhance-prompt
 * body: { prompt: string }
 *
 * Uses Cloudflare Workers AI (Llama 3.1 8B) to expand a simple prompt
 * into a detailed, style-rich image generation prompt.
 */
export async function POST(request: Request) {
  if (!isWorkersAiConfigured()) {
    return NextResponse.json(
      { error: 'Cloudflare Workers AI is not configured.' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { prompt?: string };
    const { prompt } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
    }

    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt too long (max 2000 chars)' }, { status: 400 });
    }

    const enhanced = await enhancePrompt(prompt.trim());
    return NextResponse.json({ enhanced });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
