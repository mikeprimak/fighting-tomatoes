# Handoff: UFC Live Tracker Wikipedia Fallback

**Created:** 2026-04-11, late night (during UFC 327 live broadcast)
**For:** Next Claude Code window
**Status:** Investigation complete, design not started

---

## TL;DR

Tonight UFC 327: Prochazka vs. Ulberg was LIVE and the UFC live tracker stopped updating the app. I investigated and confirmed the Hetzner VPS (`scraper-service`) is healthy, but **UFC.com was unreachable** for the VPS and for GitHub Actions — Fastly CDN returning HTTP 500 on the homepage and hanging completely (HTTP 000, 15s timeout) on `/event/ufc-327` even with a real browser UA. The VPS tracker self-terminated after 10 consecutive navigation timeouts (`scraperService.ts:333`).

User wants a **smart backup system**: when UFC.com is unavailable, the live tracker should fall back to scraping Wikipedia:
- Event list: https://en.wikipedia.org/wiki/List_of_UFC_events
- Per-event page: https://en.wikipedia.org/wiki/UFC_327 (or equivalent for the current event)

UFC.com came back online for the user later in the session. Still blocked from my ISP — this is CDN/geo flakiness, will recur.

## Likely root cause: Fastly WAF is flagging the scraping IPs

This is not a generic UFC.com outage — the failure pattern is IP-specific blocking:

- **Homepage**: fast HTTP 500 (server responded with a rejection, <1s)
- **Event page** (`/event/ufc-327`): HTTP 000, 15s connection hang (silently dropped at L4)
- **Works fine from the user's residential browser** during the same window
- **Fails from** my ISP's outbound, GH Actions runners (Puppeteer navigation timeout), and almost certainly the Hetzner VPS (which is how the VPS UFC tracker racked up 10 consecutive errors and self-terminated)
- UFC.com is on **Fastly** (151.101.x.x) which runs an aggressive next-gen WAF with per-path rules

A real outage would fail both paths the same way. Different failure modes per path is the signature of **WAF rules that target specific paths from flagged IPs**. Polling `/event/<slug>` every 30 seconds from a static datacenter IP during a live event is exactly the pattern that trips Fastly's bot/rate scoring.

**Implication:** the Wikipedia fallback is not just a temporary workaround for a transient outage. It's a **permanent second source** because UFC.com will keep flagging whatever IP we scrape from, and the problem will get worse the more we poll. Treat the fallback as a first-class path, not an emergency escape hatch.

### Hardening the primary (UFC.com) scraper alongside the fallback
Even with Wikipedia in place, the UFC.com scraper should be more polite so it stays un-flagged as long as possible:

1. **Jitter + longer intervals.** Current 30s fixed interval → 60–120s with ±30% random jitter. Live UFC cards have enough dead time between fights that ~90s resolution is fine.
2. **Exponential backoff on 5xx / timeout.** After the first error, wait 2 min. After two in a row, 5 min. After three, stop trying UFC.com entirely for this event and go Wikipedia-only until the next event.
3. **User-agent rotation.** Puppeteer should cycle through a handful of real browser UAs per request. Not a silver bullet against Fastly fingerprinting, but trivial and helps.
4. **Never scrape the homepage.** The current flow only hits the event page — keep it that way. Don't add anything that fans out to `/fighters/` or `/athletes/` from the live tracker.
5. **Consider an `If-Modified-Since` / conditional request first.** Fastly honors these and a 304 doesn't count against most WAF rules the same way a full GET does.
6. **Residential proxy pool** (e.g. Bright Data, Oxylabs) is the nuclear option for the primary path if Wikipedia fallback quality isn't good enough. Cost/complexity tradeoff — don't do this unless Wikipedia alone proves insufficient over 2–3 live events.

### Hint for debugging in-session
If UFC.com is blocking from your current IP but you suspect it's path-specific: probe both `https://www.ufc.com/` and `https://www.ufc.com/event/<slug>` and compare status codes + response times. Matching failures = real outage. Divergent failures (fast 500 vs hanging 000) = WAF targeting.

---

## What I already verified tonight

### The VPS is fine
```bash
curl http://178.156.231.241:3009/health
# → {"ok":true,"trackers":1,"uptime":156252.298435881}
```
Uptime ~1.8 days, 1 active tracker. Auth required on `/track/status` and `/track/start`.

