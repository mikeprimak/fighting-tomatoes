# Handoff — Fully Historic Sweep (results + fighter headshots)

**Created**: 2026-05-03 (after Phase 2 retroactive results system shipped)
**Owner**: separate window, future session
**Scope**: a deep historic backfill across all orgs — especially UFC — that fills in two things:
1. Missing fight winners/methods on old completed events (where the live tracker missed them and the rolling 14-day cron never picked them up)
2. Missing fighter headshots (`Fighter.profileImage IS NULL`) for fighters who haven't been booked into a new fight since the app launched

These are **two distinct problems** that happen to walk the same historic data set. Treat them as such — different code paths, different idempotency models, different per-org gotchas.

---

## What already exists you can lean on

### Result-backfill infrastructure (Phase 2 — shipped 2026-04-28 → 2026-05-03)

Lives in `packages/backend/src/scripts/backfillResults.ts` (orchestrator) + 7 per-org wrappers in `packages/backend/src/services/backfill<Org>Results.ts`. Daily cron at 10:00 UTC runs `.github/workflows/results-backfill.yml`.

The orchestrator is the right shape for a deep historic run — same wrappers, same safety contract, just bigger window:

```bash
gh workflow run results-backfill.yml -f orgs=ufc -f window_days=3650
```

What you get for free:
- Per-org wrappers reuse the live scraper + parser exclusively (single source of truth per org).
- Shared `BackfillOptions` interface in `liveTrackerConfig.ts` — five flags every parser respects:
  - `nullOnlyResults` — only writes when DB field is NULL
  - `skipCancellationCheck` — never retroactively cancels real fights
  - `skipNotifications` — no user pings about old fights
  - `skipStaleLiveReset` — never downgrades COMPLETED → UPCOMING
  - `completionMethodOverride` — stamps `Fight.completionMethod = 'backfill-<org>'` audit trail
- Idempotency: rerunning produces the same result, no churn.
- Coverage: `ufc, bkfc, onefc, oktagon, matchroom, pfl, raf` (all native scrapers) + `tapology` family on the older `tapology-backfill.yml`.

What it does NOT do:
- It does NOT touch `Fighter.profileImage`. Wrappers only update fight-level fields. Headshots are a separate problem.
- Source page availability is the real ceiling: anything from a year+ ago may have URL changes that break the scrape. Run-and-see; failures are non-fatal (orchestrator logs and continues).

**The 6,864-fight skip set** identified on 2026-04-28: COMPLETED fights with `method NOT NULL` but `winner = NULL` and method strings like "Decision/TKO/Submission". A fully historic results sweep is the natural test of how many of those are recoverable from current source pages. Whatever's left after a 3650-day run is the residual that needs a different solution (manual admin entry, archived source readers, etc.).

### Image storage infrastructure

`packages/backend/src/services/imageStorage.ts` exports:
- `uploadImageToR2(sourceUrl, key)` — downloads a remote image, uploads to Cloudflare R2, returns the permanent CDN URL.
- `uploadFighterImage(...)` and `uploadEventImage(...)` — wrappers with the right key format. Confirm the exact signature when you start (this doc was written without re-reading the file end-to-end).
- Skips re-upload if the R2 key already exists (`imageExists` check). So idempotent — running twice doesn't re-pay the bandwidth.

Schema: `Fighter.profileImage String?` (line 141 of `prisma/schema.prisma`).

### Per-org cached scrape data

Most orgs have `packages/backend/scraped-data/<org>/` directories with prior scrape outputs (e.g. `latest-athletes.json`). UFC notably does NOT have a `scraped-data/ufc/` directory in the standard layout — the UFC daily scraper writes its athletes JSON elsewhere (probably alongside `services/scrapeAllUFCData.js` or via memory + `importFighters`). **First task for the UFC headshot pass: locate the actual UFC athletes data file.** It's referenced in `ufcDataParser.ts` (the slug-keyed upsert from 2026-04-28).

