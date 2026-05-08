# HANDOFF — Two-strike scraper cancellation guard rollout

**Date**: 2026-05-07
**Status**: ✅ COMPLETE — all 16 parsers shipped. Pushed in commits 7489100 (5 parsers) and e230e3b (9 parsers).
**Trigger**: Strickland vs Chimaev (UFC 328 main event) was wrongly marked CANCELLED when UFC.com briefly dropped the event from its upcoming-events page. User had to manually flip event status back to UPCOMING.

## What's done (shipped to main)

Commit `be3a7d0` — `fix(ufc-scraper): two-strike + scrape-sanity guards before cancelling`

- New shared module `packages/backend/src/services/cancellationGuards.ts` exporting:
  - `CANCELLATION_STRIKE_THRESHOLD = 2`
  - `MIN_SCRAPED_EVENTS_FOR_CANCEL = 3`
  - `decideStrike(currentCount): { newCount, shouldCancel }`
- Schema: `missingScrapeCount Int @default(0)` added to **Event** and **Fight** models
- Migration: `prisma/migrations/20260507000000_add_missing_scrape_count/migration.sql`
- Refactored: `src/services/ufcDataParser.ts` (full pattern)
- Refactored: `src/services/bkfcDataParser.ts` (full pattern, in working tree but NOT committed yet — see "What's mid-flight" below)

## What's mid-flight (uncommitted, in working tree)

`packages/backend/src/services/bkfcDataParser.ts` — fully refactored locally but **not yet committed**. Six edits applied:
1. Added `cancellationGuards` import
2. Added `scrapeIsSane` sanity gate after the dedupe step (uses `uniqueEvents.size`)
3. `prisma.event.update` payload now includes `missingScrapeCount: 0`
4. Both `upsertFightSwapAware` call sites (on-the-fly fighter creation path + regular path) now include `missingScrapeCount: 0` in updateData
5. Fight-level cancel block: gated on `scrapeIsSane`, uses `decideStrike`, logs strike vs cancel
6. Event-level cancel block: skipped entirely when `!scrapeIsSane`, otherwise `decideStrike` + strike vs cancel

Verify with `git diff packages/backend/src/services/bkfcDataParser.ts` before committing.

UFC parser also has a small uncommitted refactor: the original commit inlined the constants; the working tree now imports them from `cancellationGuards.ts` and uses `decideStrike()` instead of inline `(count ?? 0) + 1` arithmetic. Cosmetic only; behavior identical.

## What's left (14 parsers)

All in `packages/backend/src/services/`. All share the SAME cancellation pattern as UFC and BKFC (verified earlier via grep — every one has `cancellationSafetyFloor = Math.max(2, Math.floor(... * 0.75))` and `isStillOnSite ? scrapedEventUrls.has(...) : ...` blocks).

| File | Promotion filter | Notes |
|------|------------------|-------|
| `dirtyBoxingDataParser.ts` | Dirty Boxing | Uses `scrapedFightSignatures` instead of `scrapedFightPairs` (cosmetic) |
| `gamebredDataParser.ts` | Gamebred | Same as dirtyBoxing |
| `karateCombatDataParser.ts` | Karate Combat | |
| `matchroomDataParser.ts` | Matchroom | |
| `mvpDataParser.ts` | MVP | |
| `oneFCDataParser.ts` | ONE Championship | |
| `oktagonDataParser.ts` | Oktagon MMA | |
| `pflDataParser.ts` | PFL | |
| `rafDataParser.ts` | RAF | |
| `rizinDataParser.ts` | RIZIN | |
| `topRankDataParser.ts` | Top Rank | |
| `zuffaBoxingDataParser.ts` | Zuffa Boxing | |
| `goldStarDataParser.ts` | Gold Star | |
| `goldenBoyDataParser.ts` | Golden Boy | |

## Per-file edit recipe (apply this template)

For each of the 14 files, make these edits in order:

### Edit 1 — Add the import

After the existing `import { upsertFightSwapAware } from '../utils/fightUpsert';` (or last import if that one is missing):

```ts
import {
  CANCELLATION_STRIKE_THRESHOLD,
  MIN_SCRAPED_EVENTS_FOR_CANCEL,
  decideStrike,
} from './cancellationGuards';
```

### Edit 2 — Sanity gate at top of import function

After the function's opening console.log + dedup step, add:

```ts
const scrapeIsSane = <COUNT_EXPRESSION> >= MIN_SCRAPED_EVENTS_FOR_CANCEL;
if (!scrapeIsSane) {
  console.log(`  ⚠️  Scrape returned only ${<COUNT_EXPRESSION>} events (< ${MIN_SCRAPED_EVENTS_FOR_CANCEL}). Skipping ALL cancellation passes — treating scrape as broken.`);
}
```

