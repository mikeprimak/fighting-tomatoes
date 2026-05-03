# Handoff: audit prod for order-flip Fight duplicates

**Run on or after**: 2026-05-04 (2 days after the swap-aware-upsert fix shipped)
**Why the wait**: lets the daily scrapers run twice with the new helper so any active duplicates collapse on their own (the helper canonicalizes fighter1/fighter2 ordering on update, so subsequent direct-keyed lookups by either old or new code path will hit the same row).

## Context

On 2026-05-02 we shipped `upsertFightSwapAware` (commit `db0baf5`) across all 16 daily parsers to fix an order-sensitive unique-key bug — Prisma treated `(eventId, A, B)` and `(eventId, B, A)` as different keys, so when a source CMS swapped which fighter it billed first between scrapes, parsers silently created a duplicate row instead of updating the existing one.

We caught this because PFL Sioux Falls 2026 had a Bowers vs Desousa duplicate. Cleaned that one up by hand; the helper now prevents new occurrences. Pre-existing orphan rows in other events are still out there.

## The audit

Run this against the Render production DB (DATABASE_URL is in `packages/backend/.env`, NOT `.env.production`):

```sql
SELECT
  e.name,
  e.date,
  e."eventStatus",
  f1.id            AS fight1_id,
  f1."orderOnCard" AS fight1_order,
  f1."cardType"    AS fight1_card,
  f1."fightStatus" AS fight1_status,
  f1."updatedAt"   AS fight1_updated,
  f2.id            AS fight2_id,
  f2."orderOnCard" AS fight2_order,
  f2."cardType"    AS fight2_card,
  f2."fightStatus" AS fight2_status,
  f2."updatedAt"   AS fight2_updated,
  fr1."firstName" || ' ' || fr1."lastName" AS fighter_a,
  fr2."firstName" || ' ' || fr2."lastName" AS fighter_b
FROM "Fight" f1
JOIN "Fight" f2
  ON f2."eventId"    = f1."eventId"
 AND f2."fighter1Id" = f1."fighter2Id"
 AND f2."fighter2Id" = f1."fighter1Id"
 AND f2.id > f1.id
JOIN "Event" e   ON e.id   = f1."eventId"
JOIN "Fighter" fr1 ON fr1.id = f1."fighter1Id"
JOIN "Fighter" fr2 ON fr2.id = f1."fighter2Id"
ORDER BY e.date DESC, e.name;
```

Use a small node script with PrismaClient instead of psql if you don't want to wrangle the connection string:

```js
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
(async () => {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRawUnsafe(`<paste SQL above>`);
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})();
```

## What to do with the results

- **0 rows**: clean, close this handoff out.
- **N rows**: for each pair, decide which row to keep and merge user content from the loser to the winner. Rules:
  - **Status**: prefer non-CANCELLED over CANCELLED.
  - **User content**: prefer the row with more ratings + comments + predictions + tags + notification matches.
  - **Recency**: prefer the row with the more recent `updatedAt` (it's the one the daily scraper has been touching).
  - **Tie**: keep the older `createdAt` (the original) and migrate the newer's content to it.
- Re-point child rows from loser → winner: `Rating`, `Comment`, `FightPrediction`, `FightTag`, `FightNotificationMatch`. Use the `fix-bowers-orphan.js` script we wrote on 2026-05-02 (deleted from the repo after use, but the pattern is in `db0baf5`'s commit message and in `docs/daily/2026-05-02.md`) as a template — generalize it to take a (keeper_id, loser_id) pair as input and loop.
- Skip live or in-progress events; only operate on UPCOMING / COMPLETED / CANCELLED events to avoid stomping on a live tracker write mid-broadcast.

## What to skip

The 4 live parsers (`ufcLiveParser`, `pflLiveParser`, `oneFCLiveParser`, `tapologyLiveParser`) do their own name-token lookup in both orderings (`findFightByFighters`) before falling through to `prisma.fight.create`, so they're already swap-tolerant. Don't refactor them onto the helper just for symmetry — the create path there handles "new fight added during the broadcast", not order-flipped existing rows.

## Closeout

After cleanup (or confirming clean), append to that day's `docs/daily/YYYY-MM-DD.md` with the audit result (`N pairs found, X merged, 0 ratings affected` or similar) and delete this handoff file.
