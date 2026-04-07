# Infrastructure

## Services

| Service | Platform | Purpose |
|---------|----------|---------|
| Backend API | Render (web service) | Fastify API server |
| PostgreSQL | Render (managed DB) | Primary database |
| Landing page | Vercel | goodfights.app static site |
| Web app | Vercel | Next.js app (not public yet) |
| Image storage | Cloudflare R2 | Fighter/event images |
| CI/CD | GitHub Actions | Scraper crons, live trackers |
| Mobile builds | EAS (Expo) | iOS/Android builds |

## Render
- **Backend URL:** https://fightcrewapp-backend.onrender.com
- **DB:** PostgreSQL on Render (Oregon region)
- Event lifecycle cron runs every 5 minutes on Render

## Vercel
- **Landing:** `packages/landing/` -> goodfights.app (auto-deploy on push)
- **Web app:** `packages/web/` -> web-jet-gamma-12.vercel.app

## GitHub Actions
- `ufc-scraper.yml` — daily UFC scrape
- `ufc-live-tracker.yml` — live event tracking
- Triggered via curl (gh CLI not installed on dev machine)

## EAS / Expo
- Channel `production` -> branch `production`
- OTA updates: `eas update --branch production`
- Android: manual `.aab` upload to Play Console (eas submit broken)
- iOS: EAS submit works, but must create new version in App Store Connect

## Cloudflare R2
- Used for fighter profile images and event banners
- Accessed via `services/imageStorage.ts`
