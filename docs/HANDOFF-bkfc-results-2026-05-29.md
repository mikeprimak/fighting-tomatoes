# HANDOFF — BKFC events show no results (winner/method) — 2026-05-29

## ✅ RESOLVED 2026-05-29 — PR #5

The premise below ("0 winners / 0 methods", possible source-layer gap) was **partly wrong**:
methods *were* populated, only **winners** were null. The data is on bkfc.com; the scraper read
the wrong element. Winners live in `.fight-card_win-label` badges inside each fighter's headshot
link (only the real outcome rendered `display:block`); the old code looked for non-existent
`RedResult`/`BlueResult` `data-render` fields + a `.fight-card_list-title` color heuristic (those
rows are stat headers, not results). Fixed in `scrapeBKFCLiveEvent.js` (PR #5
`fix/bkfc-winner-extraction`). Backfilled **80 winners across all 8 completed BKFC events**; 0
residual method-but-no-winner. Neither candidate fix below was needed (data was native). Full
writeup: `docs/daily/2026-05-29.md` → "BKFC results: winners now extracted".

**Remaining (separate gap):** some BKFC bouts have neither method nor winner — undercard/free
fights the bkfc.com stats page doesn't render. Not the winner bug.

---

## The problem

Every **BKFC** event comes up COMPLETED in the app with **0 winners / 0 methods**
populated — Palm Desert, Blood 4 Blood, Clearwater, Denver, all of them. Fights
exist, fighters are linked, the card is right; the *outcomes* are just empty.

Mike surfaced this in the same report that turned up the Tapology-org results gap
(Usyk, Top Rank, Zuffa Boxing, Rizin). **That Tapology problem is now fixed and
automated** (see `docs/daily/2026-05-29.md` → "Results backfill"). **BKFC is a
separate, still-open problem** and is intentionally left untouched.

## Why it is NOT the Tapology bug (don't reuse that fix)

The Tapology orgs were broken because `tapology` is **excluded** from
`production_scrapers`, so successful scrapes wrote results only to the shadow
`trackerWinner` / `trackerMethod` fields and never auto-published. Fixed by
promoting shadow → live in the backfill (`publishCompletedShadowResults`).

**BKFC is different.** `bkfc` **IS** in `production_scrapers`
(`["ufc","oktagon","bkfc","onefc","pfl"]`), so it auto-publishes whatever the
scraper hands it. The shadow-field promotion does nothing for BKFC because there
is **nothing in the tracker fields to promote** — the BKFC scraper reaches the
page and parses the fight list (fighters, order) but comes back with **no result
data at all**. The root cause is at the **source/scrape layer**, not the publish
layer.

## What is confirmed

- `scraperType = 'bkfc'`, in `production_scrapers` (auto-publishes — verified).
- Affects **every** BKFC event, not one stale card — so it's structural, not a
  one-off bad row.
- The scraper successfully gets the page and the fight *list* (the cards render
  correctly with fighters/order), so it's not a fetch/403 problem like Tapology.
- bkfc.com is a **Webflow** site. We already learned its date attributes are
  locale-deceptive — `[data-event-date-local]` lies; use `[data-event-date-est]`
  (see memory `lesson_bkfc_data_event_date_local_lies`, Palm Desert stuck-UPCOMING
  fix, commit `369ee6a`, 2026-05-23). Strong hint that **results live in some
  data-attribute / embedded JSON that the current selectors don't read**, the
  same way the dates did.

## What is NOT yet confirmed (next session should verify first)

- Whether bkfc.com actually publishes results on the event page at all, or only
  on a separate results/recap URL, or only after a delay.
- The exact selector/structure the results sit in (data-attribute? embedded
  Webflow CMS JSON? a `<script>` blob?). **Do not assume — inspect a completed
  event's raw HTML by hand**, the way the date-attribute issue was found. Pull a
  recently-completed card (e.g. Palm Desert) and grep the saved HTML for the known
  winner's name to see where the result text actually lives.

## Two candidate fixes (pick after the inspection above)

1. **Fix the native bkfc.com scraper** — if results ARE on the page in some
   structure the parser isn't reading, add the right selector/JSON extraction.
   Cleanest if the data is there. Mirrors how the date bug was fixed.

2. **Tapology results fallback for BKFC** — BKFC events are also on Tapology, and
   we now have a working, rate-limit-resilient Tapology path. If bkfc.com simply
   doesn't expose results, add a BKFC entry to the Tapology promotion hubs and let
   the (now-automated, VPS-scheduled) Tapology backfill fill BKFC outcomes too.
   Note: BKFC would then need its results to route through the same shadow→publish
   logic, OR keep auto-publishing — decide so we don't double-handle.

The Tapology fallback is the more reliable long-term answer if bkfc.com is a dead
end for results; the native fix is better if the data is sitting right there.

## Relevant files (verify paths — not re-checked this session)

- BKFC live scraper + parser — `src/services/bkfc*` (e.g. a `bkfcLiveScraper` and
  `parseBKFCLiveData`, referenced in `src/scraperService.ts` ~line 203). **Grep
  `bkfc` under `src/services/` to find the current files.**
- Daily BKFC data scraper — sets `scraperType='bkfc'` (find via `scraperType.*bkfc`).
- `src/config/liveTrackerConfig.ts` — `production_scrapers` / `shouldAutoPublish`
  (confirms BKFC auto-publishes).
- `src/config/promotionRegistry.ts` / `scraperService.ts` `TAPOLOGY_PROMOTION_HUBS`
  — where a BKFC Tapology hub would be added for option 2.
- Native-org backfill (covers bkfc) — `src/scripts/backfillResults.ts`
  (`results-backfill.yml`, 14-day window).

## Suggested first step

Save a completed BKFC event's HTML and confirm whether the winner/method is
present in the markup at all. That single check decides which of the two fixes to
build — and avoids assuming bkfc.com is a dead end when it may just be another
unread data-attribute (which is exactly how the date bug fooled us).

## Context docs

- `docs/daily/2026-05-29.md` — the Tapology fix this is split off from.
- Memory: `lesson_tapology_shadow_fields_never_published` (why BKFC ≠ Tapology),
  `lesson_bkfc_data_event_date_local_lies` (BKFC Webflow data-attribute gotcha).
