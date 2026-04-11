# Handoff: ONE FC scraper cleanup — open tasks from 2026-04-10 session

This document is a self-contained handoff for a fresh Claude Code session. It assumes zero memory of what happened in the session that produced it. Read `docs/daily/2026-04-10.md` for the full story — especially the "Three compounding ONE FC scraper bugs surfaced by the ONE 150 follow-up" section — before starting any of these tasks.

## Context you need before starting

On 2026-04-10, three stacked bugs were found and fixed in the ONE FC scrapers:

1. **Hero duplicate**: `onefc.com/events/*` pages JS-render a "Next Event" hero section containing a full `.event-matchup`-classed duplicate of the headline fight, inside a `.box-post-event` / `.event-live-status` / `.status-matchup` ancestor chain. Both scrapers were picking it up and either dedup'ing the real fight out (live scraper) or shifting `orderOnCard` by one (daily scraper). Fixed by rejecting any `.event-matchup` with `.closest('.box-post-event, .event-live-status, .status-matchup')`.

2. **Per-face sticker scoping**: `oneFCLiveScraper.ts` had four "methods" to detect the winning fighter. Method 1 used `face1.closest('[class*="matchup"]').querySelector('.sticker.is-win')` which resolves to `.event-matchup` and then finds the first winner sticker anywhere inside, regardless of which face owns it. Both `fighterAWon` and `fighterBWon` always got set to `true` for every completed fight, and downstream `fighterAWon ? 'A' : 'B'` defaulted every result to side A. Fixed by rewriting with per-face scoped `face1?.querySelector('.sticker.is-win')` / `face2?.querySelector(...)`.

3. **Rittidet duplicate fighter rows**: `parseOneFCFighterName` in `oneFCDataParser.ts` prefers URL slug over display text. `/athletes/rittidet/` is single-word so it stored `{firstName: '', lastName: 'Rittidet'}`, but another event had stored him correctly as `{firstName: 'Rittidet', lastName: 'Lukjaoporongtom'}`. Two rows existed. Merged manually via a one-off script that reassigned FK references then deleted the broken row.

**Code files touched** (not yet committed — they are in the working tree):
- `packages/backend/src/utils/fighterMatcher.ts` — `@ts-nocheck` added (fighterAlias is a dead model from a prior Prisma schema, blocks compilation)
- `packages/backend/tsconfig.tracker.json` — **new file**, minimal tsconfig with DOM lib + limited include list for live-tracker files only
- `.github/workflows/onefc-live-tracker.yml` — build step now runs `npx tsc --project tsconfig.tracker.json` instead of the broken `pnpm build`
- `packages/backend/src/services/oneFCLiveScraper.ts` — hero-duplicate filter + per-face sticker rewrite
- `packages/backend/src/services/scrapeAllOneFCData.js` — same hero-duplicate filter

**Data fixed**: ONE 150 only. All 14 fights now have correct per-side winners, `orderOnCard` 1..14, Rittidet row merged. Every other ONE FC event in the DB is still likely broken.

## Task 0 (do this first): commit the in-progress code changes

The code fixes from the 2026-04-10 session are in the working tree but **not committed**. Before starting any other task, review the diff and commit them. Suggested groupings:

- One commit for the tracker CI fix (`fighterMatcher.ts`, `tsconfig.tracker.json`, `onefc-live-tracker.yml`) — message like "Fix ONE FC live tracker build: bypass broken routes via focused tsconfig"
- One commit for the scraper bug fixes (`oneFCLiveScraper.ts`, `scrapeAllOneFCData.js`) — message like "Fix ONE FC scrapers: reject hero-duplicate matchups + per-face sticker detection"

Both commits should reference `docs/daily/2026-04-10.md` for the full narrative. Don't push without asking the user.

## Task 1: backfill historical ONE FC event winners

**Why**: bug 2 above (per-face sticker scoping) has been silently producing wrong winners for every ONE FC event since the live tracker was introduced. Every ONE FC fight in the DB that was written by the live tracker almost certainly has `winner = fighter1.id` regardless of who actually won — roughly half of those winners are wrong. Users are seeing incorrect results in the app.

**Scope**: all events with `promotion = 'ONE'` and `scraperType = 'onefc'` and `eventStatus = 'COMPLETED'` that have fights with winners set by the live tracker.

