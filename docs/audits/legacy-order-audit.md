# Legacy event-order inversion audit (BACKLOG §8, phase 1)

**Generated:** 2026-06-22 · **Audit script:** `packages/backend/scripts/audit-legacy-event-order.ts`
(read-only) · **Fix script:** `packages/backend/scripts/fix-legacy-event-order.ts` · **Data:**
`legacy-order-audit.csv` (this dir, **pre-fix snapshot** — the record of what was inverted).

**Status: phase 2 DONE 2026-06-22.** The 225 safe-to-fix events (`INVERTED-HIGH` +
`INVERTED-STRUCTURAL`) were flipped on prod (2491 fight rows). Post-fix verification: all 225
re-classify `CORRECT`, 0 still inverted; spot-checked Kattar/Dos Anjos/Blaydes — main event now
at order 1. **Still open:** 325 `INVERTED-RATING-ONLY` + 30 `SENTINEL` (need an authoritative
external source, not the rating heuristic).

## The bug

Many legacy imported events (`Event.scraperType = null`) have **inverted `orderOnCard`**:
`orderOnCard = 1` is an early prelim and the highest order is the main event. The whole app
assumes the opposite (`1 = main event`), so these events render **upside-down**. Scope is
**not uniform** — a large share of legacy events are already correct, so a blanket reversal
would break those (see memory `lesson_legacy_event_order_inversion`; UFC 268 was fixed
individually on 2026-06-08).

## Method — three signals, structural over heuristic

Per event we compare the lowest-order fight ("claimed main") vs the highest-order fight
("claimed last prelim") and collect votes:

| Signal | Strength | Notes |
|---|---|---|
| **name** | authoritative | Most UFC cards are *named after the main event* ("FN Holm vs Shevchenko"). If the event name contains the **highest**-order fight's fighters but not the lowest, it's inverted. Silent on numbered PPVs ("UFC 200"). |
| **title** | authoritative but **sparse** | `isTitle` is rarely set on legacy rows — fires on very few events. |
| **rating** | **weak** | Headliner usually draws the most ratings, but an upset/FOTN prelim can out-draw it — never trusted alone. |

(A `rounds` signal was dropped: legacy fights all default to `scheduledRounds = 3`, so it
carries no information.)

## Results (1241 legacy COMPLETED events; 1130 with ≥3 fights scored)

| Verdict | Count | Meaning / action |
|---|---|---|
| `INVERTED-HIGH` | **211** | structural signal **and** rating agree → **safe to fix** |
| `INVERTED-STRUCTURAL` | **14** | name/title says inverted, rating silent → **safe to fix** |
| `SENTINEL` | 30 | out-of-range order (e.g. 99/115) → **manual look** |
| `INVERTED-RATING-ONLY` | 325 | only the weak heuristic flags it → **needs external source** (ufcstats/Wikipedia) before any flip |
| `UNCERTAIN` | 209 | signals conflict or all neutral → leave |
| `CORRECT` | 212 | structural signal confirms already-correct → leave |
| `CORRECT-RATING-ONLY` | 129 | ratings say correct → leave |

**Safe-to-fix now: 225** (HIGH + STRUCTURAL). **Needs external verification: 325.**

### Spot-check (validates the HIGH verdict)

Three INVERTED-HIGH events queried directly — in each the **named main event sits at the
highest `orderOnCard`**, with order 1 an early prelim:

- *FN Kattar vs Chikadze* — Kattar vs Chikadze at order **10**; order 1 = Rosa vs Brown.
- *FN Dos Anjos vs Fiziev* — Dos Anjos vs Fiziev at order **11**; order 1 = Lawrence vs Kakhramonov.
- *FN Blaydes vs Aspinall* — Blaydes vs Aspinall at order **14**; order 1 = Silva vs Dalby.

## Fix

Self-inverse transform per event: `newOrder = (minOrder + maxOrder) − oldOrder`, applied as a
single set-based `UPDATE` over the target IDs (safe: `orderOnCard` is in no unique key; the
Fight unique is `(eventId, fighter1Id, fighter2Id)`).

1. ✅ **DONE** — applied to the **225 structural-INVERTED** events (HIGH + STRUCTURAL).
   `fix-legacy-event-order.ts` is dry-run by default; ran with `--apply`. 2491 rows updated,
   all 225 verified flipping to `CORRECT`.
2. **TODO** — the **325 rating-only** + **30 sentinel**: resolve from an authoritative source
   (ufcstats / Wikipedia main-event lookup) rather than the rating heuristic. (Re-run the audit
   to regenerate the current candidate list — the committed CSV is the pre-fix snapshot.)
3. `UNCERTAIN` / `CORRECT` left untouched.

Modern scraped events (`scraperType` set) are correct — out of scope. **Re-running
`fix-legacy-event-order.ts --apply` is safe/idempotent**: it re-classifies live each run and
only targets events that *currently* classify as inverted — the 225 now classify `CORRECT`, so
a re-run skips them and would only catch newly-imported inversions.