`<COUNT_EXPRESSION>` is usually `eventsData.events.length` or `uniqueEvents.size`. Pick whatever matches what the file actually iterates.

### Edit 3 — Reset event counter on upsert

In the `prisma.event.update({ ..., data: { ..., scraperType: '<promo>', ... } })` call inside the per-event loop, add:

```ts
missingScrapeCount: 0, // event present in this scrape — clear strike counter
```

If file has an "un-cancel reappeared" block with `prisma.fight.updateMany({ ..., data: { fightStatus: 'UPCOMING' } })`, change data to `{ fightStatus: 'UPCOMING', missingScrapeCount: 0 }`.

### Edit 4 — Reset fight counter on upsertFightSwapAware

For EACH `upsertFightSwapAware(prisma, ..., updateData, createData)` call, add to updateData (NOT createData):

```ts
missingScrapeCount: 0, // fight present in this scrape — clear strike counter
```

Several parsers have multiple call sites. Update them all.

### Edit 5 — Refactor fight-level cancellation block

Find the block:

```ts
const eventInProgress = event.eventStatus !== 'UPCOMING';
const cancellationSafetyFloor = Math.max(2, Math.floor(... * 0.75));
const scrapeLooksComplete = ... >= cancellationSafetyFloor;
const shouldCancelMissing =
  !eventInProgress && (... === 0 || scrapeLooksComplete);
```

Two changes:
- Add `scrapeIsSane &&` at start of `shouldCancelMissing`
- Replace each `await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'CANCELLED' } });` with the strike pattern. Reference `bkfcDataParser.ts` lines ~660-720 for exact shape (uses a single `decideStrike` call with `reason` string instead of the rebooked/not-rebooked branches both calling cancel).

Add `let strikeCount = 0;` next to `let cancelledCount = 0;`. Add summary log at end:

```ts
if (strikeCount > 0) {
  console.log(`    ⚠ Struck ${strikeCount} missing fights (will cancel after another consecutive miss)`);
}
```

### Edit 6 — Refactor event-level cancellation block

Find the block:

```ts
const existingUpcomingEvents = await prisma.event.findMany({
  where: { promotion: '<PROMO>', eventStatus: 'UPCOMING' },
  select: { id: true, name: true, ufcUrl: true },
});
let eventsCancelled = 0;
for (const dbEvent of existingUpcomingEvents) { ... }
```

Apply pattern from `bkfcDataParser.ts` lines ~745-790:
- Add `missingScrapeCount: true` to the select
- Wrap for-loop in `if (!scrapeIsSane) { ...skip log... } else { ...for loop... }`
- Inside `if (!isStillOnSite)`, use `decideStrike(dbEvent.missingScrapeCount)`; only cancel when `shouldCancel`, otherwise bump counter and log strike
- Add `let eventsStruck = 0;` and a summary log

## Verification per file

After editing each file:

```bash
grep -n "missingScrapeCount\|scrapeIsSane\|decideStrike" packages/backend/src/services/<file>
```

Expected hits: import (3 lines), sanity gate (1-2 lines), event update payload (1), fight upsert payload (1+ depending on call sites), fight cancel block (~5), event cancel block (~5).

## Type-check before committing

```bash
cd packages/backend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<edited-files>" | head -20
```

Many pre-existing errors in the repo (admin/, controllers/) are unrelated — filter to just the parser files you touched.

## How to ship

Render auto-deploys on push to `main`. The Dockerfile CMD runs `pnpm run db:migrate:deploy && pnpm start`, so the missing-column migration applies before new code runs. Just commit + push.

**Don't push partial batches** if it'd leave the build broken. Type-check before each commit.

## What this guard actually does

When the source page is normal: behavior unchanged. When the source page is broken (UFC 328-style transient drop):

- **Single missing scrape:** counter bumps from 0 to 1. Logs a strike. Event/fight stays UPCOMING. No cascade-cancel.
- **Two consecutive missing scrapes (~24h later for daily scrapers):** counter hits 2. Real cancel.
- **Reappears at any point:** counter resets to 0. Strike forgiven.
- **Whole scrape returns < 3 events:** all cancellation logic skipped. Page is presumed broken.

## Risk of this rollout

Low. Worst case if a refactor goes wrong: a parser stops cancelling correctly → stale CANCELLED rows accumulate. That's already manually fixable from admin panel. No risk of data loss.

The only field added is `missingScrapeCount Int @default(0)` — pure metadata, never read by app/mobile code, never surfaced in API responses.

## Where things live

- Shared module: `packages/backend/src/services/cancellationGuards.ts`
- Migration: `packages/backend/prisma/migrations/20260507000000_add_missing_scrape_count/migration.sql`
- Reference impls: `ufcDataParser.ts`, `bkfcDataParser.ts`
- Render Dockerfile (root): runs migrate on container start
- Render env: `DATABASE_URL` is the External Render URL (already configured)