**What the task requires**:

1. **Query** all candidate events:
   ```sql
   SELECT id, name, date, "ufcUrl"
   FROM "Event"
   WHERE "scraperType" = 'onefc'
     AND "eventStatus" = 'COMPLETED'
     AND "ufcUrl" IS NOT NULL
   ORDER BY date DESC;
   ```
   Expect ~50-100 rows depending on how long ONE FC tracking has been live.

2. **Decide which events to re-scrape safely**. Two risks:
   - **Manual admin edits**: if an admin used `/admin.html` to correct a winner, the re-scrape would clobber it. Check the `completionMethod` field on the fight — values like `'admin'`, `'manual'`, `'hand-edit'` should be skipped. The default from the tracker is `'scraper'` or `null` in older rows. Conservatively: only re-scrape fights where `completionMethod IS NULL OR completionMethod = 'scraper'`.
   - **Old ONE FC events may have been renamed or delisted**. The ONE FC `ufcUrl` might 404. The re-scrape should handle that gracefully (log + skip, not crash).

3. **Write a backfill script** — `packages/backend/scripts/backfill-onefc-winners.ts` (new). It should:
   - Accept a `--dry-run` flag that logs what would change without writing
   - Accept a `--limit=N` flag to test against a few events first
   - Accept an optional `--event-id=<uuid>` for single-event runs
   - For each event: clear `winner`, `method`, `round`, `time` on fights where `completionMethod IS NULL OR completionMethod = 'scraper'` (leave `fightStatus` alone — already COMPLETED)
   - Call the existing live tracker logic directly (`parseOneFCLiveData` from `oneFCLiveParser.ts` after a fresh `OneFCLiveScraper(event.ufcUrl).scrape()`) against each event to repopulate winners
   - Log before/after counts per event: "Event X: cleared 12 fights, tracker set 11 winners, 1 fight unchanged (no sticker found)"
   - Aggregate log at the end: "Processed 47 events, updated 312 fights, 18 fights needed manual review (no result on ONE FC page)"

4. **Reference the repair pattern from the 2026-04-10 session**. The one-off `fix-one150.js` script (now deleted) demonstrated the clear-then-retrack approach. The backfill script is that same pattern but in a loop with safety flags. Find the pattern in the daily doc if you need to reconstruct it.

5. **Build via `tsconfig.tracker.json`** (the focused tsconfig created in the session) — add `src/scripts/backfill-onefc-winners.ts` to its `include` list. Don't try to use `pnpm build`, it's still broken.

6. **Run in stages**: first `--dry-run --limit=5` on recent events, verify the diff makes sense, then `--limit=5` for real on those 5, verify in the app, then full backfill. Commit the script but DO NOT run it against prod without checking with the user first.

7. **Expected outcome**: roughly half of historical ONE FC fight winners flip from fighter1 to fighter2. That's the correct result — the old data was structurally wrong.

**Gotchas**:
- Rate-limiting on ONE FC: don't hammer their site. The live tracker uses puppeteer with `networkidle2` — that's ~3-5 seconds per event page. 47 events = ~5 minutes total, fine.
- The `seenFights` dedup in `oneFCLiveScraper.ts` uses fighter name signatures. If multiple events share the same fighters (rematches), the signature will collide across events — but the scraper scope is a single event page so this shouldn't matter. Just verify in the first dry run.
- Old events (pre-2024) may have totally different page layouts. If the scraper can't parse them, log + skip, don't crash.

## Task 2: fix the single-word-URL-slug fighter name bug

**Why**: Rittidet Lukjaoporongtom and Nuapet Torfunfarm (currently stored as "Nuapet Tded99") are known broken. Any ONE FC fighter whose URL slug is shorter than their real display name has the same issue. The ONE 150 daily scraper output shows at least these two; there are probably more across other events.

**What the task requires**:

