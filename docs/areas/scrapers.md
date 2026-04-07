# Scrapers

## Overview
Automated data collection for fight cards across 14+ promotions. Mix of direct scrapers and Tapology-based scrapers.

## Scraper Inventory

| Scraper | Source | Automation | Key File |
|---------|--------|------------|----------|
| UFC | ufc.com | GitHub Actions daily cron | `services/scrapeAllUFCData.js` |
| ONE FC | onefc.com | GitHub Actions daily cron | `services/scrapeAllOneFCData.js` |
| Karate Combat | Tapology | GitHub Actions daily cron | `services/scrapeKarateCombatTapology.js` |
| Dirty Boxing | Tapology | GitHub Actions daily cron | `services/scrapeDirtyBoxingTapology.js` |
| BKFC | Tapology | Auto via lifecycle | Live tracker only |
| PFL | Tapology | Auto via lifecycle | Live tracker only |
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
- Manual trigger via curl (gh CLI not installed):
  ```bash
  curl -X POST -H "Authorization: token $(cat github-key.txt)" \
    "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/{workflow}.yml/dispatches" \
    -d '{"ref":"main"}'
  ```

## Key Gotcha
UFC scraper MUST run with `TZ=America/New_York` — UFC.com adapts times to viewer timezone via client-side JS. GitHub Actions runners are UTC, so without this the parser gets wrong times.
