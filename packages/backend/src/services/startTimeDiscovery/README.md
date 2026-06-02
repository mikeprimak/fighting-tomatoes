# Start-Time Discovery

Daily job that finds the **real first-bell start time** for upcoming events.

## Why

Tapology (and most aggregators) publish only ONE time per card — the **main-card
broadcast time**. The earlier prelim / early-prelim start (often hours before)
lives only in prose "what time does it start / ring walk times" articles (ESPN,
Yahoo, Bad Left Hook, the promoter, etc.). With only the main-card time on file,
`eventLifecycle` flips the event LIVE hours late — the app shows the card as
upcoming while prelims are already underway, and walkout/up-next notifications
start late.

Concrete failure that motivated this: **MVP "Han vs. Holm 2" (2026-05-30)** — the
daily scraper stored `mainStartTime = 8:00 PM ET` (Tapology's only time), but the
card actually opened ~3:30–5:15 PM ET. The app didn't show LIVE until the main
card, long after several fights.

## How

Mirrors `services/broadcastDiscovery` — the same "structured data doesn't exist,
infer it from the web with a confidence-gated LLM" pattern:

1. `run.ts` selects upcoming events with NO early-bell time on file
   (`earlyPrelimStartTime` AND `prelimStartTime` both null — this excludes UFC,
   which already carries all three section times from ufc.com).
2. Per event: Brave search `"<event>" <promotion> <date> prelims main card start
   time ring walk` → drop junk sources (.edu/.gov/.pdf) → `extract.ts` (Haiku
   4.5, prompt-cached) returns each section's time **normalized to ET** + a
   confidence + grounding evidence.
3. `persist.ts` converts ET→UTC (same path the scraper uses for `mainStartTime`),
   applies ordering guards (earlyPrelims ≤ prelims ≤ mainCard), and writes only:
   - a section that is currently **null**, or
   - a value discovery itself set on a prior run (`startTimeSource='discovery'`).
   It NEVER fabricates and NEVER clobbers the card scraper's `mainStartTime` or an
   admin-set value. Below `APPLY_CONFIDENCE_FLOOR` (0.7) nothing is written.

Idempotent + self-correcting: re-runs daily, retries unresolved events as outlets
publish schedules closer to the date (`STARTTIME_RETRY_HOURS`), and refreshes its
own writes. Once `prelimStartTime` is set, `getStartTime()` in `eventLifecycle`
picks the earliest section, so the event flips LIVE at the real first bell.

## Run

- Daily: `.github/workflows/start-time-discovery.yml` (13:00 UTC) + as a
  best-effort tail step of `runAllOrganizationScrapers`.
- CLI: `npx tsx src/scripts/runStartTimeDiscovery.ts [--dry-run] [--max N]`
- One event: `npx tsx src/scripts/runStartTimeDiscovery.ts --event-id <uuid> [--dry-run]`

## Env / secrets

`DATABASE_URL`, `BRAVE_API_KEY`, `ANTHROPIC_API_KEY` (same secrets as broadcast
discovery — already configured in GitHub Actions).

## Tuning knobs

- `STARTTIME_WINDOW_DAYS=21` — only resolve events within N days.
- `STARTTIME_RETRY_HOURS=36` — re-attempt an unresolved event after N hours.
- `STARTTIME_MAX_EVENTS=40` — cap events per run (Brave free tier = 2k/mo).

## Coverage (org-agnostic)

There is NO per-org wiring. The selector keys off the symptom — any UPCOMING event
with both `prelimStartTime` and `earlyPrelimStartTime` null — so it already covers
EVERY promotion with the start-time gap (MVP, Top Rank, Golden Boy, Gold Star,
BKFC, PFL, Zuffa, Oktagon, RIZIN, RAF, …). UFC self-excludes (it already carries
all three section times from ufc.com). Adding a new org needs zero changes here.

The real limiter is **web coverage per card, not org wiring**: US boxing/MMA gets
clean "ring walk times" articles (high hit rate); thin/regional cards (ONE Friday
Fights, small RIZIN, RAF) often have no schedule article → times left null (never
guessed). Future work is coverage *quality* (better queries, a fallback source,
verifying international local→ET conversion), not breadth.

## Cost

~1 Brave query + 1 Haiku 4.5 call per unresolved event (~$0.002/event on Haiku
with prompt caching). Cost self-limits hard: once an event gets a confident prelim
time it is **excluded from selection entirely** (filter requires `prelimStartTime`
null), so it never queries again — only genuinely unresolved events keep retrying,
throttled to once per `STARTTIME_RETRY_HOURS` (36h).

- Realistic steady state: ~20–30 events/day × $0.002 ≈ **~$0.05/day ≈ ~$18/yr** (Haiku).
- Hard ceiling: `STARTTIME_MAX_EVENTS=40`/run → worst case ~**$30/yr** Haiku.
- **Brave ≈ $0**: free tier is 2,000 queries/mo; realistic volume (~600–1,200/mo,
  shared with broadcast discovery) stays under it. If it ever tips into paid,
  ~$2–4/mo → ~$60/yr absolute worst case all-in.

Smaller than the broadcast-discovery footprint (~$50/yr) — Haiku not Sonnet, modest
volume, aggressive drop-out. Tighten further via `STARTTIME_MAX_EVENTS`,
`STARTTIME_WINDOW_DAYS` (21), or `STARTTIME_RETRY_HOURS`.

## Provenance (Event columns)

`startTimeSource` ('discovery'|'scraper'|'manual'), `startTimeConfidence`,
`startTimeSourceUrls[]`, `startTimeDiscoveredAt`.

## Known follow-up

The MVP (and other Tapology) daily scrapers hardcode `cardType` to "Main Card"
(`scrapeMVPTapology.js`) and discard the page's actual `Prelim` / `Main Card`
labels. This doesn't affect the event-level LIVE flip (which uses the earliest
section time), but per-section fight auto-completion can't bucket prelims until
the labels are captured. Tracked separately.
