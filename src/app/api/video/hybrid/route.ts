import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadFile } from '@/lib/cloudinary';
import { db, recordRender } from '@/lib/db';
import { cleanup, createSlideshow, createWorkDir, downloadTo, mergeVideos, probe } from '@/lib/ffmpeg-helpers';
import { createKlingVideo, isKlingConfigured, waitForKlingVideo } from '@/lib/kling';
import type { GenerateHybridVideoRequest, VideoResponse } from '@/lib/types';
import { generateImage, isWorkersAiConfigured, planHybridVideo } from '@/lib/workers-ai';
import { errorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SCENE_COUNT = 8;
const TARGET_DURATION = 60;
const KLING_DURATION = 5;

const DIMENSIONS = {
  '16:9': { width: 864, height: 480 },
  '9:16': { width: 480, height: 864 },
  '1:1': { width: 480, height: 480 },
} as const;

export async function POST(request: Request) {
  if (!isWorkersAiConfigured()) return NextResponse.json({ error: 'Cloudflare Workers AI is not configured' }, { status: 503 });
  if (!isKlingConfigured()) return NextResponse.json({ error: 'KLING_API_KEY is not configured' }, { status: 503 });
  if (!isCloudinaryConfigured()) return NextResponse.json({ error: 'Cloudinary is required for hybrid video output' }, { status: 503 });

  let workDir: string | null = null;
  try {
    const body = (await request.json()) as Partial<GenerateHybridVideoRequest>;
    const topic = body.topic?.trim();
    const aspectRatio = body.aspectRatio ?? '9:16';
    if (!topic) return NextResponse.json({ error: '`topic` is required' }, { status: 400 });
    if (topic.length > 1500) return NextResponse.json({ error: 'Topic is too long' }, { status: 400 });
    if (!(aspectRatio in DIMENSIONS)) return NextResponse.json({ error: 'Unsupported aspect ratio' }, { status: 400 });

    workDir = await createWorkDir('mediastudio-hybrid-');
    const plan = await planHybridVideo(topic, SCENE_COUNT);

    const klingTaskId = await createKlingVideo({ prompt: plan.videoPrompt, duration: KLING_DURATION, aspectRatio });
    const klingPromise = waitForKlingVideo(klingTaskId);

    const imagePaths: string[] = [];
    for (let index = 0; index < plan.imagePrompts.length; index += 1) {
      const generated = await generateImage({ prompt: plan.imagePrompts[index], steps: 4 });
      const imagePath = path.join(workDir, `scene_${String(index).padStart(2, '0')}.jpg`);
      await fs.writeFile(imagePath, generated.buffer);
      imagePaths.push(imagePath);
      db.generationLog.create({ data: { kind: 'image' } }).catch(() => {});
    }

    const { width, height } = DIMENSIONS[aspectRatio];
    const slideshowPath = path.join(workDir, 'scenes.mp4');
    const transitionOverlap = (SCENE_COUNT - 1) * 0.75;
    const durationPerImage = (TARGET_DURATION - KLING_DURATION + transitionOverlap) / SCENE_COUNT;
    await createSlideshow({ imagePaths, outputPath: slideshowPath, durationPerImage, transition: 'fade', quality: '720p', width, height, fps: 24 });

    const kling = await klingPromise;
    const klingPath = await downloadTo(kling.url, workDir, 'kling.mp4');
    const finalPath = path.join(workDir, 'hybrid.mp4');
    await mergeVideos({ inputPaths: [klingPath, slideshowPath], outputPath: finalPath, workDir, quality: '720p', width, height });

    const info = await probe(finalPath).catch(() => null);
    const uploaded = await uploadFile(finalPath, {
      resource_type: 'video',
      folder: 'mediastudio/video',
      public_id: `hybrid_${Date.now()}`,
    });
    const payload: VideoResponse = {
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: (uploaded as { duration?: number }).duration ?? info?.duration,
      format: uploaded.format,
      bytes: uploaded.bytes,
    };
    db.generationLog.create({ data: { kind: 'video' } }).catch(() => {});
    await recordRender({
      kind: 'slideshow',
      videoUrl: payload.videoUrl,
      publicId: payload.publicId,
      duration: payload.duration,
      bytes: payload.bytes,
      params: { mode: 'hybrid', title: plan.title, topic, aspectRatio, imageCount: SCENE_COUNT, klingSeconds: KLING_DURATION, klingTaskId },
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    if (workDir) await cleanup(workDir);
  }
}
