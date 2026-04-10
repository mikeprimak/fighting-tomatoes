# Scrapers

## Overview
Automated data collection for fight cards across 14+ promotions. Mix of direct scrapers and Tapology-based scrapers.

## Scraper Inventory

| Scraper | Source | Automation | Key File |
|---------|--------|------------|----------|
| UFC | ufc.com | GitHub Actions daily cron | `services/scrapeAllUFCData.js` |
| ONE FC | onefc.com | GitHub Actions daily cron | `services/scrapeAllOneFCData.js` |
| PFL | pflmma.com | GitHub Actions daily cron | `services/scrapeAllPFLData.js` |
| Karate Combat | Tapology | GitHub Actions daily cron | `services/scrapeKarateCombatTapology.js` |
| Dirty Boxing | Tapology | GitHub Actions daily cron | `services/scrapeDirtyBoxingTapology.js` |
| BKFC | Tapology | Auto via lifecycle | Live tracker only |
| RIZIN | Tapology | Auto via lifecycle | Live tracker only |
| Zuffa Boxing | Tapology | Auto via lifecycle | Live tracker only |
| Matchroom | Manual | — | — |
| Top Rank | Manual | — | — |
| Golden Boy | Manual | — | — |
| Oktagon | Manual | — | — |
| MVP | Manual | — | — |
| RAF | Manual | — | — |

## Live Trackers
- **UFC Live Tracker:** `services/ufcLiveParser.ts` — dispatched by lifecycle
- **Tapology Live Tracker:** `scripts/runTapologyLiveTracker.ts` — generic, covers multiple promotions
- Config: `src/config/liveTrackerConfig.ts` (`PRODUCTION_SCRAPERS`, `buildTrackerUpdateData()`)

## GitHub Actions Workflows
- `ufc-scraper.yml` — daily UFC data scrape
- `ufc-live-tracker.yml` — live event tracking during UFC events
- `pfl-scraper.yml` — daily PFL data scrape (22:00 UTC)
- Manual trigger via curl (gh CLI not installed):
  ```bash
  curl -X POST -H "Authorization: token $(cat github-key.txt)" \
    "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/{workflow}.yml/dispatches" \
    -d '{"ref":"main"}'
  ```

## Key Gotchas
- **UFC scraper** MUST run with `TZ=America/New_York` — UFC.com adapts times to viewer timezone via client-side JS. GitHub Actions runners are UTC, so without this the parser gets wrong times.
- **PFL scraper** must only scrape *upcoming* events, not the full historical archive. `pflmma.com/all-seasons` renders both upcoming and past events in the same DOM via two tab panels (`#nav-upcoming` and `#nav-past`). Step 1 scopes the event-link `querySelectorAll` to `#nav-upcoming` — do NOT use the whole `document` or you'll scrape ~130 past events back to 2018 and time out before the import step runs. See `2026-04-09.md` for the debug log.
- **PFL per-event date** must come from the **calendar share links** on the event page (`dates=20260411T180000`, `dtstart=`, `st=`), NOT from `DateTime.fromISO(...)` in page scripts. The DateTime.fromISO script is the site-wide countdown timer in the header, which shows the *next featured PFL event across all events* — so every event page's script scrape returns the same date. Using the calendar-URL extraction in Step 2 (`eventDateFromCalendar`) gives a reliable per-event date. Upcoming events show no year on the list page (`Fri, Apr 10`), so list-view date parsing is unreliable for upcoming events anyway. If the calendar fallback breaks, every event will get the parser's `2099-01-01` placeholder and disappear from the mobile "upcoming" tab. See `2026-04-09.md` for the debug log.
- **PFL event start time** is currently still scraped from `DateTime.fromISO(...)` and will be wrong for non-featured events (same countdown-pollution problem as above). Not fixed yet — promote the `"Main Card: X:XX PM ET"` text extraction above the ISO scrape when you get to it.
- **RAF scraper** determines event status from the per-event page's `div.past-event-tag` (`isPastEvent`), not from gallery card buttons. An earlier version keyed off "buy tickets" button presence, which wrongly marked future events as Complete whenever tickets weren't yet on sale (e.g. RAF 09 May 30 2026). Fallback when the event page scrape fails is date-based with a 24-hour buffer — don't reintroduce button-presence heuristics. Also note: `rafDataParser.ts:225` is write-once on `eventStatus`, so re-running the scraper will NOT correct a historically wrong status; those have to be fixed at the DB level. See `2026-04-09.md`.