1. **Identify the authoritative source for full names**. Two options on ONE FC pages:
   - **Stats table text**: every `.event-matchup` has a `.stats table tr.vs td a` with the full text like `"Rittidet Lukjaoporongtom"`. Accessible in the current scraper's `page.evaluate`.
   - **JSON-LD `<script type="application/ld+json">`**: the event page has a full `performer` array with every fighter's display name AND nickname in quotes (e.g. `"Dalian \"Deadly\" Dawody"`). This is the cleanest source because it's structured, has nicknames, and is stable across ONE FC's page layout changes.

   **Recommendation**: use JSON-LD. Parse it once per event, build a fighter-name map keyed by either URL or a canonical signature, then use that as the primary name source in both `scrapeAllOneFCData.js` and `oneFCLiveScraper.ts`. Fall back to URL slug only if JSON-LD is missing or the specific fighter isn't in the `performer` array.

2. **Update `parseOneFCFighterName`** in `oneFCDataParser.ts`:
   - Accept an optional `fullName` parameter (from JSON-LD or stats table)
   - If `fullName` is present and has more words than the URL slug's parts, use `fullName`
   - Extract nickname from quoted substrings (e.g. `"Dalian \"Deadly\" Dawody"` → `firstName='Dalian', lastName='Dawody', nickname='Deadly'`)
   - Keep URL slug fallback for fighters not in JSON-LD

3. **Update the daily scraper** (`scrapeAllOneFCData.js`):
   - Before the matchup loop, parse the JSON-LD and build a fighter map: `{athleteUrl → {displayName, nickname}}`. The JSON-LD `performer` array doesn't include URLs, only names, so you'll need to match by name — for each `.event-matchup` loop iteration, look up the fighter by the versus-text name or the athlete-URL slug's normalized form against the JSON-LD names.
   - Pass `fullName` into the scraped data structure
   - The parser reads it

4. **Update the live scraper** (`oneFCLiveScraper.ts`) similarly. Note: the live scraper's output goes directly to the live parser's `findFightByFighters`, which matches by last name. If you rename fighters to full names, last names change, and the tracker might stop matching existing DB rows. Handle this carefully:
   - Check if any ONE FC fighters in the DB currently have mismatched names that would break tracker matching after the name fix
   - Pre-run a dry backfill pass to find and merge/rename affected fighter rows BEFORE deploying the scraper fix
   - OR: make the name fix opt-in via a feature flag so old matching still works during transition

5. **Run a rename-and-merge backfill**. Use the `fix-rittidet.js` pattern from the 2026-04-10 daily doc — for each currently-broken fighter row `{firstName: '', lastName: X}`:
   - Query JSON-LD or stats-table for the full name on the most recent event where this fighter appeared
   - If a full-name row already exists, merge (reassign `fighter1Id`, `fighter2Id`, `winner` references from broken to full, delete broken)
   - If no full-name row exists, rename in place
   - Preserve all fighter-level stats, images, ratings

6. **Spot-check in the app** after the backfill: load a few ONE FC events on mobile + web, verify fighter names are full.

**Gotchas**:
- Fighter rows have a `firstName_lastName` compound unique key. Any rename that collides with an existing row will throw — catch it and merge instead.
- `Fighter` table likely has FK references from `FightRating`, `Review`, `Tag`, maybe others. Find ALL FK references before deleting any row. Use Prisma introspection: `prisma.fighter.findUnique({ include: { _count: { select: { fights1: true, fights2: true, wonFights: true, ratings: true, reviews: true, tags: true } } } })`.
- Fighter `slug` field (if it exists) might also need updating.

## Task 3: audit other live parsers for the same per-face scope bug

**Why**: the method-1 sticker-detection bug in `oneFCLiveScraper.ts` was a copy-paste target. Other live parsers likely have the same `face1.closest('[class*="...]"').querySelector(...)` anti-pattern.

**What the task requires**:

1. **Grep for the anti-pattern** in all live parsers/scrapers:
   ```
   packages/backend/src/services/*LiveScraper.ts
   packages/backend/src/services/*LiveParser.ts
   ```
   Look for `.closest(` followed by a broad `[class*=` selector, or any pattern where face1 and face2 iterations both query the same parent container for stickers/result markers.

