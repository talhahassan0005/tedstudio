/**
 * FFmpeg command builders. SERVER ONLY.
 *
 * Nothing in this module may be imported from a Client Component — it touches
 * `fs`, `child_process` and a native ffmpeg binary. Every function here is
 * meant to be called from an API route.
 *
 * Binary resolution order:
 *   1. FFMPEG_PATH env var (absolute path to ffmpeg/ffmpeg.exe)
 *   2. the `ffmpeg-static` npm package (bundled, cross-platform)
 *   3. whatever `ffmpeg` is on PATH
 */
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
// ffprobe-static ships a bundled ffprobe binary alongside ffmpeg-static
import ffprobeStatic from 'ffprobe-static';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Transition } from '@/lib/types';

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

let resolved = false;

function resolveBinaries(): void {
  if (resolved) return;

  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) {
    ffmpeg.setFfmpegPath(fromEnv);
    resolved = true;
    return;
  }

  // `ffmpeg-static` resolves to null on platforms it has no binary for.
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }

  // Set ffprobe path from ffprobe-static if available.
  if (ffprobeStatic?.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }

  resolved = true;
}

export function ffmpegCommand(): ffmpeg.FfmpegCommand {
  resolveBinaries();
  return ffmpeg();
}

// ---------------------------------------------------------------------------
// Working directory
// ---------------------------------------------------------------------------

/**
 * A fresh scratch directory per job, inside the OS temp dir.
 * Always pair with `cleanup()` in a `finally` block.
 */
export async function createWorkDir(prefix = 'mediastudio-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Download a remote URL to `dir`, streaming so large videos stay off the heap. */
export async function downloadTo(url: string, dir: string, filename: string): Promise<string> {
  const target = path.join(dir, filename);

  if (url.startsWith('data:')) {
    const base64 = url.slice(url.indexOf(',') + 1);
    await fs.writeFile(target, Buffer.from(base64, 'base64'));
    return target;
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url} (${res.status} ${res.statusText})`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
  return target;
}

export async function writeBase64To(
  base64: string,
  dir: string,
  filename: string,
): Promise<string> {
  const target = path.join(dir, filename);
  const clean =
    base64.startsWith('data:') && base64.includes(',')
      ? base64.slice(base64.indexOf(',') + 1)
      : base64;
  await fs.writeFile(target, Buffer.from(clean, 'base64'));
  return target;
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export function probe(input: string): Promise<ProbeResult> {
  resolveBinaries();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      const video = data.streams.find((s) => s.codec_type === 'video');
      const audio = data.streams.find((s) => s.codec_type === 'audio');
      resolve({
        duration: Number(data.format.duration ?? 0),
        width: video?.width,
        height: video?.height,
        hasAudio: Boolean(audio),
        videoCodec: video?.codec_name,
        audioCodec: audio?.codec_name,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunOptions {
  onProgress?: (percent: number) => void;
  /** Hard ceiling in ms; the process is killed when exceeded. */
  timeoutMs?: number;
}

/** Execute a prepared command, rejecting with ffmpeg's stderr on failure. */
export function run(command: ffmpeg.FfmpegCommand, options: RunOptions = {}): Promise<void> {
  const { onProgress, timeoutMs = 10 * 60 * 1000 } = options;

  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    command
      .on('stderr', (line: string) => {
        // Keep only the tail — ffmpeg is extremely verbose.
        stderr = `${stderr}\n${line}`.slice(-4000);
      })
      .on('progress', (p) => {
        if (onProgress && typeof p.percent === 'number') {
          onProgress(Math.max(0, Math.min(100, p.percent)));
        }
      })
      .on('error', (err: Error) => {
        finish(new Error(`ffmpeg failed: ${err.message}\n${stderr.trim()}`));
      })
      .on('end', () => finish());

    timer = setTimeout(() => {
      command.kill('SIGKILL');
      finish(new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    command.run();
  });
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const QUALITY_PRESETS = {
  '720p': { width: 1280, height: 720, videoBitrate: '2500k' },
  '1080p': { width: 1920, height: 1080, videoBitrate: '5000k' },
} as const;

export type QualityKey = keyof typeof QUALITY_PRESETS;

const H264_OUTPUT = [
  '-c:v libx264',
  '-preset medium',
  '-crf 22',
  '-pix_fmt yuv420p',
  '-movflags +faststart',
];

// ---------------------------------------------------------------------------
// Operation: slideshow from images
// ---------------------------------------------------------------------------

function normaliseChain(index: number, width: number, height: number, fps: number): string {
  return (
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${fps},format=yuv420p[v${index}]`
  );
}

/**
 * Build an MP4 slideshow from still images.
 *
 * `fade` and `slide` are implemented with the `xfade` filter, which consumes
 * `transitionDuration` seconds of overlap between each pair — so the final
 * runtime is `n*duration - (n-1)*transitionDuration`.
 */
