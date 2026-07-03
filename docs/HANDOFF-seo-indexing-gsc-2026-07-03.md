# HANDOFF — Programmatic SEO: indexing verification + GSC monitoring (2026-07-03)

**Read with:** `docs/plans/programmatic-seo-2026-07-01.md` (the workstream plan; steps 1–6 all ✅)
and `docs/daily/2026-07-03.md` (this session's log).

## Where the workstream stands

Steps 1–6 of the programmatic SEO plan shipped live 2026-07-01 (~5,630 gated URLs:
slugs + 308s, SSR templates, JSON-LD, `shouldIndex` gate, sitemaps, hubs, internal
linking). This session closed the loop between "pages exist" and "Google finds them":

1. **Prod verified end-to-end (2026-07-03), all healthy:**
   - `robots.txt` lists all 4 sitemaps; root sitemap carries hubs + all 18
     `/fights/best/[year]` URLs (the step-6 build-race worry self-healed via ISR).
   - Child sitemaps: 1,130 fighter/division + 618 event + 3,881 fight URLs.
   - Spot-checks: canonical slug URLs, `SportsEvent`+`AggregateRating` JSON-LD,
     semantic `<h1>`, thin pages emit `noindex, follow`.
2. **All 4 sitemaps are submitted in Search Console** (Mike, 2026-07-02). Google
   downloaded each within a day: 0 errors, 0 warnings, submitted counts match prod
   exactly. `indexed=0` as of 2026-07-03 — normal at T+2 days, this is the number
   to watch.
3. **Search Console is now scriptable from the repo** — no GSC UI needed:
   - Script: `packages/backend/scripts/gsc.js` (run from `packages/backend/`):
     - `node scripts/gsc.js sitemaps` — submitted vs indexed, errors, lastDownloaded
     - `node scripts/gsc.js query [days] [page|query|date|country|device]` — search analytics
     - `node scripts/gsc.js submit <sitemapUrl>` — (re)submit
   - Auth: same key as `ga.js` (`packages/backend/ga-service-account.json`).
     One-time setup done 2026-07-03: Search Console API enabled on GCP project
     `fight-app-ba5cd`; `ga-reader@fight-app-ba5cd.iam.gserviceaccount.com` added
     as **Full** user on the `https://goodfights.app/` URL-prefix property.
   - Memory: `reference_gsc_query_script`.

## Baseline (7d search analytics, 2026-06-26 → 07-03)

- Blog carries nearly all search traffic: UFC 329 how-to-watch post 10,642 impr /
  56 clicks (pos 6.9); McGregor–Holloway news post 12,961 impr / 18 clicks;
  home 5,028 impr / 42 clicks.
- Event pages still surface as **UUID URLs** — expected; the 308s migrate them as
  Google recrawls. Watch these flip to slugs.
- First slug-corpus impressions already: `/fights/stefan-struve-vs-jared-rosholt`,
  `/fighters` hub.

## What to do next session

1. **Check indexing progress** (~5 min): from `packages/backend`, run
   `node scripts/gsc.js sitemaps` (indexed counts should climb toward submitted)
   and `node scripts/gsc.js query 28 page` (are fighter/fight/best-of-year pages
   earning impressions? are UUID event URLs being replaced by slugs?).
   Recurring entry lives in `docs/operations/maintenance.md` (biweekly during the
   Jul–Sep rollout, then monthly).
2. **If indexing stalls** (flat near 0 after ~2 weeks): inspect a few URLs in the
   GSC UI (Coverage reasons: "Crawled – not indexed" = quality/thin signal,
   "Discovered – not indexed" = crawl-budget signal), and consider whether the
   `shouldIndex` gate is letting thin pages through (`packages/backend/src/lib/seoIndex.ts`).
3. ~~**Step 7 (next build item, later-tier by design)**~~ — ✅ DONE later on
   2026-07-03 (same day, session 2): long-form `aiPreview` generation is on
   (cron + web "The Story"), fighter facts added (ufcstats backfill + cron
   fill-only extraction + Person JSON-LD). See `docs/daily/2026-07-03.md`.
4. **Minor known gap:** home-page fight sections are still client-only (no SSR
   fight links); event/fighter/year surfaces carry the link graph, so low priority.

## Unrelated open items from this week

- **Askren post not surfaced**: `/blog/ben-askren-comeback-lung-transplant` is live
  but not in SystemConfig `blog_highlights` (admin.html → Blog tab) — add it if it
  should hit the web hero / mobile "Latest" before RAF 11 (July 18).
- **GA4 ↔ Search Console linking** still TODO (`followup_web_analytics_next_steps`),
  separate from the API access above — it's the GA4-property-level link that puts
  GSC queries inside GA4 reports.

## Gotchas for whoever picks this up

- Never make a docs-only commit the tip of a push that needs a web deploy
  (Vercel Ignored-Build-Step cancels it — bit us on step 1).
- `Event.totalRatings` and friends are dead/drifting aggregates
  (`lesson_dataset_aggregates_dishonest`) — the gates and JSON-LD deliberately
  derive from per-fight data; don't "simplify" back to the aggregate columns.
- Web is a **modified Next.js 16** (`packages/web/AGENTS.md`) — read
  `node_modules/next/dist/docs/` before touching routing/metadata.
