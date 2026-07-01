# Programmatic SEO — Fighter / Event / Fight Pages

**Created:** 2026-07-01. **Status:** step 1 (slugs + redirects) SHIPPED on branch
`feat/seo-slugs` (commit 4be31854, not yet pushed/deployed). Steps 2–7 pending.

> **Why this is a workstream, not a task.** At ~200 active users, direct app
> monetization is dead on arrival (ads/subs/affiliate all need traffic we don't
> have — see `project_affiliate_too_small_revisit`). The web property already
> gets more monthly pageviews than the app has users. Programmatic SEO is the one
> growth lever that (a) compounds — a ranked page earns traffic every fight week
> forever, (b) is a *coding* problem, not a marketing one (fits a solo introvert
> founder), and (c) feeds all three goals at once: installs (web→app CTA), income
> now (web ad/affiliate RPM), and the sale narrative ("web traffic is a
> separately-sellable asset" — `docs/areas/sale-value.md` Posture, 2026-06-17).

## The core insight

**This is a plumbing-and-exposure job, not a content-generation job.** The
expensive part — enriched prose — already exists in the DB from the AI enrichment
workstream. What's missing is the SEO surface: slugs, server-rendered HTML,
a sitemap that scales, structured data, and an indexing gate.

### What already exists (recon 2026-07-01)

Content sitting in the DB, largely unused on web:
- `Fighter.aiProfileSummary` (long-form, explicitly "for SEO/web"; top ~369
  hand-authored Opus quality, rest Haiku cron) + `aiProfile` JSON
  (tldr/careerArc/style/highlights/signatureFights/appeal/whyFansLove/whyFansHate).
- `Fight.aiPostFightSummary` (300–500w recap, explicitly "for SEO") +
  `aiPostFightTags` (methodNarrative/bonuses/callouts/aftermath).
- `Fight.aiPreviewShort` + `aiTags` (stakes/storylines/styleTags/pace).
  **NOTE:** `Fight.aiPreview` (long-form pre-fight) is a reserved column that is
  **never written** — compose upcoming-fight bodies from short+tags, or turn on
  `aiPreview` generation later.
- `Event.aiEventSummary` (card-wide "sell the night" line).
- **Proprietary data nobody else has:** fan ratings, rating distributions
  (`ratings1..ratings10`), hype scores (`FightPrediction.predictedRating`), odds
  (`fighter1Odds`/`fighter2Odds`), broadcasts (`EventBroadcast`).

### What's missing (the actual build)

Web recon (`packages/web`, Next.js 16, App Router):
- **Everything is UUID-keyed** — `/fighters/[id]`, `/events/[id]`, `/fights/[id]`.
  No slugs anywhere in the schema except `Fighter.ufcAthleteSlug` (UFC-only,
  nullable — do not reuse).
- **Content is client-rendered.** Server component seeds; a `'use client'` child
  renders the ratings/tags/reviews. The HTML Google indexes is thin.
- **`sitemap.ts` emits only ~50 events + blog** — no fighters, no fights, capped.
- **No JSON-LD** on fighter/event/fight (blog only). No canonical URLs on them.
- **No index/hub pages** (`/fighters`, `/fights`) — deep pages are orphans with
  no internal links pointing at them.
- Fighter facts are thin: no nationality/height/reach/DOB in schema.

## Architecture

### 1. Slugs (foundational — do first)

Add nullable, unique `slug` to `Fighter`, `Event`, `Fight`. Migration authored
against a **throwaway local Postgres**, then `migrate deploy` (NEVER `migrate
dev`/`db push` against prod — `lesson_prisma_never_migrate_dev_on_prod`).
Backfill with a deterministic slugifier; numeric suffix on collision. Keep UUID
routes working and **301-redirect UUID → slug** to preserve existing link equity.

URL targets:
- `/fighters/islam-makhachev`
- `/events/ufc-329-makhachev-vs-tsarukyan`
- `/fights/makhachev-vs-tsarukyan-ufc-329`

### 2. Route structure

```
/fighters                      NEW index/hub (paginated crawl entry)
/fighters/[slug]               rebuild, SSR
/fighters/division/[wc]        NEW facet hub (/division/lightweight)
/events                        promote from client-only to SSR index
/events/[slug]                 rebuild, SSR, lifecycle content
/fights/[slug]                 rebuild, SSR, lifecycle content
/fights/best/[year]            NEW "best fights of 2025" (our ratings = unique)
```

Hubs matter as much as deep pages: they are the internal-link crawl graph that
rescues deep pages from orphan status.

### 3. Server-render the content

The SEO-critical body (profile summary, post-fight recap, tags, record, ratings)
must render in the **server component** as real HTML. Keep interactive bits
(rate/follow/comment) client-side. Add `generateStaticParams` for top entities
(most-rated fighters, recent+upcoming events); long tail stays on-demand ISR.

### 4. Indexing gate (the quality guarantee)

Generate/compose for everything; only let Google index what clears the bar.
Per-page `shouldIndex` predicate, reusing the 0.5 confidence floors already
enforced app-wide:
- **Fighter** → `aiProfileConfidence ≥ 0.5` AND (`hasRecord` OR `totalRatings>0`).
- **Fight** → COMPLETED with result + `aiPostFightSummary`, OR UPCOMING with
  `aiConfidence ≥ 0.5`.
- **Event** → real card (≥N fights) + `aiEventSummary` or broadcasts.

Failing pages still render (for users who land) but emit `robots: noindex` and
are excluded from the sitemap. **The sitemap = the whitelist of pages that
passed** (generate it from the same predicate). Better 3,000 strong pages than
16,000 half-thin ones — thin pages at scale trigger a sitewide Helpful-Content
demotion.

### 5. Sitemap at scale

Replace the capped `sitemap.ts` with a **sitemap index + chunked children**
(`sitemap/[id].ts`), each ≤50k URLs, generated from `shouldIndex`.
`lastModified` from `aiProfileEnrichedAt` / `aiPostFightEnrichedAt` for accurate
recrawl signals. Highest-leverage plumbing change.

### 6. Structured data (JSON-LD, server-rendered)

- **Fighter** → `Person`/`Athlete`.
- **Event** → `SportsEvent` (reuse the shape already on blog) + broadcasts.
- **Fight** → `SportsEvent` + **`AggregateRating`** (our fan ratings — the money
  one; earns star rich-snippets nobody else's fight page has).

Add `alternates.canonical` (slug URL) on all three (currently blog-only).

### 7. Content composition per template

Lead every page with the proprietary data (ratings/hype/distributions) — it's
both anti-thin insurance and the ranking differentiator. AI recap is commodity;
a fan-rated recap is not.

## Build order (impact per effort)

1. ✅ **Slugs + 301s** — unblocks everything. SHIPPED 2026-07-01 (branch
   `feat/seo-slugs`): nullable `@unique slug` on all three models (migration
   deployed to prod + all rows backfilled, 0 null); `slug` middleware
   (`src/lib/slugHooks.ts`) auto-fills on create/upsert; detail endpoints resolve
   id-or-slug and return `slug`; web pages 308-redirect UUID→slug + canonical +
   pass real UUID to clients. NOT pushed/deployed yet — web behavior unchanged
   until deploy.
2. ✅ **Completed-fight template SSR + JSON-LD `AggregateRating`** — SHIPPED
   2026-07-01. Fight page (`packages/web/src/app/fights/[id]/page.tsx`) now
   server-renders a single semantic `<h1>` (matchup) + `SportsEvent` JSON-LD with
   `AggregateRating` (our fan rating — emitted only when totalRatings>0; the
   rich-snippet-eligible field) + `competitor` Person entries. The recap /
   story / stakes already SSR via the client component's initial render (spoiler-
   free + auth default off server-side). Note: the client's rating *widget* is
   `stats`-gated (client-only) so the numeric rating isn't in SSR HTML, but the
   JSON-LD carries it for Google.
3. ✅ **Scalable sitemap + `shouldIndex` gate** — BUILT + locally verified
   2026-07-01 (not yet deployed). Single source of truth: `packages/backend/src/lib/seoIndex.ts`
   (`fighterIndexWhere`/`eventIndexWhere`/`fightIndexWhere` + `isIndexable`).
   Backend `/api/sitemap/:type` returns the gated whitelist (slug + best
   `lastModified`); the three detail endpoints now return `shouldIndex`. Web:
   `robots.ts` lists 4 sitemaps; root `sitemap.ts` trimmed to static+hubs+blog;
   new `app/{fighters,events,fights}/sitemap.ts` each fetch their type; detail
   pages emit `robots: {index:false, follow:true}` when `shouldIndex===false`.
   **Live corpus (gated):** 947 fighters + 618 events + 3,879 fights ≈ 5,472
   deep pages, all under Google's 50k/file ceiling (one child sitemap per type).
   **Gate change from the original spec:** `Event.totalRatings` is a DEAD field
   (always 0 — `lesson_dataset_aggregates_dishonest`), so the event gate can't
   use it. Instead an event indexes iff it has ≥1 *indexable fight* (Prisma-
   expressible, self-consistent) OR aiEventSummary OR active broadcasts OR is
   upcoming/live. That lifted indexable events from 28 (strict aiEventSummary-only)
   to ~640 without indexing thin/junk legacy cards.
4. **Fighter template SSR + `/fighters` hub + division hubs** — evergreen backbone.
5. **Event lifecycle template** (preview→results swap on one URL).
6. **`fights/best/[year]` + internal linking** hubs↔deep pages.
7. *(Later)* turn on long-form `aiPreview`; enrich fighter facts
   (nationality/physicals) for richer `Person` schema.

## Evergreen strategy (why time-sensitive content still compounds)

- **Entity pages never decay** — fighters, divisions, best-of-year. Steady baseline.
- **Event/fight pages transition on one URL** — "how to watch X" (before) →
  "X results + fan ratings" (after). Same URL accumulates authority through both
  search-intent waves. Never spin a separate results article — that splits equity.
- **Hub pages auto-update** from DB queries; permanent URL, always fresh.

## Monetization tie-in (the "income now" path)

Once web traffic scales via this build: web display ads (Mediavine Journey /
Monumetric — lower floors than the app can hit), broadened affiliate (gear via
Amazon Associates; broadcast affiliate revisit when traffic clears network
floors). Rough targets: ~$3K/mo needs ~150–250k pageviews/mo (web path) vs
~50–100k app MAU — **web is the shorter road to first real revenue.** Keep ads
off the mobile app (extracts ~$0 at this scale, adds friction to growth).

## Caveats

- `packages/web/AGENTS.md` warns this is a **modified Next.js 16** with breaking
  changes vs stock — read `node_modules/next/dist/docs/` before writing
  routing/metadata code.
- Respect the AI-enrichment decision that **article-length mass auto-generation
  is de-scoped** (helpful-content risk + fabrication at length). Compose from
  existing structured fields; keep long-form curated/gated.
- AI disclosure on web SEO pages (per `ai-enrichment.md` open question lean) —
  small "AI-assisted, sourced from […]" line using stored `aiSourceUrls`.

## Related

- `docs/areas/ai-enrichment.md` — the pipeline that feeds this (Use Case G).
- `docs/areas/sale-value.md` — web traffic as a sellable asset.
- `project_affiliate_too_small_revisit`, `lesson_prisma_never_migrate_dev_on_prod`.
