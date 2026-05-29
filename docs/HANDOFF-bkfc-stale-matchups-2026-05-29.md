# HANDOFF — BKFC stale/superseded matchup rows (the "prelim gap") — 2026-05-29

## TL;DR

After the BKFC winner-extraction fix (PR #5 — see
`docs/HANDOFF-bkfc-results-2026-05-29.md` and `docs/daily/2026-05-29.md`), a small
residual remains: **8 fight rows across BKFC's 8 completed events that have no
winner/method.** When I first flagged this I called it "undercard/free fights the
stats page doesn't render." **That was wrong** — I verified it. The real cause is
**stale matchup rows**: early bookings whose opponents later changed, which got
marked COMPLETED (or left UPCOMING) with the *wrong opponent* and were never
cancelled. The actual bouts are on bkfc.com and are now correctly scored; these
leftover rows are phantoms pointing at matchups that never happened.

This is **not the winner bug** (that's fixed) and **not a scraping gap** (the data
is there). It's a data-cleanup task, low urgency, in the same family as the
Tapology fight-bleed residue ([[project_tapology_bleed_residual_cleanup]]) and
legacy-import opponent errors ([[lesson_legacy_import_data_integrity]]).

## The numbers (verified 2026-05-29, Render DB)

Across 8 completed BKFC events: 106 fight rows, 25 with no winner+method:
- **17 CANCELLED** — correct, leave them. Fight-card churn (e.g. Palm Desert
  `Herring vs Maness` → real bout `Herring vs Larrimore`) and duplicate/reversed
  rows (`Trout vs Sainsbury` AND `Sainsbury vs Trout`). They *should* have no result.
- **7 COMPLETED with no result** — the real residual (see list below).
- **1 UPCOMING inside a COMPLETED event** — Clearwater `Heckert vs Walters`.

Palm Desert is fully clean (10/10 completed bouts scored; the rest correctly
cancelled).

## The 8 rows to clean

COMPLETED, no winner/method:

| Event | # | Card | DB pairing | Reality on bkfc.com |
|---|---|---|---|---|
| BKFC Hawaii (2026-04-12) | 5 | Prelims | Cisneros vs Baesman | Cisneros fought **Pakala** (#6, scored) |
| BKFC Hawaii | 7 | Prelims | Pakala vs Guzman | Pakala fought **Cisneros** (#6, scored) |
| BKFC Hawaii | 12 | Prelims | Saragosa vs Davis Henry | Saragosa fought **Gorospe** (#10, scored) |
| BKFC FN Newcastle 2 (2026-03-14) | 2 | Main Card | Fox vs Lilley | Lilley fought **Van Dinther** (#9, scored) |
| BKFC FN Newcastle 2 | 5 | Prelims | Lilley vs Ekedi | (Lilley already accounted for above) |
| BKFC FN Newcastle 2 | 8 | Prelims | Shaw vs Spelman | Spelman fought **Redmond** (#7, scored) |
| BKFC FN Newcastle 2 | 11 | Prelims | Walker vs Gregory | Walker fought **Saleem** (#11, scored) |

UPCOMING-in-completed-event:

| Event | # | Card | DB pairing |
|---|---|---|---|
| BKFC Clearwater (2026-04-25) | 5 | Prelims | Heckert vs Walters (verify if either is on the real card) |

The math confirms these are phantoms, not coverage gaps: Newcastle 2 has 17 rows;
the scraper returns 13 real bouts (all scored) + 4 stale = 17. Hawaii: 16 rows = 13
scored + 3 stale.

## Why the existing pipeline can't clean them

1. **Backfill skips cancellation.** `backfillBKFCResults` calls `parseBKFCLiveData`
   with `skipCancellationCheck: true` (correct — a days-later reconciliation
   shouldn't cancel real fights off a shifted page). So the backfill fills winners
   but never removes stale rows.
2. **COMPLETED is never downgraded.** `bkfcLiveParser.ts` has a hard
   "never downgrade from COMPLETED" rule (protects manual fixes/draws). These stale
   rows were auto-completed by the lifecycle (`numFights × 30min + 1hr` duration
   timer) before anyone noticed the opponent was wrong, so they're frozen COMPLETED.
3. **The real bouts got created separately** (different opponent → different fight
   row), matched the scrape, and were scored. Result: both the stale row and the
   real row coexist.

## Root cause of the staleness

The daily BKFC scraper (`scrapeAllBKFCData.js`) ingests the *upcoming* card and
pairs `a[href*="/fighters/"]` links in DOM order. Early in an event's life the card
lists provisional matchups; BKFC reshuffles opponents before fight night. When the
pairing changes, the old row is never reconciled — the live tracker would cancel it
(cancellation pass), but if the lifecycle auto-completes the event first, or the
live tracker didn't run, the stale row survives as COMPLETED-with-no-result.

## Recommended fix

**Option A (preferred): one-time rating-preserving cleanup script.**
For each COMPLETED/UPCOMING bkfc fight with no winner+method:
- Re-scrape the event (reuse `scrapeBKFCLiveEvent.js`) to get the authoritative
  current pairings.
- If the DB pairing is **not** in the scrape → it's stale.
  - If the row has **no ratings/predictions/hype** → mark `CANCELLED` (safest;
    matches how the 17 correct ones look) or hard-delete.
  - If the row **has user ratings** → merge into the corresponding real fight (the
    one with the shared fighter) so ratings aren't lost. Check both fighters; the
    shared fighter tells you the target. This is the same merge problem as
    [[project_tapology_bleed_residual_cleanup]] — reuse that approach/tooling.
- Model it on `detectTapologyFightBleed.ts` (audit) + the bleed cleanup merge.

**Option B: prevent recurrence.** Give the BKFC path a reconciliation pass that
runs once when an event flips to COMPLETED (or in the backfill, gated to bkfc and
to rows with no ratings) that cancels DB pairings absent from a fresh authoritative
scrape. Riskier — needs the same "fail-closed on a short/garbage scrape" guard as
the cancellation floor work ([[lesson_chicken_and_egg_cancellation_floor]]) so a
bad scrape doesn't cancel a whole card.

Do **A first** (clears the current 8), then decide if **B** is worth it given BKFC
volume.

## Don't do

- Don't treat these as a winner-scraping problem — the scraper is correct now;
  these pairings simply don't exist on the page.
- Don't blanket-cancel COMPLETED no-result rows without checking ratings first.
- Don't touch the 17 already-CANCELLED rows — they're correct.

## Relevant files

- `src/services/scrapeBKFCLiveEvent.js` — authoritative current pairings (winner fix
  landed here in PR #5).
- `src/services/bkfcLiveParser.ts` — cancellation pass (`skipCancellationCheck`),
  "never downgrade COMPLETED" rule.
- `src/services/backfillBKFCResults.ts` — calls the parser with cancellation off.
- `src/scripts/detectTapologyFightBleed.ts` — model for the audit/cleanup.
- Lifecycle auto-complete: `src/services/eventLifecycle.ts`.

## Suggested first step

Write a read-only audit: for each completed BKFC event, scrape current pairings and
diff against DB rows; print every DB row whose pairing is absent from the scrape,
with its rating/prediction/hype counts. That output decides cancel-vs-merge per row
and confirms the count is exactly these 8 before any writes.
