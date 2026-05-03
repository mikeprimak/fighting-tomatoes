# Broadcast Discovery

Weekly job that finds new broadcaster deals and changes for active promotions, then writes findings to a review inbox. Admin approves/rejects — nothing auto-applies.

## Files
- `searchBrave.ts` — Brave Search API wrapper.
- `fetchHowToWatch.ts` — fetch + extract main text from official "how to watch" pages.
- `extract.ts` — Claude Haiku 4.5 extraction with prompt caching, returns structured findings.
- `diff.ts` — classify findings as `NEW` / `CONFIRMED` / `CHANGED` against current defaults.
- `persist.ts` — write to `BroadcastDiscovery`, dedupe against rejections from the last 90 days.
- `run.ts` — orchestrator. Iterates active promotions × regions, skipping ones whose default was verified recently.

## Cron
- `.github/workflows/broadcast-discovery.yml` — Mondays 09:00 UTC.
- Manual: trigger via GitHub Actions UI, or `POST /api/admin/broadcast-discoveries/run` (admin auth).
- CLI: `npx ts-node packages/backend/scripts/run-broadcast-discovery.ts`.

## Required env / secrets
- `DATABASE_URL` — Render external URL
- `BRAVE_API_KEY` — https://api.search.brave.com (free tier 2k queries/mo)
- `ANTHROPIC_API_KEY` — Claude Haiku 4.5 extraction

## Cost
~$1 per weekly run (~50 Brave queries × $0.005 + ~50 Haiku calls × ~$0.001 with prompt caching). Annual ~$50.

## Tuning knobs
- `DISCOVERY_PROMOTIONS=UFC,ONE` — limit scope
- `DISCOVERY_REGIONS=GB,AU` — limit regions
- `DISCOVERY_SKIP_FRESH_DAYS=14` — re-verify only when default is older than N days
- `DISCOVERY_MAX_QUERIES=200` — Brave query cap per run

## Admin workflow
1. Inbox at `GET /api/admin/broadcast-discoveries?status=PENDING`
2. Apply: `PATCH /admin/broadcast-discoveries/:id` with `{action: "APPLY"}` (optional `tier`, `channelSlug`)
3. Reject: `{action: "REJECT", reviewNote: "..."}` (suppresses re-suggestion 90 days)
4. Mark dup: `{action: "DUPLICATE"}`

## Confidence floor
Findings below 0.4 confidence are dropped at the LLM step. Findings ≥0.9 (official press releases) can be auto-applied UI-side via a one-click button — admin still confirms.

## Adding a new promotion's how-to-watch URL
Edit `HOW_TO_WATCH_URLS` in `fetchHowToWatch.ts`. Only add if the page is reliably structured and updated.