---

## What's net-new (you'll have to build)

### A headshot orchestrator (parallel to `backfillResults.ts`)

```
packages/backend/src/scripts/backfillFighterHeadshots.ts
```

Pseudocode:
```typescript
// Find fighters missing headshots
const fighters = await prisma.fighter.findMany({
  where: { profileImage: null },
  // optionally filter by org/sport/last-fought-date
});

// Group by inferable org (via fights.event.scraperType, or a Fighter.scraperType
// column if you add one)

// Dispatch per-org
for (const [org, group] of groups) {
  switch (org) {
    case 'ufc':       await backfillUFCHeadshots(group); break;
    case 'bkfc':      await backfillBKFCHeadshots(group); break;
    // ...
  }
}
```

### Per-org headshot wrappers

Each one needs a way to find a fighter's source-page image URL. Ideas by org:

- **UFC**: cleanest path. `Fighter.ufcAthleteSlug` (added 2026-04-28) is keyed against the UFC athlete page URL. The daily UFC scraper produces an athletes JSON with `imageUrl`. A historic UFC headshot pass is just:
  1. Read the latest UFC athletes JSON
  2. For each `Fighter where ufcAthleteSlug IN (jsonSlugs) and profileImage IS NULL`:
  3. `uploadImageToR2(json[slug].imageUrl, fighter-key)` → set `profileImage`.
  Most efficient because it doesn't require any per-fighter scrape.
- **BKFC**: per-fighter scrape required (bkfc.com fighter pages have headshots). Or check `scraped-data/bkfc/latest-athletes.json` first.
- **ONE FC, Oktagon**: per-fighter or per-event scrape.
- **Tapology family** (RIZIN, KC, DBX, Zuffa, Top Rank, Golden Boy, Gold Star, MVP, Matchroom-via-tapology, RAF-when-via-tapology — though RAF is currently realamericanfreestyle.com): tapology fighter pages have headshots. Generic Tapology headshot scraper.
- **PFL**: pflmma.com fighter pages.
- **Matchroom-native**: matchroom site or Tapology mirror.
- **RAF**: realamericanfreestyle.com fighter detail pages.

### Reusable safety pattern

Mirror the `BackfillOptions` shape from result-backfill — define `HeadshotBackfillOptions` with at least:
- `nullOnlyImages`: only write when `profileImage IS NULL` (never overwrite existing image URLs — they may be manual fixes)
- `skipR2UploadIfExists`: rely on the existing `imageExists` check
- An audit-trail column (`Fighter.imageBackfillSource`?) recording where each headshot came from

---

## Gotchas

1. **Two passes, not one**. Don't try to make the result-backfill wrappers also fetch headshots. The `BackfillOptions` interface is for fight-level write controls, not fighter-level. Mixing concerns will make both harder to reason about and idempotency more fragile.

2. **R2 idempotency**. The `imageExists(key)` check in `imageStorage.ts` is cheap. Use a deterministic key per fighter (e.g. `fighters/<sport>/<fighter-id>.jpg`) so reruns don't pile up.

3. **Source-URL lifetime**. Image hosts often expire URLs (e.g. UFC.com athlete images change query strings on rebuild). Once you upload to R2 with a deterministic key, the original source URL is no longer the source of truth — `Fighter.profileImage` is.

4. **Fighter row identity is brittle for old historic data**. The UFC fighter-rename fork bug (Bug A, 2026-04-25) was a symptom — name composites collide on rename. Newer rows are slug-keyed (`ufcAthleteSlug`); older ones may need backfilling that key first via `src/scripts/backfillFighterSlug.ts`. Run that first against any historic UFC sweep so the lookup keys exist.

5. **Bandwidth cost**. Headshot pass downloads N fighter images and uploads to R2. Render's outbound is generous but not unlimited; if N is huge (tens of thousands of UFC fighters across history), batch and rate-limit.

