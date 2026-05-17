# Live Event Trackers

A first-class workstream: build trustworthy, automated, near-real-time fight tracking for **every promotion we list**, no matter how creative the data source has to be. The goal is that fight-start and fight-end signals fire within ~5 minutes of reality for any org on any card — not just UFC.

## North Star

When a card runs, Good Fights knows what's happening in near-real-time and fires the right notifications, flips fight statuses, and opens rating prompts without a human in the loop. Coverage gaps disappear; the app stops feeling "alive only on UFC nights."

## Why this matters

Live signal is the most valuable engagement window we have:

1. **Walkout notifications** — the highest-engagement push lane. Drives in-the-moment app opens during fights, which drives ratings.
2. **"Rate this fight" prompts** — only meaningful if we know the fight ended. Late = the user has already scrolled past.
3. **Live card UX** — the LIVE banner / Now Showing card only works if backend state matches reality.
4. **Rating volume** — every additional reliable card = more ratings = more Fan DNA signal = more dataset value for the [[project_follow_fighter_workstream]] acquisition thesis.
5. **Promotion neutrality** — selling a buyer a "we cover every org" story requires actual evidence we cover every org. Right now there's a tier list.

A reliable tracker isn't a feature — it's the substrate every other rewarding-users / follow-fighter / notification investment compounds on top of.

## Coverage matrix (Feb 2026 snapshot)

| Org | scraperType | Live source | Status |
|---|---|---|---|
| UFC | `ufc` | ufc.com via curl + JA3 workaround | ✓ Reliable; per-fight start/end |
| ONE FC | `onefc` | onefc.com | ✓ Reliable |
| BKFC | `bkfc` | dedicated parser | ✓ Reliable |
| Oktagon | `oktagon` | dedicated parser | ✓ Reliable |
| RAF | `raf` | dedicated parser | ✓ Reliable |
| PFL | `pfl` | dedicated parser | ✓ Reliable |
| Matchroom | `matchroom` | matchroomboxing.com | ✓ Reliable |
| Zuffa Boxing | `tapology` | Tapology (generic) | ✓ Reliable enough |
| Karate Combat | `tapology` | Tapology (generic) | ✓ Reliable enough |
| Dirty Boxing | `tapology` | Tapology (generic) | ✓ Reliable enough |
| RIZIN | `tapology` | Tapology (generic) | ✓ Reliable enough |
| **MVP** | `tapology` | None (Tapology unreliable for MVP) | ✗ **Investigation underway** |
| **Top Rank** | `tapology` | None | ✗ Falls back to no-tracker bulk-flip |
| **Golden Boy** | `tapology` | None | ✗ Falls back to no-tracker bulk-flip |
| **Gold Star** | `tapology` | None | ✗ Falls back to no-tracker bulk-flip |

The ✗ rows currently get the "no-tracker bulk-flip" path in `eventLifecycle.ts` Step 2 — all fights flip to COMPLETED the moment the event goes LIVE so users can rate, but the per-fight start/end timing signal is fabricated. This is the gap this workstream exists to close.

## Source ranking ladder

When picking a source for a new org, work down this ladder. Don't skip to a creative source if a stable one exists.

1. **Official org site or API** (UFC, ONE FC, PFL) — gold standard when it exists.
2. **Aggregator with structured live page** (Tapology, Sherdog play-by-play, BoxRec) — structured HTML, normal browser UA usually works.
3. **Live blog from a major outlet** (MMA Junkie, ESPN, Yahoo Sports, theScore) — slower, less structured, but human-curated.
4. **Social / Twitter (X) feeds** (`@MVP`, `@arielhelwani`, `@MMAFighting`) — fastest signal possible but no clean API anymore; would need a Nitter mirror or paid scraping infrastructure.
5. **Manual admin tracker** — `useManualLiveTracker` already exists in the schema. Last resort but better than fake data.

A working tracker is allowed to **combine sources**: e.g. detect fight-start from one source and fight-end from another, as long as each signal independently passes the 5-min lag bar.

## Design principles

