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
| Top Rank | Tapology | GitHub Actions daily cron | `services/scrapeTopRankTapology.js` |
| Golden Boy | Tapology | GitHub Actions daily cron | `services/scrapeGoldenBoyTapology.js` |
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
- **Tapology live tracker** (`services/tapologyLiveParser.ts` + `services/tapologyLiveScraper.ts`) now has two non-obvious behaviors added 2026-04-10:
  1. **On-the-fly fight creation**: if a scraped Tapology fight has no matching DB fight (fighter-name match with several fallback strategies), the parser creates both fighters via `findOrCreateFighter` and the fight row in place. `orderOnCard` comes from Tapology's card position (`boutOrder`, extracted from `#boutCompactNumber{boutId}`) — opener = 1, main event = N. Falls back to `max(orderOnCard) + 1` if that slot is taken. This is how we recovered from the PFL daily scraper missing Mohamed vs Samuel on the Pretoria card.
  2. **Idempotent completion**: the completion block is no longer gated on `fightStatus !== 'COMPLETED'`. It compares each result field (winner/method/round/time) against the DB value and writes any difference. This lets the tracker backfill a result onto a fight that the lifecycle job already marked complete without data (the premature-completion case).
  - **No Contest / Draw**: Tapology rendered as `<span class="uppercase">Ends in a No Contest, Unintentional Eye Poke</span>`. `normalizeMethod` checks `"no contest"` and `"draw"` **before** the KO/TKO branch (re-ordered 2026-04-10 because "No Contest, Accidental Knockdown" could otherwise misclassify). For NC/Draw the parser sets `winner` to the sentinel string `'nc'` / `'draw'` per the `Fight.winner` schema comment, NOT null — the mobile UI renders the blue NC badge based on this value.
- **Tapology scraper output directory convention**: the output dir in each `scrape*Tapology.js` MUST match the input dir in the corresponding `*DataParser.ts`, or the import step ENOENTs on `latest-events.json` every run — scrape logs success, the CI job exits 1. Convention across the codebase is **no hyphens / concatenated lowercase** (`goldenboy`, `toprank`, `dirtyboxing` family — though Dirty Boxing historically uses `dirty-boxing` and both sides agree). Admin panel key (`admin.html`), image dirs (`/images/events/<promo>/`), and R2 paths all follow the no-hyphen form. Golden Boy and Top Rank were silently failing daily because the scrapers wrote to `golden-boy` / `top-rank` while the parsers read from `goldenboy` / `toprank` — fixed 2026-04-10. See `2026-04-10.md`.
- **Event-lookup `findFirst` in Tapology parsers MUST be tightly scoped**. The pattern `OR: [{ ufcUrl }, { name }, { name: { contains: '<promotion>' } }]` is dangerous because Prisma's `findFirst` is unordered — the third clause will cross-match unrelated events in the same promotion, and the subsequent `update` will try to overwrite that wrong row's `ufcUrl` with a URL another row already legitimately owns → `P2002 Unique constraint failed on (ufcUrl)`. Correct pattern (used by `ufcDataParser.ts` and now `dirtyBoxingDataParser.ts`): match on `ufcUrl` first, fall back to `(promotion, exactName)` or `(promotion, dateWindow)`, and wrap the `update` in a `try/catch` that retries **without setting `ufcUrl`** on P2002 so legacy duplicate rows don't block the sync. Dirty Boxing was crashing every daily run on DBX 5 because of this — fixed 2026-04-10.
- **The PFL / BKFC / RIZIN / Zuffa / Karate Combat / Dirty Boxing live trackers all run on the Hetzner VPS** (`scraper-service` systemd unit, port 3009), **not GitHub Actions**. `eventLifecycle.ts` calls the VPS first via `VPS_SCRAPER_URL` and only falls back to `tapology-live-tracker.yml` if the VPS is unreachable. **The VPS does not auto-deploy from `main`** — fixes to `tapologyLiveScraper.ts`/`tapologyLiveParser.ts`/`scraperService.ts` require SSH + `bash /opt/scraper-service/packages/backend/vps-update.sh` (does `git pull && pnpm install && pnpm build && systemctl restart scraper-service`). If you push a tracker fix and it doesn't show up, this is almost certainly why. See `2026-04-10.md`.
