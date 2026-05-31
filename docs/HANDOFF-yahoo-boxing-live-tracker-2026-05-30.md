# HANDOFF — Yahoo/Uncrowned boxing live tracker (2026-05-30)

Built and run live during **MVPW-03 "Han vs. Holm 2"** (all-women's boxing, ESPN).
This is the boxing analog of the Sherdog MMA tracker. Read this before running
the next boxing card (MVP, Matchroom, Top Rank boxing, Golden Boy, DAZN, etc.).

## Why this exists

**Sherdog is MMA-only** — it does not publish play-by-play for boxing cards
(confirmed: 404 on all PBP URL patterns for Han vs Holm while tonight's *MMA*
cards — PFL Brussels, UFC Macau — all had Sherdog PBP pages). So every boxing
org fell through to the **no-tracker bulk-flip**: the moment the event goes LIVE,
the lifecycle marks the whole card COMPLETED with no winners and gives no
per-fight start signal — i.e. **no "fight about to start" notifications**, which
is the tracker's primary purpose.

## What the tracker's job actually is

The **primary purpose is the START signal for notifications**, not result
backfill. The model (same as every other tracker + the manual-tracker cascade in
`admin.ts`): **when a fight's result comes in, notify the *next* fight as "up
next"** — users get a ~10-15 min heads-up before the next ring walk. Result
backfill (winner/method) is a secondary nicety.

## Source decision: Yahoo / Uncrowned live blog

Scouted the full boxing source ladder live (see the experiments log in
`docs/areas/live-trackers.md`). Winner: **Yahoo Sports / Uncrowned live blogs**,
which cover ~every major boxing card. URL shape:
`https://sports.yahoo.com/boxing/live/<event-slug>-...html`

Two signals on the page:
1. **Canonical result recap** — flips per fight from `"{A} vs. {B}"` to
   `"{Winner} def. {Loser} by {METHOD} ({scores})"`, e.g.
   `"Nazarena Romero def. Maria Salinas by UD (80-72 × 3)"`. This is the
   authoritative, low-noise result source. We parse only the `def.` entries.
2. **schema.org `LiveBlogPosting` JSON-LD** — a rolling window of the ~20 most
   recent timestamped updates (`datePublished` + `headline` + `articleBody`).
   Used for freshness; **not** the result source.

Sources rejected: BoxRec (post-fight only, "scheduled" until done — but a good
**post-event result-backfill** source); MVP promoter page (clean results but
JS-hydrated, `fetch()` returns an empty shell — only curl works, so not usable
from the Node scraper); Tapology (no live data for MVP — *this is the gap*);
FightMag (403). Sherdog (404 — MMA only).

## What was built (all committed + pushed to `main`)

| File | What |
|---|---|
| `packages/backend/src/services/yahooLiveBlogScraper.ts` | Parses the canonical `def.` recap (source-agnostic `by\|via`, so it also reads promoter-style "via unanimous decision" text). Emits the **same data shape as the Sherdog scraper** so it feeds the existing reconciler unchanged. |
| `packages/backend/src/scripts/runYahooLiveBlogTracker.ts` | One-shot CLI runner: `--event-id <uuid> --url <yahoo-url> [--dry-run]`. Enables `notifyNextFightOnComplete`. |
| `packages/backend/src/services/sherdogLiveParser.ts` | **Reused** (promotion-agnostic). Added: (a) `notifyNextFightOnComplete` option — on a newly-COMPLETED fight, fire the next-fight up-next notif (same orderOnCard cascade as `admin.ts`); opt-in so Sherdog's Live-NOW path is untouched and never double-fires. (b) token-based name matching in `findDbFight`. (c) event-completion `completionMethodOverride`. |

Commits: `ec952cb` (scraper+runner+parser reuse), `99a2895` (cascade + token
matching), `3bebd69` (full-name winner resolution).

The reconciler reuse is the key design win: `parseSherdogLiveData` is
promotion-agnostic, so Yahoo just emits its shape and calls it with
`completionMethodOverride: 'yahoo-tracker'` + `notifyNextFightOnComplete: true`.
No parser fork.

## OPERATIONAL PLAYBOOK — running a future boxing card

1. **Find the Yahoo live blog URL.** Search `sports.yahoo.com boxing live <event
   name>` (or web search "<main event> live results round by round"). It's
   usually published the day of / morning of.
2. **Get the DB event id** (query by event name).
3. **Set the event to manual-tracker mode** so the lifecycle no-tracker bulk-flip
   doesn't fire: `UPDATE events SET "useManualLiveTracker" = true WHERE id = ...`
   (or via script). **Critical** — see gotcha #2.
4. **Dry-run** to confirm name-matching: `npx tsx
   src/scripts/runYahooLiveBlogTracker.ts --event-id <id> --url <url> --dry-run`.
5. **Run it on a ~90s loop** for the duration of the card (background bash loop;
   tsx recompiles each cycle so code edits are picked up live). It will:
   - mark each fight COMPLETED + backfill winner/method as the result lands,
   - fire the **"next fight up next"** notification each time a result comes in.
6. **Verify notification plumbing for the event's fights** (see gotcha #4) —
   reset any wrongly-`notificationSent=true` rows on UPCOMING fights.

## CRITICAL GOTCHAS (these all bit us tonight)

1. **Yahoo keeps only ~20 recent posts → old results scroll off the page.** Poll
   frequently (≤90s) to catch each result while fresh. If you start the tracker
   late, results that already scrolled off are unrecoverable from Yahoo — use
   BoxRec or the promoter page for those. (Tonight Gueche's result was missed
   because the tracker didn't exist yet when it scrolled off; backfilled later.)
2. **No-tracker bulk-flip marks the WHOLE card COMPLETED at event start.** MVP
   events have only a single `mainStartTime` (no section times) and no reliable
   tracker, so when they go LIVE the lifecycle's Step 2 bulk-flips *every* fight
   to COMPLETED-no-winner at once — including the main event hours early. **Set
   `useManualLiveTracker = true`** (Step 2 skips manual-tracker events). Reverting
   fights to UPCOMING without this is futile — Step 2 re-flips them every 5 min.
3. **`orderOnCard` ≠ broadcast order for prelims.** Tonight the prelims were
   reshuffled (Yahoo literally posted "scheduling mix-up... Nery is now the
   opening fight on the main card"). BUT **the main card runs in `orderOnCard`
   order (#4 → #3 → #2 → #1 main event)**, so the cascade + app "up next" are
   correct for the fights that matter. Don't trust orderOnCard to tell you which
   *prelim* is next.
4. **`notificationSent` can be wrongly `true` → notifs silently suppressed.** The
   bulk-flip / chaos marked some upcoming fights' `fightNotificationMatch` rows
   `notificationSent=true`. `notifyFightStartViaRules` only sends to
   `notificationSent=false` rows, so the **main-event notif was about to be
   silently skipped**. Before/during a card, reset `notificationSent=false` on
   active matches for fights that are still UPCOMING.
5. **App "up next" = highest `orderOnCard` still UPCOMING.** So any early-prelim
   opener wrongly left UPCOMING surfaces as "up next" (tonight: Portillo showed
   as up next during the main card). Keep done fights COMPLETED. If Yahoo/promoter
   don't cover the early openers, mark them COMPLETED (`completionMethod:
   'manual-prelim-passed'`) once the broadcast has clearly moved past them.
6. **Name variants:** Yahoo uses fuller names than our DB ("Yesica Nery Plata" vs
   "Jessica Nery"). Fixed with token matching in `findDbFight` + passing the full
   winner name to `resolveWinnerId`. Watch for new variants on each card; the
   dry-run's "No DB match" lines flag them.

## What is NOT built yet (deferred — the real "future cards" work)

- **Durable wiring (highest priority).** Tonight ran via a manual CLI loop, NOT
  the lifecycle/VPS. Mirror the Sherdog rollout: add `Event.yahooLiveBlogUrl
  String?` (migration), a lifecycle Step-1 dispatch branch (`if
  yahooLiveBlogUrl → triggerVPSLiveTracker('yahoo')`), a VPS `scrapeYahooOnce`
  handler + auto-discovery, and add `'yahoo'` to `VPS_SUPPORTED_SCRAPERS`. Then a
  future card is just: set the URL on the event, done.
- **Live-fight detection.** We detect fight-END (results) only — there is no
  per-fight "currently LIVE" highlight maintained automatically (Yahoo has no
  clean "Live NOW" marker like Sherdog). The "up next" cascade fires on
  completion; the app's "up next" is the orderOnCard heuristic. A future
  enhancement could parse ring-walk posts ("X and Y head to the ring") to set a
  fight LIVE.
- **BoxRec post-event result backfill** for early openers Yahoo doesn't cover.
- **Auto-discovery** of the Yahoo URL (daily probe) — unbuilt, manual for now.
- **Web app** doesn't know about any of this (server-field driven, so results
  flow through, but no boxing-specific UI work was done).

## Tonight's live run (reference)

- Event: `Han vs. Holm 2` id `89b8c5c8-42ee-4208-89c0-c5e3211c2563`.
- Yahoo URL: `https://sports.yahoo.com/boxing/live/stephanie-han-vs-holly-holm-2-live-results-round-by-round-updates-ring-walks-for-texas-rematch-070000761.html`
- Results captured + backfilled: Romero, Soto, Nery (Plata), Reyes, Gueche (all UD).
- Cascade verified: Nery ended → **Robinson vs Spencer notified as up next**
  (user confirmed receiving the push). Chain for the rest of the main card:
  Robinson → Juarez/Valle → Serrano → Han/Holm.
- Manual interventions tonight (won't be needed once durable wiring lands):
  `useManualLiveTracker=true`; reconciled the bulk-flipped board to reality;
  reset suppressed `notificationSent` flags; fired the missed Robinson notif;
  marked the 3 uncovered openers COMPLETED.
