# Ted Studio

Ted Studio — AI-powered image & video editor in the browser. Next.js 14 (App Router) + TypeScript + Tailwind, with Konva for canvas editing, FFmpeg for server-side video work, Clipdrop for image AI and Replicate for video AI. Media is stored in your own Cloudinary account.

## Quick start

```bash
npm install                        # also runs `prisma generate`
npx prisma db push                 # creates prisma/dev.db (SQLite, local file)
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

The app boots with no keys at all — pages render, and any feature whose provider is missing returns a clear "not configured" error instead of crashing. The database needs no keys either: it is a local SQLite file.

## Environment variables

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | all uploads, all video output | cloudinary.com → Dashboard |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | client-side delivery URLs | same cloud name, public copy |
| `CLIPDROP_API_KEY` | image inpaint / erase / remove-bg | clipdrop.co/apis |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | image **generation** (free daily quota) | dash.cloudflare.com → Workers AI |
| `REPLICATE_API_TOKEN` | video AI (erase / add) | replicate.com/account |
| `FFMPEG_PATH` | optional | leave blank to use the bundled `ffmpeg-static` binary |
| `REPLICATE_PROPAINTER_VERSION` / `REPLICATE_VIDEO_ADD_VERSION` | optional | pin exact model versions (see `src/lib/replicate.ts`) |

Keys without `NEXT_PUBLIC_` never reach the browser. All AI calls and all FFmpeg work happen in API routes.

## What it does

**Image editor** (`/editor/image`)
- **Generate from a prompt** (FLUX on Cloudflare Workers AI — 10k free neurons/day) straight onto the canvas
- Upload → Cloudinary, edit on a Konva canvas with zoom/pan
- Brush/eraser mask painting at full source resolution
- AI inpaint (mask + prompt), AI erase (mask), one-click background removal — Clipdrop
- Brightness / contrast / saturation / blur / sharpen (live CSS preview, baked on apply/export)
- Crop with aspect-ratio presets
- Merge multiple images: side-by-side, stacked, grid, or free overlay with per-layer opacity/rotation
- Export PNG / JPG / WebP at original resolution, before/after compare

**Video editor** (`/editor/video`)
- Upload clips → Cloudinary, custom HTML5 preview player
- Trim with draggable handles (fast stream-copy, or frame-accurate re-encode)
- Merge clips with drag-to-reorder (`-c copy` fast path, re-encode fallback for mismatched codecs)
- Slideshow from images with fade/slide/cut transitions (FFmpeg `xfade`)
- Add music: volume, loop, replace-or-mix with original audio
- AI erase from video: paint a mask on a captured frame, ProPainter propagates it (Replicate)
- Export MP4 at 720p/1080p via Cloudinary delivery transforms

## Backend & persistence

Prisma + SQLite (`prisma/dev.db`, gitignored). Three models in [prisma/schema.prisma](prisma/schema.prisma):

- **Project** — what the dashboard lists. Created automatically when you upload into either editor.
- **Asset** — every Cloudinary upload, recorded as a media library (`GET /api/assets?type=image|video|audio`).
- **Render** — every finished server-side video operation with its parameters (`GET /api/renders?kind=trim|merge|slideshow|music|ai-erase|ai-add`).

Routes: `GET/POST/DELETE /api/projects`, `GET/PATCH/DELETE /api/projects/:id`. All persistence writes inside the upload/video routes are best-effort — a failed history write logs and never fails the operation itself.

There are no user accounts: this is a single-user local app, so every row belongs to whoever runs it. To add auth later, gate the API routes and add a `userId` column to the three models. To move to Postgres, switch the datasource to `env("DATABASE_URL")` and run `prisma migrate dev` — the models are portable as-is.

```bash
npm run db:push     # sync schema -> database
npm run db:studio   # browse the data in Prisma Studio
```

## Architecture notes

```
src/
  app/api/…        one route per operation; all return { error } JSON on failure
  lib/
    cloudinary.ts  SERVER ONLY — upload/sign helpers
    clipdrop.ts    SERVER ONLY — image AI client
    replicate.ts   SERVER ONLY — prediction create/poll client
    ffmpeg-helpers.ts  SERVER ONLY — command builders, temp-dir lifecycle
  lib/db.ts        SERVER ONLY — Prisma singleton + best-effort recorders
  store/           Zustand stores (image + video editor state)
  hooks/           upload flow + editor operations (mask rasterising, API calls)
  components/      layout / image-editor / video-editor / shared / ui (shadcn-style)
```

- **Masks** are stored as strokes in image-pixel coordinates and rasterised to a black/white PNG at source resolution, so Clipdrop gets a mask that matches the image exactly regardless of zoom.
- **FFmpeg jobs** each get a fresh `mkdtemp` directory and clean it in `finally`. Timeouts kill runaway processes.
- **Long AI video jobs** poll Replicate inside the route (up to ~9 min). On serverless hosts with shorter limits, move to Replicate webhooks + a job store.
- `next.config.mjs` aliases `canvas: false` (Konva's optional native dep) and marks `fluent-ffmpeg`/`ffmpeg-static` as server-external — both are required for the build to work.

## Deploy caveats

- `ffmpeg-static` bundles a binary per platform; on Vercel/Lambda prefer setting `FFMPEG_PATH` to a layer-provided binary, and note the 10s–300s function limits — video routes set `maxDuration` but your plan must allow it.
- Replicate model version hashes rot. If video AI 404s, pin fresh versions via the env vars above.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run start       # serve the build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```
