# @good-fights/video

Programmatic video production for the faceless TikTok/YouTube workstream. Renders the
5-beat countdown from live production data — no hand-editing per video.

Strategy, brand kit and beat spec live in `private/marketing/video-production.md`.
This package is the executable version of §9 of that doc.

## Why this exists

The original plan was to hand-build each video in OpenShot: keyframe every number pop,
every slide, every bar fill, per video, forever. That is a treadmill, and it is the reason
the workstream sat still from 2026-06-03 to 2026-07-26 with zero videos shipped. Here the
5 signature elements are components, so video #2 through #30 are a data swap.

## Not in the pnpm workspace — on purpose

`packages/video` is excluded in the root `pnpm-workspace.yaml` and carries its own
`pnpm-workspace.yaml` so `pnpm install` here does not walk up to the monorepo root.
The render deps therefore never enter the root lockfile and can never slow or break the
Render backend image or the Vercel web build.

```bash
cd packages/video && pnpm install   # its own install, always
```

## Producing a video

**1. Pull the data** (from `packages/backend/`, which owns the Prisma client and the prod
`DATABASE_URL`). This also downloads the fighter headshots into `public/headshots/`:

```bash
cd packages/backend
npx tsx scripts/videoData.ts --format=top-fights --org=UFC --limit=5
```

Other formats — the content engine for the whole evergreen library:

```bash
npx tsx scripts/videoData.ts --format=fighter --fighter="Conor McGregor"
npx tsx scripts/videoData.ts --format=weight-class --weight-class=LIGHTWEIGHT
npx tsx scripts/videoData.ts --format=year --year=2023
```

Ratings are computed live from `FightRating`, never read off the denormalised
`Fight.averageRating` — those aggregates are known to drift, and every number on screen
is a factual claim.

**2. Write the captions.** One visceral line per fight in `src/data/captions.ts`, keyed by
`fightId`. This is the only hand-written part. A fight with no entry falls back to
`"<event> · <finish>"` so a render never blocks, but a fallback line is a flat line.

**3. Preview or render:**

```bash
cd packages/video
pnpm studio                          # interactive, scrub the timeline
pnpm render                          # -> out/countdown.mp4
npx remotion still Countdown out/f.png --frame=600
```

## Honesty rules baked in

- The hook claim reads from `payload.corpus.ratedFights` — a queried number, never
  hardcoded. The first draft said "fans rated EVERY UFC fight"; only 7,054 of 8,945 UFC
  fights carry a rating. No superlative outruns the table.
- Per-fight vote counts on screen are that fight's real count.
- The slogan is used verbatim, including casing: "Never miss a Good Fight."

## Still manual

- **Voiceover.** Renders are silent. ElevenLabs is not set up. Once it is, drop the MP3 in
  `public/audio/` and add an `<Audio>` track — the beat timings in `src/brand.ts` are
  already the sync map.
- **Captions (burned-in).** Not implemented. TikTok's in-app auto-captions cover the
  TikTok cut; YouTube needs burned-in.
- **Music + SFX.** TikTok trending sound is added in-app after export.