2. **Cross-check winner-side distribution in the DB** for each promotion:
   ```sql
   SELECT e.promotion,
          COUNT(*) FILTER (WHERE f.winner = f."fighter1Id") AS a_wins,
          COUNT(*) FILTER (WHERE f.winner = f."fighter2Id") AS b_wins,
          COUNT(*) AS total
   FROM "Fight" f
   JOIN "Event" e ON e.id = f."eventId"
   WHERE f.winner IS NOT NULL
   GROUP BY e.promotion
   ORDER BY e.promotion;
   ```
   A healthy promotion will be ~50/50. A promotion that's 85%+ side A (or side B) is almost certainly carrying the same bug.

3. **For each affected promotion**: write a per-face fix (copy the pattern from `oneFCLiveScraper.ts` after the 2026-04-10 fix), verify against a current live event, then backfill historical winners using a Task 1-style script.

4. **Don't assume the bug is identical**. Some live parsers use different source-of-truth for winners (e.g. UFC uses a JSON API, Tapology uses text content). Only those that use CSS-selector-based sticker/marker detection need the fix. Read each parser first to understand its winner-detection path.

5. **Likely candidates**:
   - BKFC (uses Tapology markup — check `bkfcLiveParser.ts` + `tapologyLiveScraper.ts`)
   - Oktagon (if it uses any kind of per-face scraping)
   - RAF (newer, less battle-tested)
   - Matchroom (boxing)
   - Gold Star (very new — check the 2026-04-10 commit that added it)

**Gotchas**:
- Some parsers may have a `winnerText` field that's reliable — don't "fix" a working implementation.
- UFC live parser uses ESPN's fight-scorecard JSON endpoint, not CSS scraping — it should be immune.

## Task 4 (smaller, good palette-cleanser): generalize `tsconfig.tracker.json`

**Why**: right now only `onefc-live-tracker.yml` uses the focused tsconfig. The other live-tracker workflows (UFC, Oktagon, BKFC, RAF, Tapology, Gold Star) all still run `pnpm build` which is broken for the same reason. They either haven't run in 2+ weeks or are running via a different path (VPS).

**What the task requires**:

1. Open `packages/backend/tsconfig.tracker.json`
2. Add to the `include` list:
   ```json
   "src/scripts/runUFCLiveTracker.ts",
   "src/scripts/runOktagonLiveTracker.ts",
   "src/scripts/runBKFCLiveTracker.ts",
   "src/scripts/runRAFLiveTracker.ts",
   "src/scripts/runTapologyLiveTracker.ts",
   "src/services/ufcLive*.ts",
   "src/services/oktagonLive*.ts",
   "src/services/bkfcLive*.ts",
   "src/services/rafLive*.ts",
   "src/services/tapologyLive*.ts",
   "src/services/ufcDataParser.ts",
   "src/services/oktagonDataParser.ts",
   ...
   ```
   Add whatever transitive imports each tracker pulls in.
3. Run `rm -rf dist && npx tsc --project tsconfig.tracker.json` locally. Fix any new errors that surface — likely missing types or new Prisma model references. Use `@ts-nocheck` sparingly if other files have fighterAlias-style dead code.
4. For each workflow in `.github/workflows/` that builds a live tracker, replace the `Build TypeScript` / `pnpm build` step with `npx tsc --project tsconfig.tracker.json`, same as `onefc-live-tracker.yml`.
5. Verify each workflow by manually dispatching it via GitHub Actions UI and checking the run succeeds.

**Gotchas**:
- Some live trackers may have their own entry-point scripts under `src/scripts/` with slightly different naming. Grep for `runXLiveTracker` to find them all.
- `tapologyLiveParser.ts` and friends may import from `fighterMatcher.ts` which has the `@ts-nocheck` guard — that's fine, it'll still compile. But if they import functions other than `stripDiacritics`, make sure those work at runtime (the bottom-half `fighterAlias` code is dead code but the pure helpers at the top are fine).

## Task 5 (big, separate): actually fix the full `pnpm build`

**Why**: the tracker-focused tsconfig is a workaround. Long-term the full build needs to work so normal backend deploys (Render), daily scrapers, admin tools, and migration scripts can all build via `pnpm build`.

**What the task requires**:

Four bucket categories of errors, each a separate sub-task:

