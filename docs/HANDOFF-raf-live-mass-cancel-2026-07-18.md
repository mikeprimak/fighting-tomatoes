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

## Session 2 (02:00–03:00 UTC): strikes continued, VPS exonerated, caller still unknown

The strikes did **not** stop at 01:28. They continued all evening: 01:51:59, 02:06:58, 02:33:14, 02:51:58.

### The one hard new fact — strikes fire on the Render lifecycle *dispatch tick*
Every completion timestamp lands **within one second of Render's `eventLifecycle` dispatching the RAF workflow**, not when the GH tracker code runs:

| lifecycle dispatch (GH run `created_at`) | event completed |
|---|---|
| 01:27:47 | 01:27:47 |
| 01:51:57 | 01:51:59 |
| 02:06:57 | 02:06:58 |
| 02:51:57 | 02:51:58 |

The GH run's *own* `Run RAF Live Tracker` step executes ~55–60s later (verified via the jobs API: run 29669677754 dispatched 02:06:57, tracker step 02:07:56–59). So the canceller is **whatever executes on that tick**, not the workflow it dispatches. This is the single strongest lead and it was not known in session 1.

### Now definitively ruled out
- **The VPS.** Polled `/status` (with `VPS_SCRAPER_API_KEY`, copied from Render into `packages/backend/.env`) every 2s for 2.5 min across a live window with RAF11 `LIVE`. Its only tracker the entire time was `ufc:UFC Fight Night Plessis vs. Usman` (started 22:43, scrapeCount 484). A RAF tracker never appeared, including during a strike. **Do not stop this service on suspicion — it tracks real cards.** The "third DB client" (`10.31.24.175`) that looked suspicious in session 1 is a **GitHub Actions runner doing daily scrapes** — caught mid-run doing bulk `UPDATE events SET name,date,mainStartTime,venue,…` / `UPDATE fighters` / `UPDATE fights` upserts, which is daily-scraper shape, not live-tracker shape.
- **GitHub Actions as the canceller.** Timing above. GH is in fact the **repair** mechanism: the fixed guarded code un-cancels within ~60s of each strike (e.g. run 29670853817 restored the card at 02:52:57).
- **Render cron.** `packages/backend/render.yaml` declares only the web service (`node dist/server.js`). No cron job.
- **Local processes.** `Get-Process node` = 0 on Mike's machine during strikes.

Still true: `'scraper-auto'` is written in exactly one place, `rafLiveParser.autoCompleteRAFEvent` (plus its compiled twin in local `dist/`). The only importer of that function is `runRAFLiveTracker.ts`. **No caller exists in `main` that would run on the Render tick** — so either Render is running a build that differs from `main`, or there is a caller/host nobody has found yet.

### Do this FIRST next session (cheapest → most decisive)
1. **Make the writer self-identify.** Temporarily stamp provenance into the completion write in `autoCompleteRAFEvent`:
   ```ts
   completionMethod: `scraper-auto:${os.hostname()}:${process.pid}:${(process.env.RENDER_GIT_COMMIT ?? 'nogit').slice(0,7)}`
   ```
   Ship it, wait for one strike on the next live RAF event, read the value. This ends the guessing in a single cycle — host, pid, and build all at once. Revert after.
2. **Read Render logs at a strike second.** Never actually done — no Render API key/CLI is available from the repo. Get one (or use the dashboard) and filter to the exact timestamp. Worth wiring `render` CLI access the way `gsc.js`/`ga.js` were, so future sessions can query logs from the repo.
3. **Confirm the deployed Render build.** `/health` returns only `{"version":"1.0.0"}` — useless for this. Add the git SHA to that payload; then "is Render running `main`?" becomes a one-line check.
4. **Continuous `pg_stat_activity` capture.** Session 2's capture missed a strike by 55 seconds. Poll every ~500ms, log any `UPDATE` touching events/fights with `client_addr` + `query`, and run it across a *full* dispatch interval. **Gotcha:** the tables are `events`/`fights` (plural) — raw SQL against `"fight"` fails with `42P01`. Also, the tool output pipeline eats the letter `s` from `pg_stat_activity.query` text (`"fights"."fightStatus"` renders as `"fight "."fightStatu "`) — don't read that as corruption.

