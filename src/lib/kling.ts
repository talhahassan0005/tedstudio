const KLING_API = 'https://api-singapore.klingai.com';

type KlingStatus = 'submitted' | 'processing' | 'succeeded' | 'failed';

interface KlingEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

interface KlingTask {
  id: string;
  status: KlingStatus;
  message?: string;
  outputs?: Array<{
    type: string;
    url: string;
    duration?: string;
  }>;
}

function apiKey(): string {
  const value = process.env.KLING_API_KEY?.trim();
  if (!value) throw new Error('KLING_API_KEY is not configured');
  return value;
}

async function klingFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${KLING_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

async function parse<T>(response: Response): Promise<KlingEnvelope<T>> {
  const body = (await response.json().catch(() => null)) as KlingEnvelope<T> | null;
  if (!response.ok || !body || body.code !== 0) {
    const message = body?.message || `HTTP ${response.status}`;
    throw new Error(`Kling API error: ${message}`);
  }
  return body;
}

export function isKlingConfigured(): boolean {
  return Boolean(process.env.KLING_API_KEY?.trim());
}

export async function createKlingVideo(input: {
  prompt: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
}): Promise<string> {
  const response = await klingFetch('/text-to-video/kling-4.0-flash', {
    method: 'POST',
    body: JSON.stringify({
      prompt: input.prompt,
      settings: {
        duration: input.duration,
        resolution: '720p',
        aspect_ratio: input.aspectRatio,
      },
      options: { watermark_info: { enabled: false } },
    }),
  });
  const result = await parse<KlingTask>(response);
  if (!result.data?.id) throw new Error('Kling did not return a task ID');
  return result.data.id;
}

export async function getKlingTask(taskId: string): Promise<KlingTask> {
  const response = await klingFetch(`/tasks?task_ids=${encodeURIComponent(taskId)}`);
  const result = await parse<KlingTask[]>(response);
  const task = result.data?.[0];
  if (!task) throw new Error('Kling task was not found');
  return task;
}

export async function waitForKlingVideo(
  taskId: string,
  timeoutMs = 9 * 60 * 1000,
): Promise<{ url: string; duration?: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await getKlingTask(taskId);
    if (task.status === 'failed') throw new Error(task.message || 'Kling generation failed');
    if (task.status === 'succeeded') {
      const output = task.outputs?.find((item) => item.type === 'video' && item.url);
      if (!output) throw new Error('Kling completed without a video URL');
      const duration = Number(output.duration);
      return { url: output.url, duration: Number.isFinite(duration) ? duration : undefined };
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Kling generation timed out');
}
