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

## Route caching / ISR (added 2026-08-01)

The catalog routes — `/fights/[id]`, `/fighters/[id]`, `/events/[id]`,
`/fights/best/[list]` — are ISR-cached. Each exports **both**:

```ts
export const revalidate = 60;          // 3600 on /fights/best/[list]
export function generateStaticParams() { return []; }
```

**Both exports are required.** On a dynamic segment, `revalidate` alone does
nothing — the route keeps rendering per-request as a function. The Next 16 docs
(`next/dist/docs/…/generate-static-params.md`) state it directly: *"You must
return an empty array from `generateStaticParams` … in order to revalidate
(ISR) paths at runtime."* The empty array prerenders nothing at build time
(the catalog is ~5,900 URLs and the backend may be cold) and caches each path
after its first request.

Before this, every catalog request re-rendered *and* re-hit the Render backend
— which is how a single scraper produced ~9,800 function invocations in six
hours plus a `TypeError: fetch failed` storm (`docs/daily/2026-08-01.md`).

**Never add `headers()`, `cookies()`, or `searchParams` to these routes** — any
of them forces dynamic rendering and silently reverts the caching. `/fighters`
and `/fighters/division/[division]` are dynamic for exactly this reason
(pagination via `searchParams`), and `/download` deliberately so (per-device UA
redirect).

Verify after any change to these routes — read the header off the live URL
twice, don't trust the source:

```bash
curl -sI https://goodfights.app/fights/<slug> | grep -i "x-vercel-cache\|cache-control"
# working: Cache-Control: public, …  and MISS then HIT
# broken:  Cache-Control: private, no-cache, no-store  and MISS every time
```

The revalidate values match the `fetch` revalidate already inside each route,
so page freshness is unchanged. One accepted trade-off: during a backend
outage, the degraded no-data render is cached for up to the TTL.

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
