# HANDOFF: RAF11 live-card mass-cancel (2026-07-18 evening)

## Symptom
During the live RAF11 event (Jul 18 8pm ET), the entire card vanished from web + mobile. Data was never lost — all 12 fights had been flipped to `CANCELLED` in prod, and cancelled fights are hidden in the app.

## Root cause (confirmed)
RAF republished their Webflow site and **renamed/dropped the CSS classes our scrapers anchor on**: `.matchups-list` (fight list wrapper) and `.logo-text` (event name) are gone. Both RAF scrapers then parsed **0 fights** from a page that still contains all 12.

`rafLiveParser.ts` had **no scrape-health guard** (unlike the daily parsers, which gained guards after the UFC 328 wrongful-cancel in May): any DB fight missing from the scrape → instant `CANCELLED`. At 00:03 UTC, 3 min after the event went LIVE, the tracker cancelled the whole card. Bonus failure: with all remaining fights cancelled, `autoCompleteRAFEvent` marked the event `COMPLETED` (`completionMethod: 'scraper-auto'`), which stopped the 5-min GH Actions tracker dispatches.

## Fixes shipped to main (both deployed)
- **`403ba141`**:
  - `scrapeRAFLiveEvent.js` + `scrapeAllRAFData.js`: fight cards now anchored on `.w-dyn-item` containing `.event-card_card-heading-wrapper` (inner card markup survived the republish); event name falls back to `<title>` ("RAF11 | Tsarukyan vs Covington").
  - `rafLiveParser.ts`: cancellation pass gated behind `isScrapeHealthyForCancellation` (≥75% of DB non-cancelled count or ≥5 absolute). Un-cancelling always allowed → recovery is automatic.
  - `rafLiveParser.ts`: results loop now syncs the in-memory fight object after DB writes, so the cancellation pass can't flip a just-completed fight back to UPCOMING via its stale snapshot.
- **`502b01eb`**: `runRAFLiveTracker.ts` now calls `refreshProductionScrapersCache(prisma)` on start. Without it the standalone tracker used the default cache (which excludes `raf`) and **wrote all RAF results to shadow fields only** — latent since RAF tracking began. (Sherdog/Yahoo trackers already had this; RAF was missed. **Check `runTapologyLiveTracker.ts` too.**)

## Unresolved: the "mystery canceller" (~90 min of clobbering)
After the fixes were pushed (~01:03 UTC), restores kept getting re-cancelled by something running **old parser code** (fingerprint: mass-cancel + `completionMethod: 'scraper-auto'` seconds later):
- 01:00:42 — clobbered local restore #1 (plausibly the 00:59 GH run, old code, legitimate)
- 01:06:10–11 — cancelled 9 fights + completed event. **No GH run was executing.**
- 01:27:47–48 — same again, 2 min after restore #2. Fixed-code GH run then un-cancelled at 01:28:45 but by design never reverses event COMPLETED.

Strikes **stopped after ~01:28**, which coincides with the Render deploy of the fixed commits finishing. Ruled out: GH Actions (all runs after 01:03 built from fixed main, logs verified clean); current `scraperService.ts` (VPS) has no RAF handler and git history says it never did; `VPS_SUPPORTED_SCRAPERS` excludes raf; no Render cron for RAF; only `autoCompleteRAFEvent` writes `'scraper-auto'`. Not ruled out: something on Render executing the old parser in-process pre-deploy (no caller found in code, but timing fits), a VPS crontab entry (not inspectable — SSH attempt was declined), or admin-panel actions triggering an old-code path. **If cancels recur, catch it live: `SELECT client_addr, query FROM pg_stat_activity` while it strikes, check VPS crontab, check Render logs at the strike timestamp.**

## State at handoff (~01:40 UTC)
- RAF11 `LIVE` (Mike set manually via admin after the 01:27 clobber), Guida vs Edgar marked LIVE manually.
- 4 fights COMPLETED with winners (O'toole, Braunagel over Downey, Cassioppi, Gray) — published for real post-`502b01eb`.
- 8 UPCOMING; Desanto vs Davino correctly still CANCELLED (legit Jul 10 replacement by Harutyunyan).
- GH tracker dispatches every ~5 min while LIVE, now with fixed code end-to-end; un-cancels + results flow automatically.
- **RAF's own site lags the arena** (crowd on Guida while earlier bouts show no winner) — tracker mirrors the page; results land when RAF posts them. Not our bug.

## Next session
1. Verify RAF11 completed cleanly + all winners present; run `backfillRAFResults` if gaps (RAF site may post remaining results late).
2. RAF12/13/14: RAF13+14 have **0 fights** in DB (daily scraper was silently broken by the same selector). Confirm next daily `raf-scraper` run populates them; RAF Georgia scraped 12 vs DB 13 — check for a legit late cancellation.
3. Audit `runTapologyLiveTracker.ts` (and any other standalone tracker) for the missing `refreshProductionScrapersCache` call.
4. Mystery canceller: only matters if it recurs (it's harmless against a COMPLETED event + guarded code, but un-explained). See capture plan above.
5. Consider porting the `isScrapeHealthyForCancellation` guard to the other **live** parsers (`ufcLiveParser`, oneFCLiveScraper, etc.) — the daily parsers are guarded; tonight proved live parsers may not be.
6. Delete temp scripts `packages/backend/scripts/tmp-raf-*.ts`, `tmp-prod-scrapers.ts` (kept for tonight's monitoring).