### The architecture
`packages/backend/src/scraperService.ts` runs on the VPS. Key bits:
- Dispatch entry points: `POST /track/start`, `POST /track/check`, `POST /track/stop`
- `autoDiscoverEvents()` at `scraperService.ts:521` — queries LIVE events with `scraperType IN ('ufc','oktagon','tapology','bkfc','onefc')`, starts a tracker per event
- `scrapeOnce()` at `:298` switches on `tracker.scraperType` → `case 'ufc': scrapeUFCOnce(tracker)`
- `consecutiveErrors >= 10` → `stopTracker()` — this is how UFC 327 got abandoned tonight
- Render backend calls `/track/check` every ~5 min from `eventLifecycle.ts:270`

### The failure mode tonight
My GH Actions fallback dispatch (`runs/24296475665`) failed with:
```
[UFC LIVE] Scraper failed: Command failed: node .../scrapeLiveEvent.js "https://www.ufc.com/event/ufc-327"
❌ Error: Navigation timeout of 30000 ms exceeded
```
The GH Actions workflow file is `.github/workflows/ufc-live-tracker.yml` — it exists, wired as the fallback for VPS unavailability (`eventLifecycle.ts:239-247`).

### UFC 327 DB state (when I last checked, ~02:00 UTC 2026-04-12)
- Event ID: `5eb4d63e-ec26-4c1a-9042-3be081db394a`
- `eventStatus`: LIVE
- Every fight: `trackerUpdatedAt: null`, `trackerFightStatus: null` — zero tracker writes for the whole event
- Reyes vs Walker: `fightStatus: LIVE` (probably set by section-based lifecycle, not tracker)
- Scheduled times: earlyPrelims 21:30 UTC, prelims 23:00 UTC, main card 01:00 UTC 2026-04-12

---

## The task

Design and implement a **smart** Wikipedia-based fallback for UFC live tracking. The user emphasized "smart" — don't just hammer Wikipedia every 30s.

### Wikipedia sources
- **Event list / discovery**: https://en.wikipedia.org/wiki/List_of_UFC_events — gives numbered UFC events, upcoming/completed split, each links to a per-event page
- **Per-event**: https://en.wikipedia.org/wiki/UFC_327 — contains the fight card as a wikitable. Columns typically: Weight class, Fighter A, vs., Fighter B, Method, Round, Time, Notes. Updated by Wikipedia editors during the event, usually within a few minutes of each fight finishing.

### Key design considerations (unresolved — decide with user)

1. **When to trigger the fallback** — options:
   - After N consecutive UFC.com errors on a single tracker instance (simple)
   - A pre-scrape health check: HEAD `ufc.com/event/<slug>` with 5s timeout, if it fails use Wikipedia
   - Both: try UFC.com first each cycle, on failure fall through to Wikipedia without stopping the tracker
   - Recommended: **per-cycle fall-through**, not a separate "fallback tracker". Keeps one tracker per event, tries primary first, secondary second. This is simpler than switching modes.

2. **How to find the Wikipedia URL for an event** — not all events are named `UFC_327`. Fight Nights are `UFC_Fight_Night:_<headliner1>_vs._<headliner2>` or `UFC_on_ESPN:_<n>`. Options:
   - Derive from `event.ufcUrl` slug (`ufc-327` → `UFC_327`) — works for numbered PPVs only
   - Scrape `List_of_UFC_events` once per event, match by date + headliner names, cache the resulting wiki URL on the event row (new column `wikiUrl` or store in a JSON field). Cache is critical — don't re-resolve every 30s.
   - The user said "smart" — caching the resolved URL is the obvious win here

3. **Wikipedia scrape shape** — unlike UFC.com:
   - No dynamic rendering needed, just HTML. Can use `fetch` + `cheerio`, no Puppeteer. Much lighter.
   - Wikipedia asks for a custom User-Agent per their bot policy: `Good Fights app (contact@goodfights.app)` or similar. **Don't skip this** — their WAF will rate-limit generic curl UAs.
   - Use the raw wikitext API for stability instead of scraping HTML: `https://en.wikipedia.org/w/api.php?action=parse&page=UFC_327&format=json&prop=wikitext`. Wikitext is less likely to break when layouts change.
   - **Respect etag / cache-control**: Wikipedia sends strong caching headers. Send `If-None-Match` on subsequent requests and skip parse on 304. This is the "smart" part — don't re-parse when the page hasn't changed.