### Known-good behaviour to rely on
The fix from session 1 works: guarded code refuses the cancellation pass on a broken scrape and **auto-un-cancels** on the next healthy pass. Fight-level damage self-heals in ~60s. The lasting harm is the **event** flipping `COMPLETED`, which stops lifecycle dispatches and freezes recovery until a human sets it `LIVE`. If this recurs before the caller is found, consider letting the RAF tracker reopen a scraper-completed event when the source page still lists unfought bouts (scope narrowly: only when `completionMethod` is a scraper method, never `'manual'`).

## State at handoff (~01:40 UTC)
- RAF11 `LIVE` (Mike set manually via admin after the 01:27 clobber), Guida vs Edgar marked LIVE manually.
- 4 fights COMPLETED with winners (O'toole, Braunagel over Downey, Cassioppi, Gray) — published for real post-`502b01eb`.
- 8 UPCOMING; Desanto vs Davino correctly still CANCELLED (legit Jul 10 replacement by Harutyunyan).
- GH tracker dispatches every ~5 min while LIVE, now with fixed code end-to-end; un-cancels + results flow automatically.
- **RAF's own site lags the arena** (crowd on Guida while earlier bouts show no winner) — tracker mirrors the page; results land when RAF posts them. Not our bug.

## Next session
0. **RAF11 results are incomplete and need `backfillRAFResults`.** At wrap-up (~03:00 UTC) 7 of 12 bouts had winners; the other 5 — incl. the main event (Tsarukyan vs Covington) and co-main (Askren vs Muhammad) — had none, because **RAF's own site still listed them as unfought**. Verified directly: the fixed scraper parses the page correctly (12 fights, 6→7 complete), so this is upstream lag, not our bug. Re-run the backfill once RAF posts them. Desanto vs Davino stays `CANCELLED` (legit Jul 10 replacement by Harutyunyan).
1. Verify RAF11 completed cleanly + all winners present; run `backfillRAFResults` if gaps (RAF site may post remaining results late).
2. RAF12/13/14: RAF13+14 have **0 fights** in DB (daily scraper was silently broken by the same selector). Confirm next daily `raf-scraper` run populates them; RAF Georgia scraped 12 vs DB 13 — check for a legit late cancellation.
3. ~~Audit `runTapologyLiveTracker.ts` (and any other standalone tracker) for the missing `refreshProductionScrapersCache` call.~~ **DONE** — added to all six that lacked it (BKFC, Oktagon, ONE FC, PFL, Tapology, UFC). Impact was the *inverse* of RAF's bug and benign in practice: all six types are in `DEFAULT_PRODUCTION_SCRAPERS` (or, for tapology, auto-publish unconditionally), so they over-published rather than shadow-only — but an admin toggle-off was silently ignored. Now they honour SystemConfig.
4. Mystery canceller: only matters if it recurs (it's harmless against a COMPLETED event + guarded code, but un-explained). See capture plan above.
5. ~~Consider porting the `isScrapeHealthyForCancellation` guard to the other **live** parsers.~~ **DONE.** Audit result: `ufcLiveParser`, `oneFCLiveParser`, `pflLiveParser` were already guarded. `matchroomLiveParser` and `sherdogLiveParser` have no cancellation pass at all (nothing to guard). The three that had RAF's exact unguarded pass are now fixed:
   - `bkfcLiveParser` + `oktagonLiveParser` — no guard whatsoever; gained the standard gate.
   - `tapologyLiveParser` — had `scrapeLooksValid = fights.length > 0 && fightsMatched > 0`, which only catches a **fully empty** scrape. A *partial* one (markup change dropping most bouts, or a paginated card where only the main card rendered) sailed through and cancelled everything it didn't see. Now gated on `isScrapeHealthyForCancellation(fightsMatched, dbNonCancelledCount)`. This is the widest-blast-radius fix of the three — tapology backs Zuffa Boxing, Karate Combat, Dirty Boxing, PFL, RIZIN.
   In all three, the gate applies to the **CANCEL branch only** — un-cancelling stays on the weaker condition so a wrongly-cancelled card still self-heals on the next pass.
6. ~~Delete temp scripts.~~ **DONE** — all `tmp-*` scripts removed.
