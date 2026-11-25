/**
 * Replicate API client. SERVER ONLY — reads REPLICATE_API_TOKEN.
 *
 * Implemented against the raw REST API so we carry no extra dependency.
 * Docs: https://replicate.com/docs/reference/http
 *
 * NOTE ON MODEL VERSIONS
 * Replicate pins predictions to an immutable version hash, and those hashes
 * change whenever a model is republished. The defaults below are therefore
 * overridable by env var — look the current hash up on the model's page
 * (https://replicate.com/<owner>/<name>/versions) and set:
 *   REPLICATE_PROPAINTER_VERSION=<hash>
 *   REPLICATE_VIDEO_ADD_VERSION=<hash>
 * `runModel()` also accepts `owner/name` (without a hash), in which case
 * Replicate resolves the model's latest version for you.
 */

const API = 'https://api.replicate.com/v1';

export type PredictionStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface Prediction<TOutput = unknown> {
  id: string;
  status: PredictionStatus;
  output: TOutput | null;
  error: string | null;
  logs?: string;
  urls?: { get: string; cancel: string };
  metrics?: { predict_time?: number };
}

function token(): string {
  const value = process.env.REPLICATE_API_TOKEN;
  if (!value) {
    throw new Error('REPLICATE_API_TOKEN is not set. Add it to .env.local (server-side only).');
  }
  return value;
}

export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

/** ProPainter — mask-guided video inpainting / object removal. */
export function propainterVersion(): string {
  // `||` not `??`: an empty env line in .env.local must also fall back.
  return process.env.REPLICATE_PROPAINTER_VERSION?.trim() || 'jd7h/propainter';
}

/** Model used to add/alter content in a video from a prompt. */
export function videoAddVersion(): string {
  return process.env.REPLICATE_VIDEO_ADD_VERSION?.trim() || 'lucataco/hotshot-xl';
}

async function replicateFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  return res;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { detail?: string; title?: string };
    return parsed.detail ?? parsed.title ?? text;
  } catch {
    return text;
  }
}

/**
 * Start a prediction. `model` is either a 64-char version hash or `owner/name`.
 */
export async function createPrediction<TOutput = unknown>(
  model: string,
  input: Record<string, unknown>,
): Promise<Prediction<TOutput>> {
  const isVersionHash = /^[0-9a-f]{40,}$/i.test(model);

  const res = isVersionHash
    ? await replicateFetch('/predictions', {
        method: 'POST',
        body: JSON.stringify({ version: model, input }),
      })
    : await replicateFetch(`/models/${model}/predictions`, {
        method: 'POST',
        body: JSON.stringify({ input }),
      });

  if (!res.ok) {
    throw new Error(`Replicate ${res.status}: ${(await readError(res)).slice(0, 300)}`);
  }
  return (await res.json()) as Prediction<TOutput>;
}

export async function getPrediction<TOutput = unknown>(id: string): Promise<Prediction<TOutput>> {
  const res = await replicateFetch(`/predictions/${id}`);
  if (!res.ok) {
    throw new Error(`Replicate ${res.status}: ${(await readError(res)).slice(0, 300)}`);
  }
  return (await res.json()) as Prediction<TOutput>;
}

export async function cancelPrediction(id: string): Promise<void> {
  await replicateFetch(`/predictions/${id}/cancel`, { method: 'POST' });
}

/**
 * Poll until the prediction settles. Video models are slow, so the default
 * budget is generous — keep it under your platform's function timeout.
 */
export async function waitForPrediction<TOutput = unknown>(
  id: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Prediction<TOutput>> {
  const timeoutMs = opts.timeoutMs ?? 9 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 2500;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const prediction = await getPrediction<TOutput>(id);

    if (prediction.status === 'succeeded') return prediction;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error ?? `Prediction ${prediction.status}`);
    }
    if (Date.now() > deadline) {
      await cancelPrediction(id).catch(() => undefined);
      throw new Error('Replicate prediction timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Create + wait in one call. */
export async function runModel<TOutput = unknown>(
  model: string,
  input: Record<string, unknown>,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<TOutput> {
  const created = await createPrediction<TOutput>(model, input);
  if (created.status === 'succeeded' && created.output !== null) return created.output;
  const done = await waitForPrediction<TOutput>(created.id, opts);
  if (done.output === null) throw new Error('Replicate returned no output');
  return done.output;
}

/**
 * Model outputs are inconsistent: a bare URL, an array of URLs, or an object
 * with a `video`/`output` field. Reduce all of that to one URL.
 */
export function firstUrl(output: unknown): string {
  if (typeof output === 'string') return output;

  if (Array.isArray(output)) {
    for (const item of output) {
      const url = firstUrl(item);
      if (url) return url;
    }
    return '';
  }

  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>;
    for (const key of ['video', 'output', 'url', 'file', 'mp4']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
  }

  return '';
}
