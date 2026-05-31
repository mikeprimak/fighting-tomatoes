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

## Coverage matrix (May 2026)

The Sherdog tracker (shipped 2026-05-16) is now the **standard live tracker for any org whose native source is unreliable**. Set `Event.sherdogPbpUrl` per-event when Sherdog covers the card, and lifecycle dispatch + VPS auto-discover handle everything else (30s cadence).

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
| **MVP** | `tapology` + `sherdogPbpUrl` | Sherdog PBP (per-event URL) | ✓ Shipped 2026-05-16 |
| **Top Rank** | `tapology` + `sherdogPbpUrl` | Sherdog PBP (per-event URL) | ⏳ Set URL per event |
| **Golden Boy** | `tapology` + `sherdogPbpUrl` | Sherdog PBP (per-event URL) | ⏳ Set URL per event |
| **Gold Star** | `tapology` + `sherdogPbpUrl` | Sherdog PBP (per-event URL) | ⏳ Set URL per event |

**Onboarding a new org to Sherdog tracking**: the moment Sherdog publishes a PBP page for a card, set `event.sherdogPbpUrl = '<url>'` (admin panel or SQL). On lifecycle UPCOMING→LIVE, the VPS picks it up. No code change, no migration, no per-org parser.

Sherdog tracking is **layered on top** of the native `scraperType` — the daily data scraper still pulls from Tapology (or whatever native source the org uses); Sherdog only handles the live-fight signal. Two orthogonal concerns, two fields. This means we can mix-and-match: use a native live tracker when one exists (UFC, ONE, etc.), fall through to Sherdog when one doesn't.

### Operational checklist before any MVP / Top Rank / Golden Boy / Gold Star card

1. Day-of (or evening prior): find the Sherdog PBP URL — typically published at `sherdog.com/news/news/<Event-Name>-playbyplay-results-round-scoring-<id>`. Easiest: search Sherdog's homepage news feed for the event name.
2. Set the URL on the event: admin panel field, OR SQL: `UPDATE events SET "sherdogPbpUrl" = '<url>' WHERE id = '<event-id>';`
3. That's it. When the event flips to LIVE, the VPS Sherdog tracker auto-starts on 30s cadence.

### Future automation: daily Sherdog probe

Step 1 is the only manual step. It will be automated by a daily probe job that:
- Queries Sherdog news (`sherdog.com/news`) for any article matching upcoming-event names in our DB
- For each match, stores the URL on `event.sherdogPbpUrl`
- Runs daily, idempotent, only writes if the field is currently null

Probe is unbuilt; estimated ~30 min of work, additive, low risk. Tracked in "Open problems" below.

## Architecture decision: Sherdog as the default tracker source (2026-05-16)

**Context.** Before this decision we treated every promotion as its own per-org live-tracker engineering problem. UFC needed a JA3 bypass; ONE FC had its own JSON; PFL/BKFC/Oktagon/RAF each had a hand-written scraper + parser + GH Actions workflow. Orgs without a native source (MVP, Top Rank, Golden Boy, Gold Star) fell through to the "no-tracker bulk-flip" path — fights flipped to COMPLETED the moment the event went LIVE, with no real per-fight signal.

**Discovery.** During MVP Rousey vs Carano, scouting found that Sherdog's round-by-round play-by-play page already aggregates the same data we were building per-org parsers for, across nearly every major promotion. Structured HTML, a "Live NOW!" marker that flips to the currently-active fight, an Official Result block per fight in a canonical format. Cross-source check (Bleacher Report, MMA News) confirmed Sherdog matched reality on the same 4 completed fights.

**Decision.** Sherdog is now the **default live-tracker source for any org without a reliable native one**. Implementation: a single generic Sherdog scraper + parser + VPS handler, activated per-event by setting `Event.sherdogPbpUrl`. Shipped 2026-05-16 in `services/sherdogLiveScraper.ts`, `services/sherdogLiveParser.ts`, `scraperService.ts scrapeSherdogOnce()`, and `eventLifecycle.ts` dispatch. Runs on the same 30-second VPS cadence as UFC/ONE/etc.

**Layered, not replacement.** Sherdog tracking is orthogonal to `scraperType`. MVP keeps `scraperType='tapology'` for daily data scraping; Sherdog only handles the live signal. Two fields, two concerns. This means every promotion can mix-and-match: native scraper for daily, native live tracker if one exists, Sherdog if not.

**Consequences.**
- *Onboarding a new org is now zero-code.* Set `sherdogPbpUrl` on the event, lifecycle handles the rest. The previous per-org boilerplate (scraper module + parser module + GH Actions workflow + lifecycle branch + VPS handler) collapses to one row.
- *Fault tolerance improves.* If Sherdog goes down or doesn't cover a card, falling back to `useManualLiveTracker` is a one-field flip rather than an engineering project.
- *Single point of failure introduced.* If Sherdog is down for an extended window during a card, every Sherdog-tracked event is affected at once. Mitigation: Bleacher Report identified as a secondary verifier in the source ladder; promote to an active cross-check if Sherdog reliability degrades.
- *The buyer story improves.* "We support every major promotion" stops being a per-org engineering narrative and becomes a one-line architectural claim.

