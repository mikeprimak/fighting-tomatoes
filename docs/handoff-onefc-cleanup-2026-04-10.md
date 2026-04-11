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

## ~~Task 0: commit the in-progress code changes~~ — DONE 2026-04-11

Landed as `eb6177c` (tracker CI fix) and `0031664` (scraper bug fixes). Both on `main`, not pushed.

## ~~Task 1: backfill historical ONE FC event winners~~ — DESCOPED 2026-04-10

Skipped for MVP. Historical ONE FC winner data is known to be structurally wrong from the per-face sticker bug, but fixing it is not blocking. Revisit post-MVP.

## ~~Task 2: fix the single-word-URL-slug fighter name bug~~ — DONE 2026-04-11

Landed as `7815461`. Full write-up in `docs/daily/2026-04-11.md`. TL;DR:

- Both scrapers (`scrapeAllOneFCData.js` daily, `oneFCLiveScraper.ts` live) now parse the event page's JSON-LD `performer` array and attach `fullName` to each scraped fighter. The parser prefers JSON-LD over URL slug.
- `oneFCDataParser.ts:parseOneFCFighterName` accepts optional `fullName`, extracts nicknames from ASCII and curly quotes, handles the pre-name form (`"Petnueng" Isaac Mohammed`).
- `oneFCLiveParser.ts:findFightByFighters` was rewritten to match via token intersection (firstName ∪ lastName) instead of last-name-only, so the live tracker bridges the name transition for legacy single-word DB rows.
- Backfill script `packages/backend/scripts/fix-onefc-broken-names.js` applied against prod: **10 renames + 5 merges, 0 failures**. Safety guards: first-word match + word-count ≥ filter, plus scope guard limiting action to fighters whose entire history is ONE FC (30 cross-promotion fighters excluded).
- Key fixes landed: Nuapet Tded99 → Nuapet Torfunfarm, plus merges for Rodtang Jitmuangnon, Takeru Segawa, Kompet Sitsarawatsuer, Petkhaokradong Lukjaomaesaithong, Kongklai Sor Sommai, Tonglampoon FA Group.
- **Remaining leakage**: 10 ONE-FC-only fighters still have `firstName = ''` (Dedduanglek, Hyu, Jaosuayai, Misaki, Phetjeeja, Pompet, Ranma, Ratchasiesan, Shoma, Taku). They didn't appear in any of the 10 events with scrape-able JSON-LD at backfill time. Acceptable MVP leakage — will self-heal as they appear in future daily scrapes.

## ~~Task 3: audit other live parsers for the same per-face scope bug~~ — DONE 2026-04-11

**Verdict: no bugs found.** The ONE FC per-face sticker bug was structurally unique to ONE FC's DOM. Full write-up in `docs/daily/2026-04-11.md`. TL;DR:

- **Diagnostic query** (winner-side distribution per promotion) turned up skews that looked suspicious but were sampling noise:
  - Karate Combat 100% A, MVP 90% A, RIZIN 100% A (small samples ≤10), PFL/RAF/Oktagon/ONE 60–63% (mild).
  - Verified against live Tapology HTML for Karate Combat 59 and MVP Dubois vs Harper: scraper correctly picks winner by NAME, parser matches by name, so winner ID resolves correctly regardless of A/B storage order. One B-side win (Watson vs Makinen → Makinen) proves the scraper can pick either side.
- **Tapology live scraper** (covers MVP, Karate Combat, RIZIN, PFL, Zuffa Boxing, Dirty Boxing, RAF, Gold Star): clean. Tapology reorders displayed fighters so the winner is on the left of the row with a `from-[#d1f7d2]` green gradient class on the winner's own cell; loser gets `from-[#ffecec]` pink. Class check is exclusive to the winner cell. Weak secondary check (`.bg-green-500`) is redundant but not harmful.
- **Oktagon live scraper**: clean. Consumes a JSON API with `"FIGHTER_1_WIN"` / `"FIGHTER_2_WIN"` result strings. Immune by construction.
- **Matchroom live scraper**: clean. Per-corner `$corner.hasClass('winner')` and `$corner.find('.winner')` scoped to each boxer's cell. Text-based regex fallback matches by fighter last name.
- **BKFC** (`scrapeBKFCLiveEvent.js`): scrapes BKFC's site directly (not Tapology, despite the original handoff hint). Uses `[data-render="RedResult"]` / `[data-render="BlueResult"]` per-corner attributes. **Latent risk noted**: Strategy 2 fallback (lines 298–306) does a container-wide `querySelectorAll('[class*="winner"]')` without per-fighter scoping. Not currently firing, but fragile if BKFC ever adds a container-level winner marker.
- **UFC**: skipped per user. Uses ESPN JSON API.
- **RAF / Gold Star**: no dedicated live scrapers; both use Tapology. Covered by Tapology audit.

**Action items from this audit**: none for MVP. Post-MVP nice-to-have: tighten the BKFC Strategy 2 fallback to scope per-corner instead of container-wide.

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

## Task 5 (big, separate): actually fix the full `pnpm build` — DEFERRED FOR MVP

**Status as of 2026-04-11**: confirmed not blocking anything. The backend `build` script in `package.json` ends with `|| true`, which swallows all TypeScript errors and exits 0. Render has been deploying successfully the whole time because the errors are type-check errors, not runtime errors. The `tsconfig.tracker.json` workaround and the `|| true` shortcut are both buckets under the same leak, but the leak isn't actively hurting anything.

**Recommendation**: defer until post-MVP. Minimal post-Task-4 follow-up: remove `|| true` from the build script so type errors become loud again and the type-checker becomes a useful signal once more. But don't do that until Task 4 ships (generalizing tracker tsconfig) — otherwise Render deploys will break.

**Why the full fix is still worth doing eventually**: the tracker-focused tsconfig is a workaround. Long-term the full build needs to work so normal backend deploys (Render), daily scrapers, admin tools, and migration scripts can all build via `pnpm build`.

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