1. **5-min lag is the bar** — for fight start and fight end. Anything slower defeats the notification value. Round/time/winner can lag longer (secondary priority).
2. **Don't fabricate data.** If a source doesn't tell us round/time/winner, store `null`. The Tapology overwrite-COMPLETED bug ([[lesson_tapology_tracker_overwrites_lifecycle]]) was caused by reading absent data as "match is still upcoming."
3. **Multi-signal verification when possible.** Two independent sources agreeing on "fight over" >> one source claiming it.
4. **Graceful fallback always exists.** Every tracker must degrade to the section-start ping + manual mode without code change. A failed tracker should never block users from rating.
5. **Per-org choice.** Don't force a single architecture. UFC gets its own parser, MVP can get a Sherdog scraper, Top Rank might get an ESPN poller. The shape of the source dictates the shape of the tracker.
6. **Start/end timing is sacred.** Same principle as `followedAt` in [[project_follow_fighter_workstream]] — these timestamps go in user-visible UI and (eventually) buyer-facing analytics. Better to mark them `null` than guess.
7. **Document why a tracker was rejected.** Add to the "experiments log" below so a future session doesn't redo dead research.

## Anti-patterns (don't do)

- **Don't overwrite COMPLETED back to UPCOMING based on noisy data.** Tapology bug — Tapology dropped a fight from its results page mid-card and our tracker re-opened a finished match. Lifecycle now has explicit guards; new trackers must inherit them.
- **Don't trust round=1, time=0:00 in absence of structured data.** That's the default-empty-state lie; treat it as null.
- **Don't centralize on a single source if it can rate-limit us down.** Sherdog 403s without a browser UA. UFC.com JA3-blocks Node TLS. Always have a backup source identified before shipping.
- **Don't ship without sub-5-min start *and* end accuracy** on at least one full live card observed end-to-end. "Worked in dev against a finished card" is not the same as "works against a live card."
- **Don't pull from Twitter/X without explicit infra investment.** Scraping X is a permanent maintenance tax — only consider it after the structured ladder is exhausted.
- **Don't replace working trackers with "creative" ones.** UFC works; don't refactor it just because Sherdog has a nicer format.

## Current architecture (one-paragraph reminder)

`services/eventLifecycle.ts` runs every 5 min: Step 1 flips UPCOMING→LIVE when start time passes. Step 1.5 dispatches a per-org live tracker (GH Actions for most orgs, Hetzner VPS for `tapology`/`pfl`/`bkfc`/etc per [[project_tapology_live_trackers]]). Step 1.7 fires section-start notifications for non-tracker events. Step 2 bulk-flips UPCOMING→COMPLETED for no-tracker LIVE events. Step 3 flips LIVE→COMPLETED on estimated duration. New trackers slot in as either a new `scraperType` (with its own parser) or — if the org is already on `tapology` — a more reliable parser swapped behind the same lifecycle plumbing.

Reliable-tracker gate: `hasReliableLiveTracker(scraperType, promotion)`. The current Tapology-but-unreliable orgs (MVP, Matchroom (was), Top Rank, Golden Boy, Gold Star) flow through this gate.

Promotion onboarding playbook: `docs/playbooks/onboard-new-promotion.md` and the registry at `packages/backend/src/config/promotionRegistry.ts`. Adding a new tracker should also update those.

## Experiments log

Every time we evaluate a new source, even if we reject it, log it here. Keeps the institutional memory.

### MVP — preliminary scout (2026-05-16, ~7pm ET, prelims live)

**Context**: First live MVP MMA card. Avila vs Jenkins (opener) was Live NOW at the time of the scout. Several other fights still upcoming. User asked to find creative sources for sub-5-min start/end.

