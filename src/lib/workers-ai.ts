/**
 * Cloudflare Workers AI client. SERVER ONLY — reads the API token.
 *
 * Used for text-to-image generation (FLUX.1 schnell by default). The free
 * tier gives 10,000 neurons per day, which comfortably covers a small app's
 * image generation — that is exactly why this provider was chosen.
 *
 * Docs: https://developers.cloudflare.com/workers-ai/models/
 *
 * Response shapes differ per model and both are handled here:
 *   - flux-1-schnell answers JSON: { result: { image: "<base64>" } }
 *   - stable-diffusion models answer raw PNG bytes
 */

const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export interface WorkersAiImageResult {
  buffer: Buffer;
  mimeType: string;
}

function accountId(): string {
  const value = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!value) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID is not set. Find it on the Cloudflare dashboard (right sidebar) and add it to .env.local.',
    );
  }

  // People paste the whole dashboard URL here; pull the 32-hex ID out of
  // whatever we were given instead of failing with a cryptic routing error.
  const hex = /[0-9a-f]{32}/i.exec(value);
  if (hex) return hex[0];

  throw new Error(
    `CLOUDFLARE_ACCOUNT_ID looks wrong ("${value.slice(0, 40)}…"). It should be the 32-character hex ID from your dashboard URL, not a URL or an email.`,
  );
}

function apiToken(): string {
  const value = process.env.CLOUDFLARE_API_TOKEN;
  if (!value) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is not set. Create one with the "Workers AI" permission and add it to .env.local (server-side only).',
    );
  }
  return value;
}

export function isWorkersAiConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

export function imageModel(): string {
  // `??` is not enough here: an empty `CLOUDFLARE_IMAGE_MODEL=` line in
  // .env.local yields "", which must also fall back to the default.
  const value = process.env.CLOUDFLARE_IMAGE_MODEL?.trim();
  return value || DEFAULT_IMAGE_MODEL;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { errors?: { message?: string }[] };
    const first = parsed.errors?.[0]?.message;
    if (first) return first;
  } catch {
    /* keep the raw body */
  }
  return text.slice(0, 300) || res.statusText;
}

export function inpaintModel(): string {
  return (
    process.env.CLOUDFLARE_INPAINT_MODEL?.trim() ||
    '@cf/runwayml/stable-diffusion-v1-5-inpainting'
  );
}

/**
 * Inpainting — regenerate the white region of the mask from a prompt.
 *
 * The CF API takes the raw file bytes of image and mask as JSON integer
 * arrays, which makes payloads ~4× the file size — callers must downscale
 * before calling (the client sends ≤1024px). Answer is raw PNG bytes.
 */
export async function inpaintWithWorkersAi(args: {
  imageBytes: Buffer;
  maskBytes: Buffer;
  prompt: string;
  /** REQUIRED for non-square images: without width/height the model
   *  silently answers 512x512 and the geometry no longer matches. */
  width?: number;
  height?: number;
  steps?: number;
}): Promise<WorkersAiImageResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/${inpaintModel()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: args.prompt,
      image: Array.from(args.imageBytes),
      mask: Array.from(args.maskBytes),
      // SD wants multiples of 8; callers already round, this is the backstop.
      ...(args.width ? { width: Math.floor(args.width / 8) * 8 } : {}),
      ...(args.height ? { height: Math.floor(args.height / 8) * 8 } : {}),
      num_steps: Math.min(20, Math.max(1, Math.round(args.steps ?? 20))),
      strength: 1,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Workers AI ${res.status}: ${await readError(res)}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    // Some models answer JSON-wrapped base64 like FLUX does.
    const parsed = (await res.json()) as { result?: { image?: string } };
    if (!parsed.result?.image) throw new Error('Workers AI returned no image');
    return { buffer: Buffer.from(parsed.result.image, 'base64'), mimeType: 'image/png' };
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: contentType.startsWith('image/') ? contentType : 'image/png',
  };
}

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