1. **Fastify schema type errors** (dozens of errors across `src/routes/auth.fastify.ts`, `src/routes/index.ts`, `src/routes/news.ts`, `src/routes/feedback.ts`):
   - Errors like `'description' does not exist in type 'FastifySchema'` and `Argument of type 'any' is not assignable to parameter of type 'never'`
   - Root cause: a Fastify SDK version bump removed `description` from `FastifySchema` or the type provider isn't being picked up correctly
   - Likely fix: check `@fastify/type-provider-typebox` or `@fastify/type-provider-json-schema-to-ts` version, may need to add the type provider to the Fastify instance via `.withTypeProvider<T>()`, or downgrade/upgrade Fastify itself to match the route handler signatures
   - Check `packages/backend/package.json` for Fastify versions and recent changes in `git log -- packages/backend/package.json`

2. **`newsScraperService.ts` missing module**:
   - Error: `Cannot find module '../utils/prisma' or its corresponding type declarations`
   - Fix: either the file was renamed/moved (grep for `/utils/prisma` across the repo — it might exist as `/lib/prisma` or similar now) OR the `newsScraperService.ts` was never finished and the import is broken
   - If the newsScraperService is dead code, delete it and `src/routes/news.ts` along with it
   - If it's active, create the `utils/prisma.ts` wrapper file

3. **`fighterMatcher.ts` dead code**:
   - `prisma.fighterAlias.*` calls — the `FighterAlias` model was removed from `schema.prisma` at some point
   - Fix: delete the dead helper functions (`findFighterByAlias`, `createFighterAlias`, etc.) entirely, remove the `@ts-nocheck` directive added in the 2026-04-10 session, and delete any callers (there probably are none, that's why the code is dead)
   - Also the `WeightClass` string/enum mismatch at line ~420 — check whether `WeightClass` should be an enum cast or a string literal type

4. **`oneFCLiveScraper.ts` DOM types**:
   - `Cannot find name 'document'`, `Cannot find name 'HTMLAnchorElement'`, etc. inside `page.evaluate()` blocks
   - Fix: add `"DOM"` to `lib` in `tsconfig.json` (already done in `tsconfig.tracker.json`, just promote it to the main config). Alternative: use `// @ts-expect-error` on each `page.evaluate` block with a comment explaining it runs in the browser context.
   - Low risk because the `page.evaluate` callback is serialized and shipped to the browser — TS type-checking it against Node types is misleading anyway.

After all four buckets are clean, run `pnpm build` and verify `dist/` is populated with everything (not just the tracker slice). Then remove `tsconfig.tracker.json` and revert all the workflows back to `pnpm build`. Don't do this until Tasks 1-3 are stable — the focused tsconfig is the safety net while the full build is being repaired.

## General tips for the fresh session

- **Read `docs/daily/2026-04-10.md` first**, especially the "Three compounding ONE FC scraper bugs" section. The diagnosis steps there (puppeteer ancestor dump, winner-side distribution query, DB reference counting for the merge) are transferable patterns for the backfill and audit tasks.
- **The CI workflow build command has `pnpm build`** → replace with `npx tsc --project tsconfig.tracker.json` for any new live-tracker-like script.
- **Prisma client is in the standard location** at `packages/backend/node_modules/@prisma/client`. One-off scripts can `require('@prisma/client')` directly from the repo root like `fix-rittidet.js` did.
- **Render backend is the auto-deploy target from `main`**. Anything merged to `main` goes live within a few minutes. The Hetzner VPS (`178.156.231.241:3009`) runs a parallel scraper service and needs a manual `bash /opt/scraper-service/packages/backend/vps-update.sh` to pick up changes. The live tracker path may go through the VPS first (`VPS_SCRAPER_URL` env var on Render) before falling back to GitHub Actions — check where the traffic is actually flowing before assuming a workflow fix will take effect.
- **Don't commit without reviewing**. Several files from the 2026-04-10 session are still uncommitted. Check `git status` before starting, commit those first (Task 0), THEN start new work.
- **Test accounts** (from CLAUDE.md):
  - `avocadomike@hotmail.com` (1234 ratings — good for spot-checking that backfilled results don't break the user's history)
  - `michaelsprimak@gmail.com`
- **Admin panel**: `https://fightcrewapp-backend.onrender.com/admin.html`, login with any email in `ADMIN_EMAILS` (currently `michaelsprimak@gmail.com`, `avocadomike@hotmail.com`). Useful for manual verification after backfill.