**Sources probed**:
- [Sherdog play-by-play](https://www.sherdog.com/news/news/MVP-Rousey-vs-Carano-playbyplay-results-round-scoring-201197) — **LEADING CANDIDATE**. Returns 200 with browser UA (curl works). Structured HTML: each fight in `<div class="event">` with anchor IDs, `<h3>Round N</h3>` blocks, `<h4>Sherdog Scores</h4>` per round (3 named judges), final `<h3>The Official Result</h3>` section. Currently-live fight flagged with `<font color="#FF6600">Live NOW!</font>` in the TOC. At scout time, Avila vs Jenkins had Round 1 prose written and 3 judges' scores filled in — matched reality.
- [ESPN live results](https://www.espn.com/mma/story/_/id/48761252/mvp-mma-1-results-ronda-rousey-gina-carano-nate-diaz-mike-perry) — pre-event framework only, no live data populated at scout time. Rejected for now.
- [Yahoo undercard live](https://sports.yahoo.com/articles/rousey-vs-carano-undercard-live-210031361.html) — empty bulleted list, no live data. Rejected.
- [Yahoo round-by-round main card](https://sports.yahoo.com/mma/live/ronda-rousey-vs-gina-carano-live-results-updates-round-by-round-scoring-highlights-for-saturdays-netflix-fight-060000698.html) — 791KB fetch, not yet parsed at scout time. To revisit.
- [Cageside Press full results](https://cagesidepress.com/2026/05/16/mvp-mma-rousey-vs-carano-full-results/) — typically post-fight only.
- [MMA News live updates](https://www.mmanews.com/article/mvp-mma-results-rousey-vs-carano-updates) — lower-tier outlet, lag unknown.
- MMA Junkie — typically fastest live blog in MMA, couldn't surface specific MVP URL via search; manual check pending.
- Twitter/X — deferred (infra cost).

**Expected latency on Sherdog**:
- Fight start signal — 30–60s into Round 1 once prose appears
- Round end — ~immediate when 3 judges' scores post
- Fight end — 1–5 min lag for "The Official Result" block to be written

**Soft spot**: fight-end latency may exceed 5 min for fast finishes. Mitigation idea: detect "Live NOW! marker moved to the next fight" as a fight-end proxy that fires before the official-result block is written.

**Next probe**: After ~3-5 fights have completed (~9-10pm ET on 2026-05-16), re-fetch Sherdog + the Yahoo round-by-round URL + MMA Junkie. Diff against the `tmp_sherdog.html` sample at repo root. Measure actual lag vs reality (using whatever timestamps the live blog includes + cross-referencing the user's stream). Then decide if Sherdog is good enough to build on or if we need a multi-source approach.

### MVP — round 2 scout (2026-05-16, ~19:45 ET, mid-prelims)

**Context**: ~60 min after the round-1 scout. Fired automatically via cron timer.

**Sherdog snapshot diff** (tmp_sherdog.html → tmp_sherdog_r2.html):
- Round 1 snapshot was 80.5 KB; round 2 was 95.4 KB (+15 KB). Page grew via filled-in round prose + result blocks.
- **Live NOW! marker moved** from Avila vs Jenkins (fight 1) to Adriano Moraes vs Phumi Nkuta (fight 5). Confirms the marker is the cleanest possible "currently live" signal — it transitions per-fight, not per-event.
- 4 fights have populated "Official Result" blocks; all in the canonical format `{winner} def. {loser} via {method} ({score})` or `{winner} def. {loser} R{n} {time} via {method} ({detail})` for finishes.
- Current live block (Moraes/Nkuta) has the `<h3>Round N</h3>` + `<h4>Sherdog Scores</h4>` template scaffold but **no prose or scores yet** — meaning the marker fired before the writer typed anything. Live NOW! is therefore a true "fight just started" signal, not a post-hoc tag.

**Cross-source verification** — same 4 completed fights, paraphrased differently:

| Source | # results matched | Has live indicator? | Format reliability |
|---|---|---|---|
| Sherdog | 4 / 4 | **Yes (Live NOW! marker)** | High — `def.`/`via`/score in tight prose |
| Bleacher Report | 4 / 4 | No | High — same `def. ... by ... (scores)` shape |
| MMA News | 4 / 4 | No | High — same shape, slight format variants |
| BJPenn | 2 / 4 | No | Medium — lags |

Sample finish result was caught perfectly by all three caught-up sources:
- Sherdog: `Jason Jackson def. Jefferson Creighton R1 0:22 via KO (Punch)`
- Bleacher: `Jackson def. Jefferson Creighton by KO (punch), 0:22, Round 1`
- MMA News: `Jackson def. Jeff Creighton via KO (Rd. 1, 0:22)`

→ Cross-source parseability is excellent, all three structurally similar.

**Decision: build on Sherdog as primary, Bleacher Report as verifier.**

Sherdog wins because:
1. **Only source with a real-time "fight currently happening" signal** (Live NOW! marker). Critical for fight-start detection.
2. Most structured HTML (per-fight `<div class="event">`, anchor IDs, per-round `<h3>` blocks, judge-named scores).
3. Fighter URLs (`/fighter/Name-{id}`) give us a stable per-fighter ID to match against our DB.

Bleacher Report runs as a parallel cross-check on fight-end — if Sherdog's Official Result is delayed beyond ~3 min but Bleacher already has the result, surface it from Bleacher with a "verified-only" flag.

**Latency estimate from this scout**:
- Fight start signal (Live NOW! moves): ~30-90s lag (marker appeared on Moraes/Nkuta before any prose, suggesting writer flipped it at walkout/bell).
- Fight end signal (Official Result populates): unknowable from 2-snapshot data — need a mid-fight #2 sample to pin down. Sample 4 of 4 completed fights all had results when snapshot taken, so worst-case lag ≤ 60min, likely 1-5 min.
- Round-end signal (3 judges' scores post): ~immediate when round ends (R2 snapshot has scores for completed rounds, blanks for in-progress rounds).

**Soft spots still standing**:
- Can't yet bound fight-end lag tightly. A round-3 scout (after the main event) will tell us how fast the Official Result block fills in for a fast finish vs a decision.
- Sherdog only writes PBP for cards their staff covers. Need a probe-step that detects "no PBP page exists" → fall back to no-tracker.
- Anchor IDs include weight in parens (`chris-avila-(164)-brandon-jenkins-(1642)`). Weight changes per event so the anchor isn't a cross-event stable key. Use the `/fighter/{Name-ID}` link in `<h2>` as the stable fighter ID instead.

**Status**: Sherdog is the leading candidate. Next probe (round 3, after main event) will pin down fight-end lag for fast finishes. After that, build the parser.

### MVP — round 3, parser built and shipped (2026-05-16, ~20:40 ET, mid-card)

**Decision moved to build:** Sherdog data quality was clearly sufficient. Mike said "build it." Stack added (all new files, additive — no lifecycle changes):

- `packages/backend/src/services/sherdogLiveScraper.ts` — cheerio-based parser for any Sherdog PBP URL. Returns structured per-fight data: fighters (with first/last/full/sherdogId), `isLive` (matches `Live NOW!` anchor), `hasStarted` (Round 1 prose ≥50 chars OR isLive OR isComplete), `isComplete` (Official Result block populated), `result` (winner last-name, normalized method, round, time, raw sentence).
- `packages/backend/src/services/sherdogLiveParser.ts` — reconciles scraper output against a DB event. Matching is multi-strategy (exact normalized last-name pair → compressed suffix/superset → full-name compress) to handle compound surnames like "Junior dos Santos" vs DB's "dos Santos". **Always publishes** to main fields plus shadow mirrors (rather than gating on global production_scrapers toggle, since Sherdog reliability is promotion-agnostic and the whole point of running this tracker is to publish what it sees). Never reverses COMPLETED. Backfill-safe (`nullOnlyResults` skips fields with existing real values).
- `packages/backend/src/scripts/runSherdogLiveTracker.ts` — CLI runner. Supports `--dry-run`, `--null-only-results`, `--skip-notifications`. Hydrates production-scraper cache before running.
- `packages/backend/prisma/schema.prisma` + migration `20260517010000_add_sherdog_pbp_url` — adds `Event.sherdogPbpUrl String?`. Nullable, set per-event when Sherdog covers the card.

**First live application (MVP Rousey vs Carano)**:
- 6 already-COMPLETED fights had NULL winner/method/round/time (Mike was advancing manually with `useManualLiveTracker=true`, no result entry). Sherdog backfilled all 6 with structured results — including the round + time on the three finishes (Jackson KO R1 0:22, Moraes SUB R3 4:59, Fazil SUB R2 0:58).
- Fight #5 (JDS vs Despaigne) flipped UPCOMING → LIVE matching reality.
- No notifications fired (no COMPLETED transitions on this run; backfill onto already-COMPLETED rows is silent by design).

**Continuous polling**:
- In-session cron job firing every 2 minutes for the rest of the card. When Rousey vs Carano (#1) flips to COMPLETED, the cron self-deletes.

**Architecture wins**:
- Stable fighter ID = Sherdog's `/fighter/Name-{ID}` path. Captured but not yet used; future feature could let us auto-link our Fighter table to Sherdog IDs for cross-event continuity.
- Compound surname tolerance (`compress()` helper) caught "dos Santos" mismatch on first dry-run — would have silently dropped JDS without it. Reusable pattern for any future scraper that gets last names differently than our DB.
- Sherdog data is treated as more authoritative than the production_scrapers toggle implies. The Tapology bug (overwrite COMPLETED→UPCOMING) doesn't apply here — Sherdog data is structurally complete, not noisy.

**Open items** (lifecycle integration deferred to next session):
- `Event.sherdogPbpUrl` field added but not wired into `eventLifecycle.ts` dispatch yet. The tracker runs only via manual CLI / cron tonight. Next session: wire `sherdogPbpUrl != null` events into Step 1.5 dispatch (probably as a new branch alongside the existing GH Actions / VPS branches), and decide whether `hasReliableLiveTracker()` should return true when an event has `sherdogPbpUrl` set (which would re-enable walkout notifications for these orgs).
- Sherdog URL discovery (how do we know the URL exists for a given card?) — for now, manual entry per event. Future: a daily probe that searches Sherdog news for `event.name` and stores the URL on a hit.
- Cron schedule outside the in-session job: GH Actions workflow `sherdog-live-tracker.yml` (mirror of `ufc-live-tracker.yml`) for events with `sherdogPbpUrl` set and `eventStatus` in {UPCOMING, LIVE}. Same 5-min cadence as the rest.

**Reference URLs** (caught up at 19:45 ET):
- Sherdog PBP: https://www.sherdog.com/news/news/MVP-Rousey-vs-Carano-playbyplay-results-round-scoring-201197
- Bleacher Report: https://bleacherreport.com/articles/25428559-mvp-mma-1-ronda-rousey-vs-gina-carano-live-winners-and-losers-results
- MMA News: https://www.mmanews.com/article/mvp-mma-results-rousey-vs-carano-updates

(BJPenn lagging, dropped from consideration.)

## Open problems / roadmap

- **MVP, Top Rank, Golden Boy, Gold Star** — all four are scraperType=tapology with unreliable Tapology coverage. If Sherdog play-by-play covers more than just MVP, one shared "sherdog-pbp" tracker could solve all four. Worth checking on the next Top Rank or Golden Boy card.
- **Detection of "no live blog exists yet for this card"** — Sherdog only writes play-by-play for cards their staff covers. Need a probe step in the tracker that says "no PBP page → fall back to no-tracker."
- **Boxing-only orgs** (Top Rank, Golden Boy, Gold Star, future) — BoxRec might be a structured source for these. Check on next big boxing card.
- **Per-source rate limiting** — Sherdog is a single-page poll, fine at 1-min intervals. Twitter would need careful budget. Document the polling interval per tracker in code.
- **Quantify acceptable lag for non-priority fields** — winner/method/round/time. Probably 30 min is fine since the user's already opened the rating modal by then. Cement this somewhere so future trackers know the bar.
- **Manual tracker UX polish** — when no automated source exists, the admin needs a fast "advance to next fight" button. `useManualLiveTracker` exists schema-side; usability could be better.

## Related memories

- [[lesson_tapology_tracker_overwrites_lifecycle]] — the canonical "don't reverse COMPLETED" lesson
- [[lesson_vps_supported_scrapers]] — VPS dispatch only covers some scraperTypes
- [[lesson_tapology_event_lookup_ufcurl_only]] — name-fallback merges sibling events; tracker lookups must use stable IDs
- [[lesson_ufc_com_ja3_blocking]] — ufc.com TLS fingerprinting; relevant if a future tracker tries Node fetch against a bot-protected source
- [[lesson_ufc_live_parser_diacritic_signature]] — name-signature matching needs diacritic normalization; reusable for any name-based result matcher
- [[project_tapology_live_trackers]] — VPS infrastructure for Tapology-backed trackers
- [[project_promotion_registry]] — where new orgs get registered
