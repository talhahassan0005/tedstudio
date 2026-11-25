import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ImageIcon, Video } from 'lucide-react';

import { HeroDemo } from '@/components/shared/HeroDemo';
import { Reveal } from '@/components/shared/Reveal';
import { Button } from '@/components/ui/button';

const CAPABILITIES = [
  {
    index: '01',
    title: 'Erase anything',
    body: 'Paint over an object and it is gone — the background is rebuilt behind it, not blurred over.',
    href: '/editor/image',
    tag: 'image',
  },
  {
    index: '02',
    title: 'Inpaint from a prompt',
    body: 'Mask a region, say what belongs there, and the model paints it in at full resolution.',
    href: '/editor/image',
    tag: 'image',
  },
  {
    index: '03',
    title: 'Cut out backgrounds',
    body: 'One click to a clean transparent PNG. No green screen, no pen tool.',
    href: '/editor/image',
    tag: 'image',
  },
  {
    index: '04',
    title: 'Trim & join clips',
    body: 'Drag the handles to cut. Stream-copy keeps it instant; frame-accurate mode when it matters.',
    href: '/editor/video',
    tag: 'video',
  },
  {
    index: '05',
    title: 'Stills → motion',
    body: 'A folder of photos becomes an MP4 with fades or slides, rendered server-side at 1080p.',
    href: '/editor/video',
    tag: 'video',
  },
  {
    index: '06',
    title: 'Score it',
    body: 'Drop in a track, set the level, mix it over the original sound or replace it outright.',
    href: '/editor/video',
    tag: 'video',
  },
];

const SPECS = [
  ['engine', 'ffmpeg + clipdrop + replicate'],
  ['output', 'png · jpg · webp · mp4 1080p'],
  ['masking', 'full-resolution, brush + eraser'],
  ['storage', 'your own cloudinary bucket'],
];

export default function HomePage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Backdrop: hairline grid fading out + film grain. No blob gradients. */}
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />
      <div aria-hidden className="bg-grain pointer-events-none absolute inset-0" />

      {/* ------------------------------------------------------------ */}
      {/* Hero                                                          */}
      {/* ------------------------------------------------------------ */}
      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <p className="rise font-mono text-xs tracking-widest text-primary" style={{ ['--rise-index' as never]: 0 }}>
            TED STUDIO — BROWSER-NATIVE MEDIA EDITOR
          </p>

          <h1
            className="rise mt-5 text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl"
            style={{ ['--rise-index' as never]: 1 }}
          >
            Point at it.
            <br />
            Say the word.
            <br />
            <span className="text-muted-foreground">It&rsquo;s handled.</span>
          </h1>

          <p
            className="rise mt-6 max-w-md text-pretty text-base leading-relaxed text-muted-foreground"
            style={{ ['--rise-index' as never]: 2 }}
          >
            Erase objects, inpaint from a prompt, cut and join clips, turn stills into video and
            score the result — in the browser, with the heavy lifting done server-side.
          </p>

          <div
            className="rise mt-9 flex flex-col gap-3 sm:flex-row"
            style={{ ['--rise-index' as never]: 3 }}
          >
            <Button asChild size="lg" className="group">
              <Link href="/editor/image">
                <ImageIcon />
                Edit Image
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="group">
              <Link href="/editor/video">
                <Video />
                Edit Video
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>

          <p
            className="rise mt-6 font-mono text-[11px] text-muted-foreground"
            style={{ ['--rise-index' as never]: 4 }}
          >
            no account · no watermark · your own storage
          </p>
        </div>

        <Reveal delay={2}>
          <HeroDemo />
          <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">
            live demo — drag the divider
          </p>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Spec strip                                                    */}
      {/* ------------------------------------------------------------ */}
      <section className="relative border-y border-border/60 bg-slate-950/40">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-3 px-4 py-5 sm:px-6 md:grid-cols-4">
          {SPECS.map(([key, value], i) => (
            <Reveal key={key} delay={i} className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
                {key}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={value}>
                {value}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Capabilities — editorial list, not a card grid                */}
      {/* ------------------------------------------------------------ */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
            Six jobs it does well.
            <span className="text-muted-foreground"> Nothing it does halfway.</span>
          </h2>
        </Reveal>

        <ul className="mt-10 divide-y divide-border/60 border-y border-border/60">
          {CAPABILITIES.map((item, i) => (
            <Reveal key={item.index} as="li" delay={Math.min(i, 3)}>
              <Link
                href={item.href}
                className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-5 gap-y-1 py-5 transition-colors hover:bg-accent/30 sm:grid-cols-[64px_220px_1fr_auto] sm:items-center sm:gap-x-8 sm:px-3"
              >
                <span className="font-mono text-xs text-primary/70 transition-colors group-hover:text-primary">
                  {item.index}
                </span>

                <h3 className="text-base font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1">
                  {item.title}
                </h3>

                <p className="col-span-2 col-start-2 text-sm leading-relaxed text-muted-foreground sm:col-span-1 sm:col-start-3">
                  {item.body}
                </p>

                <span className="hidden items-center gap-2 sm:flex">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                    {item.tag}
                  </span>
                  <ArrowUpRight className="h-4 w-4 -translate-x-1 translate-y-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-primary group-hover:opacity-100" />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Closer                                                        */}
      {/* ------------------------------------------------------------ */}
      <section className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="bg-grain relative flex flex-col items-start gap-6 overflow-hidden rounded-2xl border border-border bg-slate-950/60 p-8 sm:p-12">
            <p className="font-mono text-xs tracking-widest text-primary">START HERE</p>
            <h2 className="max-w-lg text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
              The first edit takes about thirty seconds.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Drop a file, paint a mask, hit a button. Both editors share one upload pipeline, so
              a render moves between them without re-uploading.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group">
                <Link href="/editor/image">
                  Edit Image
                  <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="group">
                <Link href="/editor/video">
                  Edit Video
                  <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <p className="mt-10 text-center font-mono text-[11px] text-muted-foreground/60">
          ted studio · next.js 14 · ffmpeg · workers ai · replicate · cloudinary
        </p>
      </section>
    </div>
  );
}
