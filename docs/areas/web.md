# Web App

## Overview
Next.js web app for browsing fights, events, and ratings in a browser.

**Package:** `packages/web/`
**Framework:** Next.js 16.2, Tailwind v4, React Query
**Hosting:** Vercel
**URL:** https://web-jet-gamma-12.vercel.app (not public-facing yet)
**Vercel project:** `michael-primaks-projects/web`

## Current State (Apr 6, 2026)
- 29 routes, SSR with SEO metadata, dark-only theme
- Functional but **not launched publicly** — landing page (goodfights.app) does not link to it
- Env vars in Vercel: `API_URL` and `NEXT_PUBLIC_API_URL` -> Render backend

## Dev Setup
```bash
cd packages/web
pnpm dev  # port 3000
```

## Deploy
```bash
cd packages/web
vercel --prod
```

## Key Routes
- `/` — Upcoming events (currently the homepage, not a landing page)
- `/events/live` — Live events
- `/events/past` — Past events
- `/fights/top` — Top-rated fights
- `/events/[id]` — Event detail
- `/fighters/[id]` — Fighter profile
- `/search` — Search

## Blog: images, graphics & embeds (added 2026-06-03)

Posts live in `packages/web/src/content/posts/*.md`; rendered via `marked` →
`dangerouslySetInnerHTML` in `app/blog/[slug]/page.tsx`. Raw HTML in markdown
passes through.

- **Tweet/X embeds:** paste `<blockquote class="twitter-tweet"><a href="TWEET_URL"></a></blockquote>`
  into the markdown. `components/TweetEmbeds.tsx` (mounted on the post page) loads
  X `widgets.js` and calls `twttr.widgets.load()` to upgrade it — a `<script>` in
  the markdown can't self-execute through `dangerouslySetInnerHTML`. **Web only:**
  the mobile `/api/editorial` view won't run the widget script. IG works the same
  way but needs its own embed script (not yet added).
- **Branded data graphics:** author an SVG in the house style (bg `#181818`, gold
  `#F5C518`, grey `#9ca3af`, lines `#2e2e2e`; hand logo via relative
  `../good-fights-hand.png`, plus `goodfights.app`), then render to PNG with the
  backend's Puppeteer — `page.goto('file://…svg')` (resolves the relative logo) →
  `svg.screenshot()` at `deviceScaleFactor: 2`. Commit SVG + PNG; reference the
  PNG in markdown so it renders on web **and** mobile. No `sharp`/ImageMagick here.
- **Image licensing rule:** owned / licensed / embedded only. Free source =
  Wikimedia Commons (US DoD/gov = public domain no-credit; CC BY/BY-SA = credit
  the photographer). Never screenshot — that creates a hostable copy that Getty
  bots find. See `docs/daily/2026-06-03.md` for the full rationale.

## Known Issues
- Not launched publicly yet — needs decision on when/how to announce
- Homepage is an events listing, not a marketing page