**Inverts the previous default.** Before this decision the implicit rule was "build a per-org tracker; Sherdog is a fallback for the gaps." The new rule is the opposite: **Sherdog is the default; per-org native trackers are an optimization** for cases where latency or data quality warrants the per-org investment (e.g. UFC pay-per-views, where sub-30s KO detection matters more than the marginal cost of maintaining a UFC-specific parser).

**Future-state redesign (deferred, ~2-3 day refactor when it's worth it).**

The current implementation layers Sherdog on top of the existing `scraperType` plumbing — pragmatic, but the long-term clean version separates two concerns that are currently conflated:

1. **`dailyScraperType`** — which scraper pulls the static card/fight data (Tapology, UFC, ONE, etc.). About daily data ingestion.
2. **`liveTrackerSource`** — which source feeds the live-fight signal. Values: `native` (per-org parser), `sherdog`, `manual`, `none`.

With that split:
- Every live tracker implements the same `scrape(url) → {fights, isLive, isComplete}` interface
- A registry maps `liveTrackerSource` → module; adding a new source = one new module + one row
- Source ranking lives in code: when probing for a new event's source, walk a defined ladder (native parser → Sherdog → manual). First hit wins, cached on the event row.
- Auto-completion logic consolidates to one path, not one per parser
- Observability becomes first-class — every tracker emits start-latency, end-latency, mismatch rate

**What stays unchanged in any redesign.**
- Shadow fields + audit trail on `Fight` (earned its keep on the Tapology overwrite bug)
- VPS-at-30s architecture (massive win over 5-min GH Actions polling)
- "Never reverse COMPLETED" invariant
- Render → VPS dispatch contract (`/track/start`, `/track/check`)

**Migration cost vs. value.** ~2-3 days of refactor. Not urgent — the layered approach works and ships features. Worth doing when we either hit ~3 more org additions and per-org boilerplate gets painful, or right before a sale pitch where "we support every org cleanly" becomes a marketing artifact.

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

### MVP **boxing** — Han vs. Holm 2 source scout (2026-05-30, ~19:45 ET, prelims live)

**Context**: Han vs. Holm 2 (MVPW-03, El Paso, ESPN) is an **all-boxing** card — 12 women's bouts headlined by Stephanie Han vs Holly Holm, plus Amanda Serrano, Yokasta Valle, Mary Spencer. This is the key finding: **the Sherdog tracker does not apply to boxing.** Sherdog is an MMA outlet — it writes structured PBP news articles for MMA only. Confirmed at scout time: Sherdog's news feed had live PBP pages for tonight's *MMA* cards (PFL Brussels, PFL MENA 9, UFC Macau) but none for Han vs Holm; four guessed `…-playbyplay-results-round-scoring` URL patterns all 404'd. So MVP boxing cards need a **separate, non-Sherdog live source**. Scouted the boxing source ladder live during the prelims.

**Sources probed** (all curled with a browser UA — most boxing live pages block plain WebFetch):

| Source | HTTP | Live signal? | Structured? | Verdict |
|---|---|---|---|---|
| **Yahoo Sports / Uncrowned live blog** | 200 (683 KB) | **Yes** — `liveblog-status live` + per-post `<time class="post-time" dateTime>` ISO timestamps, latest ~1-2 min old | **Yes** — schema.org `LiveBlogPosting` JSON-LD: array of `BlogPosting` updates each w/ `datePublished` + `headline` + `articleBody` | **Primary** |
| MVP promoter RBR (mostvaluablepromotions.com) | 200 (109 KB) | Updates per fight-completion, no clean live marker | Semi — `result-c` blocks w/ canonical `def. X via UD (scores)`, but bleeds in old MVP-1 articles (Nate Diaz etc.) + promoter-reliability risk ([[lesson_promoter_site_phantom_events]]) | Backup / cross-check |
| BoxRec (date page + Holm profile) | 200 | **No** — Holm's bout row reads "scheduled bouts subject to change"; result posted only post-fight, often delayed | Yes (tables, stable fighter IDs `box-pro/{id}`) | **Post-event result backfill only**, not live |
| Tapology event page | 200 (551 KB) | **No** — page shows pre-fight card/odds/leaderboard, no live results | (the generic tracker we already run) | Rejected — this *is* the gap (Tapology unreliable-live for MVP, why MVP fell through to no-tracker) |
| FightMag live results | 403 | — | — | Rejected — blocks scraping |
| Sherdog PBP | 404 | — | — | N/A — MMA only, doesn't cover boxing |

**Decision: Yahoo/Uncrowned live blog is the primary boxing live source.** Evidence: structured + timestamped + current + major outlet (Alan Dawson byline; Yahoo also ran the RBR for the Rousey MMA card). Sample beats captured live: "DOWN GOES PANATTA!!!", "The judges are unanimous!", "The results are in!", "def. Maria Salinas by UD (80-72 × 3)".

**Parser shape differs from Sherdog.** Sherdog gave a per-fight structured *card* (`<div class="event">` blocks). Yahoo is a reverse-chronological prose *stream*. A Yahoo parser would: (1) parse the `LiveBlogPosting` JSON-LD into ordered `{datePublished, headline, body}`; (2) detect result-announcement posts ("judges are unanimous" / "results are in" / `def. X by UD/KO/TKO (scores)`) → extract winner+method+scores → match DB fight by last names → COMPLETED + backfill; (3) detect ring-walk posts → walkout/start signal; (4) `liveblog-status` ended → event complete. Closer to the "live blog" tier (tier 3) than the structured-aggregator tier, but the JSON-LD makes it tractable — comparable effort to the Sherdog parser. Reuse `compress()`/`stripDiacritics` last-name matching + the COMPLETED-never-reversed guards from `sherdogLiveParser.ts`.

**Architectural note** — this is the boxing analog of the Sherdog decision. A generic `yahooLiveBlogScraper` + per-event `yahooLiveBlogUrl` (mirror of `sherdogPbpUrl`) would cover **every** future boxing card on the same plumbing (MVP, Matchroom, Top Rank boxing, Golden Boy, DAZN cards) the way Sherdog generalizes MMA. BoxRec stays as the reserved post-event result-backfill source.

**Reference URLs** (caught up ~19:45 ET, prelims live):
- Yahoo live blog: https://sports.yahoo.com/boxing/live/stephanie-han-vs-holly-holm-2-live-results-round-by-round-updates-ring-walks-for-texas-rematch-070000761.html
- MVP promoter RBR: https://www.mostvaluablepromotions.com/mvpw-03-results-han-vs-holm-2-serrano-vs-hanson-live-round-by-round-updates/
- BoxRec event: https://boxrec.com/en/date?date=2026-05-30 · Holm: https://boxrec.com/en/box-pro/117628

**Status**: source chosen (Yahoo). Build not started — recommend building the parser now against the live card (the MVP-1 pattern), since live data is the only way to validate start/end latency.

## Open problems / roadmap

- **Daily Sherdog probe (next build, ~30 min)** — automate setting `event.sherdogPbpUrl` so the operational checklist above becomes zero manual steps. Pattern: cron-driven script that GETs `https://www.sherdog.com/news` (or sitemap), pulls article titles, fuzzy-matches against upcoming-event names in our DB, writes any hit onto the event. Idempotent; never overwrites a non-null value. Sherdog publishes PBP article headers ~day-of, so a daily run at noon-ish ET catches all night-of cards. The probe is essentially the same shape as the existing daily broadcast-discovery job in `services/broadcastDiscovery/`.
- **Detection of "no live blog exists yet for this card"** — Sherdog only writes PBP for cards their staff covers. The tracker already handles 404s gracefully (`scrape()` returns null → cycle is a no-op), but we should track + alert when a Sherdog-tracked event consistently returns null past start time — likely means we set the wrong URL.
- **Boxing-only orgs** — BoxRec might be a structured source if Sherdog doesn't cover a particular boxing card. Reserve as a future fallback in the source ladder.
- **Per-source rate limiting** — Sherdog at 30s = ~120 req/hr per active event. Multiple concurrent events could pile up. So far no signal of issues; revisit if we ever run >5 concurrent Sherdog-tracked cards.
- **Quantify acceptable lag for non-priority fields** — winner/method/round/time. Probably 30 min is fine since the user's already opened the rating modal by then. Cement this somewhere so future trackers know the bar.
- **Manual tracker UX polish** — when no automated source exists, the admin needs a fast "advance to next fight" button. `useManualLiveTracker` exists schema-side; usability could be better.
- **Cross-promotion fighter linking via Sherdog IDs** — the scraper captures `sherdogId` per fighter from the PBP page but we don't use it yet. Storing it on `Fighter` would let us cross-link our DB to Sherdog for future enrichment (records, history, recency).

## Related memories

- [[lesson_tapology_tracker_overwrites_lifecycle]] — the canonical "don't reverse COMPLETED" lesson
- [[lesson_vps_supported_scrapers]] — VPS dispatch only covers some scraperTypes
- [[lesson_tapology_event_lookup_ufcurl_only]] — name-fallback merges sibling events; tracker lookups must use stable IDs
- [[lesson_ufc_com_ja3_blocking]] — ufc.com TLS fingerprinting; relevant if a future tracker tries Node fetch against a bot-protected source
- [[lesson_ufc_live_parser_diacritic_signature]] — name-signature matching needs diacritic normalization; reusable for any name-based result matcher
- [[project_tapology_live_trackers]] — VPS infrastructure for Tapology-backed trackers
- [[project_promotion_registry]] — where new orgs get registered
