# HANDOFF — PFL live tracker not auto-dispatching despite fix

**Date**: 2026-05-02 (started ~21:30 ET / 01:30 UTC May 3)
**Severity**: PFL Sioux Falls 2026 is LIVE right now; main card starts 03:00 UTC. Tracker not running on its own.

## Symptom

PFL Sioux Falls 2026 (event id `323ad4a9-8c8a-4a48-8d62-fae8aceada34`) is `LIVE` in prod DB but `pfl-live-tracker.yml` is not auto-dispatching every 5 min the way it should. All 12 fights still `UPCOMING`. Fix `da0eb3e` was supposed to handle this but the auto-redispatch never started.

## Timeline (UTC)

| Time | Event |
|------|-------|
| 23:00 May 2 | Event flipped UPCOMING → LIVE (prelimStartTime hit) |
| 23:52 | User manual workflow_dispatch #1 |
| 23:52 | User manual workflow_dispatch #2 |
| 00:03 May 3 | Commit `da0eb3e` pushed to main (the fix) |
| 00:07 | Render says deploy is "live" (per user looking at Render dashboard) |
| 00:08 | Manual workflow_dispatch #3 |
| 01:30 | Empty kick-commit `96cbe2f` pushed to force re-deploy |
| 01:49 | Claude manual workflow_dispatch #4 (in_progress at end of session) |

**102 minutes between the supposed "live" deploy at 00:07 and now, with zero auto-dispatches.** If Render were really running `da0eb3e`, Step 1.5 should have fired the workflow ~15 times in that window (5-min interval, 4-min cooldown).

## Event state at session end

```
GET /api/events/323ad4a9-8c8a-4a48-8d62-fae8aceada34
{
  "eventStatus": "LIVE",
  "prelimStartTime": "2026-05-02T23:00:00.000Z",   // passed
  "mainStartTime":   "2026-05-03T03:00:00.000Z"     // not yet — main card starts ~90 min after session pause
}
```

`scraperType` not exposed on the public events endpoint — **needs verification** (see hypotheses).

## Code that should be making this work

`packages/backend/src/services/eventLifecycle.ts` Step 1.5 (lines ~275-333) on `da0eb3e`:

```ts
const liveScraperEvents = await prisma.event.findMany({
  where: {
    eventStatus: 'LIVE',
    scraperType: { in: ['ufc', 'oktagon', 'bkfc', 'onefc', 'raf', 'pfl'] },
  },
});
// VPS_SUPPORTED_SCRAPERS = ['ufc', 'oktagon', 'bkfc', 'onefc']  (pfl/raf NOT included)
// Both branches dispatch GH for ev.scraperType not in VPS_SUPPORTED_SCRAPERS
```

Logic verified by re-reading: PFL with `scraperType='pfl'` will hit the GH dispatch path on every 5-min tick.

`triggerGitHubLiveTracker` has a 4-min per-workflow in-memory cooldown, so 5-min ticks will pass cleanly.

## Hypotheses (ranked, NOT yet verified)

1. **PFL Sioux Falls' `scraperType` is not `'pfl'`** — could be `'tapology'`, null, or empty.
   - Migration script exists at `packages/backend/src/scripts/migratePFLScraperType.ts` (flip tapology → pfl).
   - Sioux Falls was created 2026-02-25 per the search response — predates the PFL scraper migration `f43ac63`. The migration script should have caught it but maybe didn't.
   - **How to verify**: hit admin DB endpoint or run a script: `prisma.event.findUnique({ where: { id: '323ad4a9-...' }, select: { scraperType: true } })`.

2. **GITHUB_TOKEN env var missing on Render**.
   - `triggerGitHubLiveTracker` silently returns false if `process.env.GITHUB_TOKEN` is unset.
   - Old code only fell back to GH on VPS error, so we have no recent confirmation that GITHUB_TOKEN works on Render.
   - **How to verify**: look at recent `ufc-live-tracker.yml` / `bkfc-live-tracker.yml` runs — if they show recent `workflow_dispatch` events from Render, the token works.

3. **Render is showing a stale deploy as "live"**.
   - User read "8:07" off the dashboard but that may be the previous deploy (e.g. `d69bfdf`), not `da0eb3e`.
   - Empty commit `96cbe2f` should have triggered a fresh deploy; not yet confirmed it landed.
   - **How to verify**: SHA on Render's deploy panel should be `96cbe2f...` (or `da0eb3e...` minimum).

4. **Render auto-deploy from GitHub is broken / disabled**.
   - **How to verify**: dashboard.

## What I did before pausing

- ✅ Manual dispatch of `pfl-live-tracker.yml` for Sioux Falls (run #4, 01:49 UTC, in_progress)
- ✅ Empty commit `96cbe2f` pushed to force Render redeploy
- ❌ Did NOT verify scraperType on the actual event
- ❌ Did NOT confirm GITHUB_TOKEN is set on Render
- ❌ Did NOT confirm Render is on `da0eb3e`+ via SHA

## Next session — order of ops

1. Verify scraperType: open admin panel for the event OR run a quick script with `prisma.event.findUnique({ where: { id: '323ad4a9-8c8a-4a48-8d62-fae8aceada34' }, select: { scraperType: true, name: true, eventStatus: true } })`. If it's `'tapology'` or null → **that's the root cause**, fix with an UPDATE.
2. If scraperType is correct, check Render dashboard:
   - Currently-live deploy SHA — must be `96cbe2f` or `da0eb3e`.
   - Recent service logs — search for `[Lifecycle]` entries. If absent → lifecycle isn't running. If present but logging "No GITHUB_TOKEN set" → fix env var.
3. While the broadcast is live: keep a manual-dispatch loop firing pfl-live-tracker every ~5 min until either (a) auto-dispatches start showing up, or (b) the event flips COMPLETED.
4. After the event closes, verify the fights got winners/methods populated. If they're still UPCOMING, run the no-tracker fix (mark fights COMPLETED) via admin or section-based completion.

## Reference IDs

- Fix commit: `da0eb3e`
- Kick commit: `96cbe2f`
- Event ID: `323ad4a9-8c8a-4a48-8d62-fae8aceada34`
- Workflow: `.github/workflows/pfl-live-tracker.yml`
- Manual dispatch curl (with `event_id` input):
  ```bash
  curl -X POST -H "Authorization: token $(cat github-key.txt)" \
    "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/pfl-live-tracker.yml/dispatches" \
    -d '{"ref":"main","inputs":{"event_id":"323ad4a9-8c8a-4a48-8d62-fae8aceada34"}}'
  ```

## Tooling note

PowerShell `Invoke-RestMethod` against Render's free-tier endpoints hung repeatedly this session. **Use `curl` via Bash for any Render HTTP work** — it returns instantly and respects timeouts.