6. **Result-backfill window default is 14 days**. The shipped cron will not, on its own, sweep historic data — the workflow_dispatch input lets you push it to 3650 (10 years) but the scrapers still time out per-event. So a one-shot historic run will probably need to be split per-org, with longer per-event timeouts, ideally not on the same job that the daily cron uses (don't time out the daily run).

---

## Suggested running order

1. **UFC results** sweep with `window_days=3650`. This exercises the existing wrapper most thoroughly. Note: UFC data is the richest historic source, so this is also the highest-value pass for missing-winner data quality.
2. **UFC headshot** pass — slug-keyed JSON lookup, no scraping. Fast.
3. **Tapology family results** sweep via the older `tapology-backfill.yml` workflow with a wider window.
4. **Tapology family headshots** — generic scraper.
5. **Other native orgs** (BKFC, ONE FC, Oktagon, Matchroom-native, PFL, RAF) — results then headshots, in whatever order makes sense given event frequency.
6. **Audit**: re-query the 6,864-fight skip set after step 1 to see how much was recovered. The remainder is the residual cleanup project.

---

## Files & key references

| File | Why it matters |
|---|---|
| `packages/backend/src/scripts/backfillResults.ts` | Orchestrator template for the new headshot orchestrator |
| `packages/backend/src/services/backfillBKFCResults.ts` | Cleanest per-org wrapper template (also the one closest to "shell out to a JS scraper, read JSON output") |
| `packages/backend/src/config/liveTrackerConfig.ts` | `BackfillOptions` interface — mirror its shape for `HeadshotBackfillOptions` |
| `packages/backend/src/services/imageStorage.ts` | R2 upload + dedup via `imageExists` |
| `packages/backend/src/services/ufcDataParser.ts` | UFC slug-keyed upsert, `extractUfcAthleteSlug` exported. Reusable. |
| `packages/backend/src/scripts/backfillFighterSlug.ts` | Run BEFORE any UFC headshot sweep so lookups have keys |
| `packages/backend/prisma/schema.prisma:141` | `Fighter.profileImage String?` — the column you're filling |
| `.github/workflows/results-backfill.yml` | Workflow shape for historic dispatches; possibly clone for headshot-specific workflow |
| `.github/workflows/tapology-backfill.yml` | The tapology-family results equivalent |
| `docs/daily/2026-04-28.md` | Phase 2 results-system design + the 6,864-fight skip set |
| `docs/daily/2026-05-03.md` | Phase 2 wrap-up + smoke-tests + admin health widget |
| `archive/LIVE-EVENT-MANAGEMENT.md` | Existing per-org scraper documentation |

---

## What I would NOT do

- **Don't** add headshot logic into the existing result-backfill wrappers. Two concerns, two passes.
- **Don't** modify the daily 10:00 UTC cron's `window_days` default. That's the regular health-of-recent-events catch — keep it at 14. Use `workflow_dispatch` for the historic sweeps.
- **Don't** assume the existing wrappers will fill in everything. Some historic events have URLs that no longer resolve. The orchestrator logs `failed=N` per org — that's your honest failure count.
- **Don't** skip running `backfillFighterSlug.ts` before a UFC headshot pass. The slug is the join key; without it, the JSON lookup is name-based and you'll re-trigger Bug A's class of issue.

---

## Open questions for the next window to answer

1. Where does the UFC daily scraper's `latest-athletes.json` actually live? `scraped-data/ufc/` doesn't exist; check `services/scrapeAllUFCData.js`.
2. What's the exact signature of `uploadFighterImage`/`uploadImageToR2` for fighter keys? Read `imageStorage.ts` end-to-end.
3. How many fighters total are missing `profileImage`? Single Prisma count to scope the work: `prisma.fighter.count({ where: { profileImage: null } })`.
4. How many of those missing-image fighters have no fights at all post-2024 vs. some? That tells you if this is a "dormant fighters who haven't been re-scraped" problem (your hypothesis) vs. something deeper.
