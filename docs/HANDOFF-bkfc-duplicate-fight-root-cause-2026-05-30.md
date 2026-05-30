# HANDOFF — BKFC duplicate-fight root cause (2026-05-30)

**Status: investigation done, fix NOT started.** Read this before touching the scrapers or the
Fight schema.

## How this started

BKFC 90 (Birmingham, "Tierny vs Franco", eventId `cef9ea1c-1075-4f88-94d8-ef3f0cecbbd3`) had a
**duplicate "John Phillips vs Peter Barrett" fight**. During the live event the walkout
notification fired for the *wrong* instance ("Phillips vs Barrett up next") when in reality that
fight had just finished and **Darren Till vs Aaron Chalmers** was up next. Two follow-on issues
came out of it:

1. **[RESOLVED]** The missed "Till up next" walkout push — manually replayed. See
   `docs/daily/2026-05-30.md` and the new playbook
   `docs/playbooks/manually-fire-missed-notification.md`. 1 recipient, sent, 0 failed.
2. **[OPEN — this handoff]** Root cause of *why the parser created the fight twice*. Mike
   manually deleted the duplicate row already; he does **not** care about patching this one
   event — he wants the **parser-level root cause fixed** so it can't recur.

Also surfaced (lower priority, same underlying data tie): web and mobile render the BKFC 90
main card in different fighter order. That is a **separate symptom of the same bad data** — Till
and the surviving Barrett both carry `orderOnCard = 2` (a tie; `#3` is empty). The `/api/fights`
query orders by `orderOnCard` only (no tiebreaker), so on a tie the row order is undefined; web
(single stable sort, `EventDetailClient.tsx:52`) preserves API order, mobile (Hermes
non-stable double sort, `app/event/[id].tsx:91` + `:378`) flips it. **Correct real order is
Till `#2`, Barrett `#3`.** Not the focus — don't rabbit-hole on it. If you fix anything here,
a deterministic tiebreaker on the fights query (`orderBy: [{orderOnCard:'asc'},{id:'asc'}]`)
would stop platforms from ever diverging on a future tie.

## What I verified (facts, not guesses)

- **Only ONE `Peter Barrett` (BOXING, id `2eea4998…`) and ONE `John Phillips` (BOXING, id
  `46e910c9…`) fighter row exist.** No duplicate fighters right now. (Checked Barrett, Phillips,
  Chalmers, Till.)
- **The live tracker did NOT create the duplicate.** `bkfcLiveParser.ts` (`parseBKFCLiveData`)
  only ever calls `prisma.fight.update` — it matches existing fights by last name
  (`findFightByFighters`) and never creates. Exonerated.
- **The daily parser dedups via `upsertFightSwapAware`** (`src/utils/fightUpsert.ts`):
  `findFirst` on BOTH fighter orderings → update if found, else create. Backed by the DB
  constraint `@@unique([eventId, fighter1Id, fighter2Id])`.
- **That unique constraint is ORDER-SENSITIVE.** `(event, Phillips, Barrett)` and
  `(event, Barrett, Phillips)` are two *legal* keys. The swap-aware helper is the only thing
  protecting against swapped-order dupes, and it does so with a non-atomic **find-then-create**
  (no transaction, no lock).

## Narrowed root cause (two candidates, both real gaps)

Within a *single* daily run, `upsertFightSwapAware` correctly collapses a swapped/duplicated
matchup (its `findFirst` checks both orderings). So the dupe required one of:

- **(A) Check-then-act race across concurrent/overlapping runs.** Two runs both `findFirst`
  (both miss) → both `create`. If the scrape billed the fighters in opposite order in the two
  runs, the order-sensitive unique constraint does **not** block the second insert → duplicate.
  This is the most likely cause and is promotion-agnostic (affects all 16 parsers using this
  helper).
- **(B) Fighter-identity drift.** The same human resolving to two different fighter rows across
  runs (name-parse variance in the on-the-fly create path → a transient phantom fighter), giving
  two different `(eventId, f1, f2)` keys. No dup fighters exist now, but a phantom could have
  been cleaned up since. Related prior art: memory `lesson_bkfc_dup_fighter_phantom`.

Could not forensically prove which fired: the dup row is already deleted, and the source scrape
artifacts ran on GH Actions / the Hetzner VPS — the local `scraped-data/` and `live-event-data/`
JSON are stale (Dec/Jan) or for a different event (5/29), so they don't show BKFC 90's source.

## Recommended fix (high-confidence, structural, all-parser)

Close the dominant gap (A) at the database, which is the only place a check-then-act race can be
arbitrated:

1. **Order-insensitive unique index** on Fight:
   `CREATE UNIQUE INDEX ... ON "Fight" (eventId, LEAST(fighter1Id, fighter2Id),
   GREATEST(fighter1Id, fighter2Id))`. Makes `(event,A,B)` and `(event,B,A)` collide → the DB
   rejects the second insert even under a race.
2. **Make `upsertFightSwapAware` P2002-safe** — catch the unique violation on the create branch
   and fall back to re-find + update (so a lost race becomes an update, not a 500).
3. (Optional, separate) Harden the on-the-fly fighter resolution to reduce identity drift (B).

This is a **schema/migration change to prod**, so mind the known landmines:
- Prisma `migrate dev` fails on Render (non-superuser) — use `migrate diff` + a hand-authored
  migration folder + `migrate deploy`. See memory `lesson_prisma_migrate_dev_fails_on_render`
  (and note `*.sql` was historically gitignored).
- **Pre-flight: scan prod for EXISTING swapped-order duplicate matchups first.** The unique
  index creation will FAIL if any exist. This scan was the immediate next step when we stopped —
  it also confirms whether gap (A) is recurring across other events/promotions. Read-only query:
  group all fights by `(eventId, LEAST(f1,f2), GREATEST(f1,f2))` having count > 1. Any hits need
  a rating-preserving merge before the index goes on (cf. `cleanupBKFCStaleMatchups.ts`,
  `detectTapologyFightBleed.ts` for merge patterns).

## Immediate next step

Run the read-only swap-duplicate scan across all promotions (scope + confirm the diagnosis),
then decide on the migration. Do NOT add the unique index before the scan comes back clean /
the existing dupes are merged.

## Key files

- `packages/backend/src/utils/fightUpsert.ts` — `upsertFightSwapAware` (the dedup chokepoint)
- `packages/backend/src/services/bkfcDataParser.ts` — daily BKFC parser (calls the helper)
- `packages/backend/src/services/bkfcLiveParser.ts` — live tracker (update-only; not the culprit)
- `packages/backend/prisma/schema.prisma` — `@@unique([eventId, fighter1Id, fighter2Id])` on Fight
- `packages/web/src/app/events/[id]/EventDetailClient.tsx:52` + `packages/mobile/app/event/[id].tsx:91,378`
  — the web/mobile sort divergence (the order-display side issue)