export async function createSlideshow(args: {
  imagePaths: string[];
  outputPath: string;
  durationPerImage: number;
  transition: Transition;
  quality?: QualityKey;
  fps?: number;
  width?: number;
  height?: number;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const {
    imagePaths,
    outputPath,
    durationPerImage,
    transition,
    quality = '1080p',
    fps = 30,
    onProgress,
    width: requestedWidth,
    height: requestedHeight,
  } = args;

  if (imagePaths.length === 0) throw new Error('No images supplied');

  const preset = QUALITY_PRESETS[quality];
  const width = requestedWidth ?? preset.width;
  const height = requestedHeight ?? preset.height;
  const duration = Math.max(0.5, durationPerImage);
  const command = ffmpegCommand();

  for (const image of imagePaths) {
    command.input(image).inputOptions(['-loop 1', `-t ${duration}`]);
  }

  // A single image needs no concat/xfade graph at all.
  if (imagePaths.length === 1) {
    command
      .complexFilter([normaliseChain(0, width, height, fps)], ['v0'])
      .outputOptions([...H264_OUTPUT, '-r', String(fps), '-t', String(duration)])
      .output(outputPath);
    return run(command, { onProgress });
  }

  const filters = imagePaths.map((_, i) => normaliseChain(i, width, height, fps));

  if (transition === 'none') {
    const inputs = imagePaths.map((_, i) => `[v${i}]`).join('');
    filters.push(`${inputs}concat=n=${imagePaths.length}:v=1:a=0[vout]`);
  } else {
    // xfade's overlap must stay shorter than the clips it joins.
    const td = Math.min(0.75, duration * 0.4);
    const effect = transition === 'slide' ? 'slideleft' : 'fade';

    let current = 'v0';
    let offset = duration - td;

    for (let i = 1; i < imagePaths.length; i += 1) {
      const out = i === imagePaths.length - 1 ? 'vout' : `x${i}`;
      filters.push(
        `[${current}][v${i}]xfade=transition=${effect}:duration=${td.toFixed(3)}:` +
          `offset=${offset.toFixed(3)}[${out}]`,
      );
      current = out;
      offset += duration - td;
    }
  }

  command
    .complexFilter(filters, ['vout'])
    .outputOptions([...H264_OUTPUT, '-r', String(fps)])
    .output(outputPath);

  return run(command, { onProgress });
}

// ---------------------------------------------------------------------------
// Operation: trim
// ---------------------------------------------------------------------------

/**
 * Cut `[startTime, endTime]` out of a video.
 *
 * Stream-copy is attempted first (near-instant) but can only cut on keyframes,
 * so the result may start slightly early. `accurate: true` re-encodes to land
 * exactly on the requested boundaries.
 */
export async function trimVideo(args: {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  accurate?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { inputPath, outputPath, startTime, endTime, accurate = false, onProgress } = args;

  const start = Math.max(0, startTime);
  if (endTime <= start) {
    throw new Error('endTime must be greater than startTime');
  }

  const build = (copy: boolean) =>
    ffmpegCommand()
      .input(inputPath)
      // -ss before -i seeks fast; with a re-encode we want it after, for accuracy.
      .inputOptions(copy ? [`-ss ${start}`] : [])
      .outputOptions(
        copy
          ? [`-to ${(endTime - start).toFixed(3)}`, '-c copy', '-avoid_negative_ts make_zero']
          : [`-ss ${start}`, `-to ${endTime}`, ...H264_OUTPUT, '-c:a aac', '-b:a 192k'],
      )
      .output(outputPath);

  if (accurate) return run(build(false), { onProgress });

  try {
    await run(build(true), { onProgress });
  } catch {
    // Stream-copy fails on some containers/codecs — fall back to re-encoding.
    await run(build(false), { onProgress });
  }
}

// ---------------------------------------------------------------------------
// Operation: merge / concat
// ---------------------------------------------------------------------------

/** Quote a path for ffmpeg's concat list file. */
function concatListEntry(filePath: string): string {
  const posix = filePath.replace(/\\/g, '/');
  const escaped = posix.split("'").join("'\\''");
  return `file '${escaped}'`;
}

/**
 * Concatenate clips.
 *
 * The concat *demuxer* with `-c copy` is tried first; it only works when every
 * clip shares codec, resolution and timebase. Mismatched clips fall back to
 * `mergeVideosTolerant`, which normalises everything through a re-encode.
 */
export async function mergeVideos(args: {
  inputPaths: string[];
  outputPath: string;
  workDir: string;
  quality?: QualityKey;
  width?: number;
  height?: number;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { inputPaths, outputPath, workDir, quality = '1080p', width, height, onProgress } = args;

  if (inputPaths.length === 0) throw new Error('No clips supplied');
  if (inputPaths.length === 1) {
    await fs.copyFile(inputPaths[0], outputPath);
    return;
  }

  // --- Attempt 1: concat demuxer, stream copy (fast path) ---
  const listPath = path.join(workDir, 'concat-list.txt');
  await fs.writeFile(listPath, `${inputPaths.map(concatListEntry).join('\n')}\n`, 'utf8');

  try {
    const command = ffmpegCommand()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath);
    await run(command, { onProgress });
    return;
  } catch {
    /* fall through to the re-encoding path */
  }

  // --- Attempt 2: concat filter, re-encode to a common format ---
    await mergeVideosTolerant({ inputPaths, outputPath, quality, width, height, onProgress });
}

/**
 * Merge by re-encoding through the concat filter. Handles clips with differing
 * resolutions/codecs, and clips with no audio track at all.
 */
export async function mergeVideosTolerant(args: {
  inputPaths: string[];
  outputPath: string;
  quality?: QualityKey;
  width?: number;
  height?: number;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { inputPaths, outputPath, quality = '1080p', onProgress } = args;
  const preset = QUALITY_PRESETS[quality];
  const width = args.width ?? preset.width;
  const height = args.height ?? preset.height;

  const probes = await Promise.all(inputPaths.map((p) => probe(p)));

  const command = ffmpegCommand();
  for (const input of inputPaths) command.input(input);

  // One silent source we can borrow for any clip that has no audio track.
  const silenceIndex = inputPaths.length;
  command.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputOptions(['-f lavfi']);

  const filters: string[] = [];
  const labels: string[] = [];

  inputPaths.forEach((_, i) => {
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[cv${i}]`,
    );
    if (probes[i].hasAudio) {
      filters.push(
        `[${i}:a]aresample=async=1:first_pts=0,` +
          `aformat=sample_rates=48000:channel_layouts=stereo[ca${i}]`,
      );
    } else {
      filters.push(
        `[${silenceIndex}:a]atrim=duration=${Math.max(0.1, probes[i].duration).toFixed(3)},` +
          `asetpts=PTS-STARTPTS[ca${i}]`,
      );
    }
    labels.push(`[cv${i}][ca${i}]`);
  });

  filters.push(`${labels.join('')}concat=n=${inputPaths.length}:v=1:a=1[vout][aout]`);

  command
    .complexFilter(filters, ['vout', 'aout'])
    .outputOptions([...H264_OUTPUT, '-c:a aac', '-b:a 192k'])
    .output(outputPath);

  await run(command, { onProgress });
}

// ---------------------------------------------------------------------------
// Operation: add music
// ---------------------------------------------------------------------------

/**
 * Lay an audio track over a video.
 *
 * `-shortest` stops at whichever stream ends first. When `keepOriginalAudio`
 * is set and the clip already has sound, the two are mixed instead of replaced.
 */
export async function addMusic(args: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  volume: number;
  keepOriginalAudio?: boolean;
  loopAudio?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const {
    videoPath,
    audioPath,
    outputPath,
    volume,
    keepOriginalAudio = false,
    loopAudio = false,
    onProgress,
  } = args;

  const vol = Math.max(0, Math.min(2, volume));
  const sourceHasAudio = (await probe(videoPath)).hasAudio;

  const command = ffmpegCommand().input(videoPath);
  command.input(audioPath).inputOptions(loopAudio ? ['-stream_loop -1'] : []);

  const filters =
    keepOriginalAudio && sourceHasAudio
      ? [
          `[1:a]volume=${vol}[music]`,
          '[0:a]volume=1.0[orig]',
          '[orig][music]amix=inputs=2:duration=first:dropout_transition=2[aout]',
        ]
      : [`[1:a]volume=${vol}[aout]`];

  command
    .complexFilter(filters, ['aout'])
    .outputOptions([
      '-map 0:v',
      '-map [aout]',
      '-c:v copy',
      '-c:a aac',
      '-b:a 192k',
      '-shortest',
      '-movflags +faststart',
    ])
    .output(outputPath);

  await run(command, { onProgress });
}

// ---------------------------------------------------------------------------
// Operation: transcode for export
// ---------------------------------------------------------------------------

export async function transcode(args: {
  inputPath: string;
  outputPath: string;
  quality: QualityKey;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { inputPath, outputPath, quality, onProgress } = args;
  const { width, height, videoBitrate } = QUALITY_PRESETS[quality];

  const command = ffmpegCommand()
    .input(inputPath)
    .outputOptions([
      `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
      ...H264_OUTPUT,
      `-b:v ${videoBitrate}`,
      '-c:a aac',
      '-b:a 192k',
    ])
    .output(outputPath);

  await run(command, { onProgress });
}

/** Pull a single frame out of a video — used to seed the AI mask editor. */
export async function extractFrame(args: {
  inputPath: string;
  outputPath: string;
  atSecond: number;
}): Promise<void> {
  const command = ffmpegCommand()
    .input(args.inputPath)
    .inputOptions([`-ss ${Math.max(0, args.atSecond)}`])
    .outputOptions(['-frames:v 1', '-q:v 2'])
    .output(args.outputPath);
  await run(command, { timeoutMs: 60_000 });
}
