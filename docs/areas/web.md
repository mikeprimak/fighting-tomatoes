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

## Known Issues
- Not launched publicly yet — needs decision on when/how to announce
- Homepage is an events listing, not a marketing page