4. **Parser output shape** — must match what `ufcLiveParser.ts` produces so it can feed the same `buildTrackerUpdateData()` in `liveTrackerConfig.ts`. That function normalizes to: `fightStatus`, `winner`, `method`, `round`, `time`, `currentRound`, `completedRounds`. Read `packages/backend/src/services/ufcLiveParser.ts` and mirror its output schema.

5. **Rate limits** — Wikipedia allows generous rate limits for read-only API access (no hard cap for reasonable polling), but the `Maxlag` parameter is courteous. Also, if we only poll on change (etag-based), we're well within limits regardless.

6. **Accuracy gap / staleness** — Wikipedia lags UFC.com by a few minutes during live events. That's fine for a fallback but don't pretend it's real-time. Consider a `trackerSource` field on the fight so the mobile UI can show "last updated via Wikipedia" vs "last updated via UFC.com" (optional).

7. **Don't break non-UFC** — the fallback should only apply to `scraperType === 'ufc'`. Tapology/Oktagon/BKFC/etc. already have their own primary sources.

### Files to read/touch

| File | Why |
|------|-----|
| `packages/backend/src/scraperService.ts` | VPS tracker loop; add fallback inside `scrapeUFCOnce` or as a sibling `scrapeUFCFallback` |
| `packages/backend/src/services/ufcLiveParser.ts` | Existing output shape; reuse `buildTrackerUpdateData()` integration |
| `packages/backend/src/services/scrapeLiveEvent.js` | The Puppeteer UFC.com scraper that's been failing — understand how it's invoked and what it outputs |
| `packages/backend/src/config/liveTrackerConfig.ts:98-105` | `buildTrackerUpdateData()` — final DB write path, already handles the normalized shape |
| `packages/backend/src/scripts/runUFCLiveTracker.ts` | GH Actions entry point; mirror the same fallback there so GH Actions runs also benefit |
| `.github/workflows/ufc-live-tracker.yml` | No changes needed if fallback lives in the script |
| Prisma schema | Maybe add `Event.wikiUrl` (nullable String) to cache resolved wiki URLs. Ask user before migrating. |

### Test plan (suggested)
1. Unit test: feed a saved copy of `en.wikipedia.org/wiki/UFC_327` HTML/wikitext into the new parser, assert the fight rows come out matching the DB.
2. Integration test: run the new fallback against a completed event (e.g. UFC 326) and verify it produces COMPLETED-state writes identical to what the UFC.com path would have written.
3. Live test: on the next UFC event, deliberately break UFC.com access (e.g. block it in the VPS firewall) and confirm Wikipedia takes over.

---

## Useful commands

**Dispatch the existing GH Actions UFC tracker manually:**
```bash
curl -X POST -H "Authorization: token $(cat github-key.txt)" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/ufc-live-tracker.yml/dispatches" \
  -d '{"ref":"main","inputs":{"event_id":"<EVENT_ID>"}}'
```

**VPS health:**
```bash
curl http://178.156.231.241:3009/health
# /track/status and /track/start require Bearer token — see Render env for SCRAPER_API_KEY
```

**Check DB state of an event via backend API (no auth needed):**
```bash
curl -s "https://fightcrewapp-backend.onrender.com/api/events/<EVENT_ID>"
curl -s "https://fightcrewapp-backend.onrender.com/api/search?q=UFC+327&limit=5"
```

**Redeploy VPS after a fix** (from the VPS via SSH):
```bash
bash /opt/scraper-service/packages/backend/vps-update.sh
# git pull && pnpm install && pnpm build && systemctl restart scraper-service
```
Note: the VPS does NOT auto-deploy from main. Every scraper-service fix requires this step.

---

## Open questions for the user before implementing

1. **Cache wiki URL on Event row?** — requires a Prisma migration. Alternative: resolve every time from `List_of_UFC_events` (slower, but no schema change).
2. **Fallback scope** — UFC only, or extend the same Wikipedia fallback pattern to other promotions later? (Probably UFC-only for now.)
3. **trackerSource field?** — would let mobile UI show data provenance. Nice-to-have, not required.
4. **Section-based lifecycle interaction** — the existing lifecycle already guesses completion from schedule. If the Wikipedia fallback is working, should the section-based guesser be disabled for UFC events to avoid it stomping real results? (Probably yes — tracker data should always win over time-based guesses.)