async function runTextModel(system: string, user: string, maxTokens = 512): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/${TEXT_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Workers AI text ${res.status}: ${await readError(res)}`);
  const data = (await res.json()) as { result?: { response?: unknown }; errors?: { message?: string }[] };
  const response = data.result?.response;
  const text =
    typeof response === 'string'
      ? response.trim()
      : response && typeof response === 'object'
        ? JSON.stringify(response)
        : '';
  if (!text) throw new Error(`Workers AI returned no text${data.errors?.[0]?.message ? `: ${data.errors[0].message}` : ''}`);
  return text;
}

/**
 * Enhance an image generation prompt using a Cloudflare LLM.
 * Returns a richer, more descriptive version of the original prompt.
 */
export async function enhancePrompt(prompt: string): Promise<string> {
  return runTextModel(
    'You write excellent AI image prompts. Expand the input with lighting, style, mood, camera angle and quality details. Keep it under 200 words. Return only the enhanced prompt.',
    prompt,
  );
}

export interface HybridVideoPlan {
  title: string;
  videoPrompt: string;
  imagePrompts: string[];
}

export async function planHybridVideo(topic: string, sceneCount = 8): Promise<HybridVideoPlan> {
  const system =
    `You plan coherent short social videos. Return ONLY valid JSON with keys title, videoPrompt, imagePrompts. imagePrompts must contain exactly ${sceneCount} detailed, visually consistent prompts. Each prompt must repeat the same subject/style details so image generation remains coherent. videoPrompt must describe one strong five-second opening shot with camera movement. No markdown fences.`;
  const parsePlan = (raw: string): Partial<HybridVideoPlan> | null => {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Partial<HybridVideoPlan>;
    } catch {
      return null;
    }
  };

  let parsed = parsePlan(
    await runTextModel(system, `Create a one-minute visual story about: ${topic}`, 1800),
  );
  if (!parsed?.videoPrompt || !Array.isArray(parsed.imagePrompts) || parsed.imagePrompts.length < sceneCount) {
    parsed = parsePlan(
      await runTextModel(
        system + ' Keep every prompt under 55 words and ensure the JSON is complete.',
        `Return a compact scene plan for: ${topic}`,
        1800,
      ),
    );
  }

  // A malformed LLM response should never waste the user's attempt. This
  // deterministic fallback still produces a coherent visual sequence.
  if (!parsed?.videoPrompt || !Array.isArray(parsed.imagePrompts) || parsed.imagePrompts.length < sceneCount) {
    const style = 'cinematic realistic photography, coherent subject design, dramatic soft lighting, high detail, no text, vertical social-video composition';
    parsed = {
      title: topic.slice(0, 80),
      videoPrompt: `${topic}. Strong opening shot with smooth forward camera movement, ${style}.`,
      imagePrompts: Array.from(
        { length: sceneCount },
        (_, index) => `${topic}. Story scene ${index + 1} of ${sceneCount}, visually advancing from introduction to a satisfying conclusion, ${style}.`,
      ),
    };
  }
  const finalPlan = parsed as HybridVideoPlan;
  return {
    title: finalPlan.title?.trim() || topic.slice(0, 80),
    videoPrompt: finalPlan.videoPrompt.trim(),
    imagePrompts: finalPlan.imagePrompts.slice(0, sceneCount).map((prompt) => String(prompt).trim()),
  };
}

/**
 * Text-to-image.
 *
 * `steps` is clamped to FLUX schnell's ceiling of 8 (it is a distilled model;
 * more steps are rejected by the API, not just wasteful). `width`/`height`
 * are forwarded only to models that take them — FLUX schnell ignores them
 * and always renders 1024×1024.
 */
export async function generateImage(args: {
  prompt: string;
  steps?: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
}): Promise<WorkersAiImageResult> {
  const model = imageModel();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/${model}`;

  const isFlux = model.includes('flux');
  const body: Record<string, unknown> = { prompt: args.prompt };

  if (isFlux) {
    body.steps = Math.min(8, Math.max(1, Math.round(args.steps ?? 4)));
  } else {
    // Stable Diffusion family: steps/size/negative prompt are all honoured.
    if (args.steps) body.num_steps = Math.min(20, Math.max(1, Math.round(args.steps)));
    if (args.width) body.width = args.width;
    if (args.height) body.height = args.height;
    if (args.negativePrompt) body.negative_prompt = args.negativePrompt;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Workers AI ${res.status}: ${await readError(res)}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  // JSON shape (FLUX): { result: { image: "<base64 jpeg/png>" } }
  if (contentType.includes('application/json')) {
    const parsed = (await res.json()) as {
      result?: { image?: string };
      success?: boolean;
      errors?: { message?: string }[];
    };

    const base64 = parsed.result?.image;
    if (!base64) {
      throw new Error(
        `Workers AI returned no image${parsed.errors?.[0]?.message ? `: ${parsed.errors[0].message}` : ''}`,
      );
    }
    return { buffer: Buffer.from(base64, 'base64'), mimeType: 'image/jpeg' };
  }

  // Binary shape (Stable Diffusion): raw image bytes.
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: contentType.startsWith('image/') ? contentType : 'image/png',
  };
}
