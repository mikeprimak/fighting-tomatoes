# Durable fix: read BKFC live results from the stats API (not rendered DOM)

**Status:** Planned (not started). Written 2026-06-19 during BKFC Nashville.
**Priority:** Medium — the live tracker currently *works*, but its result
extraction is fragile. This hardens it.

## Background / what happened 2026-06-19

During BKFC Nashville, the live tracker correctly tracked the current bout but
appeared to miss winners/methods early in the card. Investigation showed:

- The live scraper (`services/scrapeBKFCLiveEvent.js`) extracts results by
  screen-scraping rendered Webflow DOM: `.fight-card_win-label` badges for
  winner, `[data-render="WinMethod"]` for method, `RoundEnded`/`RoundEndedTime`
  for round/time. Current-bout uses a separate `current-bout` attribute, which
  is why status tracking kept working while results lagged.
- The DOM extraction is timing/structure-fragile (8s fixed wait after
  `networkidle2`, Webflow markup, slug→corner mapping). Early in the card the
  badges hadn't populated when the scraper read them → null results.
- **It did recover**: by mid-card all completed fights had correct
  winner/method/round/time in the DB (shadow fields `trackerWinner`/
  `trackerMethod` set per-fight, timestamps spread as each fight ended). So the
  tracker works — it's just fragile and laggy.

The page's real data source is a clean JSON API:

```
https://xapi.mmareg.com/api/v2/bkfc/?type=json&modifier=event-stats&id=<API_ID>
```

The `<API_ID>` (e.g. `1294` for BKFC Nashville) is embedded in the bkfc.com
event page HTML as part of that URL. The API needs no JS and isn't bot-blocked
(plain `curl` with a UA works).

### API shape (authoritative)

Top level: `EventComplete` (0/1), `LiveLoggingInSession` (0/1),
`LiveLoggingSession: { CurrentBout: <BoutID>, CurrentRound, LiveNow }`, and
`Bouts: { Bout1..BoutN }`. `BoutNumber` is ASCENDING in fight order (1 = opener,
N = main event) — the inverse of our DB `orderOnCard` (1 = main event).

Each bout:

| Field | Example | Use |
|---|---|---|
| `RedFirstName`/`RedLastName`, `BlueFirstName`/`BlueLastName` | "Joby"/"Steffensmeier" | match to DB fight by last-name pair |
| `RedResult`/`BlueResult` | `"win"`/`"lose"` | winner corner |
| `WinMethod` | `"Split Decision"`, `"KO"`, `"TKO"` | method (NOTE: verbose for decisions) |
| `RoundEnded` | `3` | round |
| `RoundEndedTime` | `"02:00"` | time |
| `LoggingComplete` | `1` | bout finished |
| `BoutID` | `8863` | matches `LiveLoggingSession.CurrentBout` for the live bout |

## The fix (two parts — BOTH required)

### 1. Scraper: source results from the API, not the DOM

In `scrapeBKFCLiveEvent.js`, capture the API JSON and use it as the
authoritative result source. Two viable approaches:

- **(preferred) Direct fetch:** extract `API_ID` from the page HTML/DOM, then
  `fetch()` the API URL from Node and build results from JSON. Most robust — no
  dependence on Puppeteer network timing. Could even skip Puppeteer for results
  entirely (the API also gives current bout + live flags), but keep the page
  load for now to avoid a bigger rewrite.
- **(fallback) Network intercept:** `page.on('response')` capturing the
  `xapi.mmareg.com ... event-stats` response and `await response.json()`.

Keep DOM scraping ONLY as a fallback if the API is unreachable. Merge: for each
fight in `eventData.fights`, match the API bout by unordered last-name pair
(fuzzy — handle "Fichter"/"Fichtner" one-char drift), then override
`result {winner, method, round, time}`, `isComplete`, `hasStarted` from the API.
Use `RedResult/BlueResult === 'win'` for the winner corner; treat
`LoggingComplete === 1` (or a present win/lose) as complete.

### 2. Parser: preserve decision subtypes in `standardizeMethod`

⚠️ **Load-bearing.** Today the app shows `SD`/`UD` because the DOM badge is
already abbreviated and `standardizeMethod` (in `bkfcLiveParser.ts`, lines
~78–94) passes unknown short strings through unchanged. The API instead returns
verbose `"Split Decision"`/`"Unanimous Decision"`, which the CURRENT
`standardizeMethod` collapses to `DEC` (the `.includes('decision')` branch). So
switching the source to the API WITHOUT this change would regress method
specificity from `SD`/`UD`/`MD` to `DEC`.

Add, BEFORE the generic decision branch:

```ts
if (m.includes('unanimous')) return 'UD';
if (m.includes('split'))     return 'SD';
if (m.includes('majority'))  return 'MD';
if (m.includes('decision') || m === 'dec') return 'DEC'; // existing fallback
```

(The temporary sync script `scripts/syncBKFCLiveFromApi.ts` already does this
mapping — mirror it.)

## Deploy + validation

- The BKFC live tracker runs on the **Hetzner VPS**, not GitHub Actions
  (see memory `lesson_live_trackers_run_on_vps_not_gh_actions`). Deploy via
  `vps-update.sh` — there is no auto-deploy. **Do NOT deploy mid-event.**
- Before deploying, confirm the VPS is running code consistent with this repo
  (the `SD`/`UD` behavior matched this repo's parser + abbreviated DOM badge, so
  it appears to be — but verify, don't assume).
- Validate against a live or recently-completed event: run the scraper, confirm
  every completed bout yields correct winner/method (incl. `SD`/`UD`/`MD`)/
  round/time, and that `current-bout`/live status still tracks.

## Interim safety net used tonight

`packages/backend/scripts/syncBKFCLiveFromApi.ts` — polls the API every 60s and
writes ONLY missing results to prod (never cancels/resets; idempotent; auto-
stops on `EventComplete`). Safe to re-run for any BKFC event:
`npx tsx scripts/syncBKFCLiveFromApi.ts <eventId> <apiId>`. Decide whether to
keep it as a permanent backstop or delete once the scraper fix ships.
