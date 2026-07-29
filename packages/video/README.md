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

## The control panel (GUI)

```bash
cd packages/video && pnpm panel     # -> http://localhost:3009
cd packages/video && pnpm panel:stop  # if it was left running in a closed window
```

`pnpm panel` **only works from inside `packages/video`** — this package is outside the
workspace, so pnpm at the repo root cannot see the script. Starting it twice prints
"already running" rather than an EADDRINUSE trace.

Pick a format, pull from production, write the captions, render, preview — no terminal.
Zero dependencies beyond Node, so nothing new enters the lockfile.

**It runs locally, not on Render.** Rendering needs headless Chrome and ~3 minutes of CPU;
the Render instance is 256 MB and this package is deliberately excluded from the deploy
image. The panel drives the same two commands documented below.

The panel flags fights with **under 20 votes**. A 13-vote average is noise next to a
44-vote one, and narrow scopes (one year, one division) hit this constantly at the default
floor of 10 — raise "Min votes" and re-pull before publishing.

## Producing a video (CLI)

**1. Pull the data** (from `packages/backend/`, which owns the Prisma client and the prod
`DATABASE_URL`). This also downloads the fighter headshots into `public/headshots/`:

```bash
cd packages/backend                 # from the REPO ROOT
npx tsx scripts/videoData.ts --format=top-fights --org=UFC --limit=5
cd ../video && pnpm render          # note: ../video, you are in packages/backend now
```

Every pull writes **two** files: `src/data/<format>.json` (archive) and
`src/data/current.json`. The Remotion root imports `current.json`, because a static
import cannot select a file by name at render time — so **the last thing you pulled is
what renders next**. The script prints both paths and the exact next command.

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

**2b. Background photos (optional).** Each fight can carry an action-photo backdrop —
desaturated, ~25% opacity, slow push-in, scrimmed so every number stays readable. The
easiest path is the panel's **Backgrounds** card: pick a file per fight and the server
names it correctly. By hand: drop `public/backgrounds/<fightId>.<jpg|png|webp>` (fightId
from the pull). `scripts/syncBackgrounds.mjs` bakes the folder into a manifest before
every render/studio/still — it is chained into those scripts, so there is nothing to run.

- A fight without a photo gets an ambient-glow treatment, not a flat card.
- The hook uses the **lowest-ranked** fight's photo, heavily blurred — never #1's, the
  payoff must not leak into the opening frame.
- **The photo must be from the fight on the card** — a wrong-fight photo is a factual
  error, same rule as every number on screen.
- **Rights are a per-file editorial decision** and the folder is gitignored (public
  repo): small-org press kits and licensed/CC material first; ask promotions — the small
  ones say yes.

**3. Preview or render:**

```bash
cd packages/video
pnpm studio                          # interactive, scrub the timeline
pnpm render                          # -> out/countdown.mp4
npx remotion still Countdown out/f.png --frame=600
```

## Honesty rules baked in

- The hook headline is **generated per format from a queried count**
  (`corpus.scopeRatedFights`), never hardcoded — "FANS HAVE RATED 7,054 UFC FIGHTS." /
  "...16 CONOR MCGREGOR FIGHTS." The first draft said "fans rated EVERY UFC fight"; only
  7,054 of 8,945 carry a rating. No superlative outruns the table.
- Per-fight vote counts on screen are that fight's real count.
- The slogan is used verbatim, including casing: "Never miss a Good Fight."

## Still manual

- **Voiceover.** Renders are silent. ElevenLabs is not set up. Once it is, drop the MP3 in
  `public/audio/` and add an `<Audio>` track — the beat timings in `src/brand.ts` are
  already the sync map.
- **Captions (burned-in).** Not implemented. TikTok's in-app auto-captions cover the
  TikTok cut; YouTube needs burned-in.
- **Music + SFX.** TikTok trending sound is added in-app after export.
