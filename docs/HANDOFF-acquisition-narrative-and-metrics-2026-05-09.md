# Acquisition Narrative + Metrics Instrumentation — Handoff

**Status (2026-05-09):** Strategic reframe agreed in marketing session. No code changes yet. Three concrete tasks teed up.

**Branch:** `claude/marketing-updates-dqs2G`

This doc is self-contained — read it cold to resume.

---

## Why this exists

In a marketing session on 2026-05-09 (UFC 328 fight day), the user (Mike) asked the meta-question: *"What metrics would I need in order to sell this app?"*

The conversation surfaced two facts that significantly reframe how the 90-day plan and all downstream marketing work should be positioned:

1. **The dataset goes back ~10 years**, not 7 months. Good Fights (the mobile app) is 7 months old, but the underlying fan-rating dataset originated on Mike's legacy platforms ~10 years ago. That makes the dataset itself the primary asset and arguably the longest continuous fan-rating dataset in combat sports.
2. **The 7-month build with Claude Code is a positive signal, not a discount.** Acquirers' build-vs-buy math has shifted with AI, but only the iteration-speed side. The asset (10y dataset, 11+ org coverage, live tracker, scraper farm) still takes years to assemble — AI didn't accelerate the data collection. AI-leveraged build proves founder velocity.

Mike's stated long-term goal (per CLAUDE.md) is a 12–18 month horizon to an acquisition conversation. He wants this lens applied to all relevant marketing decisions going forward — *without* changing the day-to-day execution of the 90-day plan.

---

## The standing reframe (apply to all marketing decisions)

Whenever evaluating a marketing tactic, channel, or message, ask: **does this strengthen the acquisition narrative?** The narrative has three pillars:

### Pillar 1: The dataset moat (10 years deep, multi-org wide)

- **Depth:** ~10 years of continuous fan-rating data across legacy platforms → Good Fights
- **Breadth:** 11+ promotions actively scraped (UFC, ONE FC, Matchroom, BKFC, RAF, Oktagon, PFL, Karate Combat, Dirty Boxing, Zuffa Boxing, RIZIN — see `src/config/liveTrackerConfig.ts`)
- **Freshness:** automated daily scrapers + live trackers, results-backfill orchestrator (Phase 2 complete 2026-05-03)
- **Strategic framing:** Letterboxd's value is its ratings DB. Good Fights is that, in a vertical where nobody else has it.

### Pillar 2: The fight-night moment (live concurrency on PPV cards)

- Push notifications + live ratings + hype UI fire during the only moments fans are emotionally engaged
- Peak concurrency on a UFC PPV main event is the **demo metric** for any combat sports buyer
- Every marquee card is a chance to generate a "during UFC X, N concurrent users rated M fights" data point

### Pillar 3: The founder/asset story (one person, AI-leveraged, mature stack)

- Solo dev, 7 months build, monorepo with mobile + web + landing + backend
- Live event lifecycle, results backfill, broadcast discovery — all autonomous
- AI-leveraged build = capacity to ship features competitors can't match for cost
- Acquirer's calculus: cheaper to buy than to rebuild + collect 10 years of data

### What this means for tactical decisions

| Tactic | Reframed |
|---|---|
| Reddit posts on fight night | Demonstrate community + drive concurrency for a quotable peak number |
| App Store preview video | Show the dataset depth (rating history, fighter pages with years of data) — not just current event |
| Press / blog mentions | Trade for "longest fan-rating dataset in MMA" tagline placement |
| Product roadmap | Prioritize features that *generate* the metrics in the dashboard (concurrency, opt-in rate, ratings density) |
| Content marketing | "10 years of fan ratings reveal the most under-rated fights of the decade" type pieces — inherently uses the moat |

---

## Tasks for the next session (in priority order)

### TASK 1 — Find and update the marketing plan file

CLAUDE.md says `GOOD_FIGHTS_90_Day_Marketing_Plan.md` is the source of truth and should live in the project root. **The file is not in the repo.** It is likely on Mike's laptop only (he was on his phone during the 2026-05-09 session and couldn't check).

**Steps:**

1. Check these locations on the laptop in order:
   - `/home/user/fighting-tomatoes/GOOD_FIGHTS_90_Day_Marketing_Plan.md` (project root — most likely)
   - User's Documents / Desktop
   - Google Drive / Dropbox sync folders
   - Any `~/notes/`, `~/marketing/`, or similar directory
   - `git log --all --diff-filter=D -- '*Marketing_Plan*'` in case it was committed and removed
2. If found locally but not in repo: ask Mike whether to commit it (probably yes — it's the source of truth per CLAUDE.md).
3. If genuinely lost: ask Mike whether to recreate it from his memory + the daily logs, or to skip and rely on CLAUDE.md alone.

**Once located, modify the plan to incorporate the acquisition framing:**

- Add a new top-of-document **"Long-Term Goal & Standing Lens"** section reproducing the three-pillar reframe above. Make it the orientation paragraph — every other section should read in light of it.
- Find any sections about content/positioning/messaging and add **"Acquisition lens:"** sub-bullets noting how that piece reinforces dataset moat / fight-night moment / founder story.
- Find the metrics/baseline section (CLAUDE.md mentions "downloads, MAU, App Store rating, cost per install, Reddit post engagement") and **expand the metrics list** to match the acquisition-readiness metrics in TASK 2 below. The 5-metric baseline is fine for momentum tracking, but the acquisition-readiness dashboard is the longer-horizon view.
- Do NOT change campaign tactics, target dates, or weekly cadences. The point is reframing, not replanning.

Commit message: `docs(marketing): incorporate acquisition narrative as standing lens`

---

### TASK 2 — Build acquisition-metrics dashboard on admin panel

**Approved by Mike on 2026-05-09.** Goal: a single page Mike can pull up to see, at a glance, the numbers an acquirer would ask about.

**Backend endpoint:** `GET /admin/metrics/acquisition-snapshot` in `packages/backend/src/routes/admin.ts`

Returns JSON in roughly this shape:

```ts
{
  audience: {
    totalUsers: number,
    activeUsers30d: number,        // MAU
    activeUsers1d: number,         // DAU
    dauMauRatio: number,           // DAU/MAU
    newUsersLast30d: number,
    growthRate90d: number,         // (MAU now - MAU 90d ago) / MAU 90d ago
  },
  dataset: {
    totalRatings: number,
    totalReviews: number,
    uniqueFightsRated: number,
    uniqueFightsWith10PlusRatings: number,  // the "useful dataset" metric
    coveragePromotions: number,             // count of distinct promotion sources
    oldestRatingDate: string,               // proves the 10-year claim
    avgRatingsPerActiveFight: number,
  },
  engagement: {
    ratingsPerActiveUser30d: number,
    pctMauWithRecentRating: number,
    notificationOptInPct: number,           // pushToken IS NOT NULL / total active
    avgFollowedFightersPerActiveUser: number,
  },
  liveEvents: {
    // Populate from PostHog once instrumented; placeholder for now
    lastEventName: string,
    lastEventPeakConcurrentUsers: number | null,
    lastEventRatingsSubmitted: number,
  },
  operational: {
    crashFreeSessionRate: number | null,    // PostHog once instrumented
    backendUptimePct: number | null,        // pulled from Render, manual for now
  },
}
```

Most of these are direct Postgres queries. The PostHog-dependent ones return `null` for now and get filled once TASK 3 lands.

**UI:** Add an "Acquisition Snapshot" tab/section in `packages/backend/public/admin.html`. Card-based layout, big numbers, trend deltas where possible. Mike currently has Operations / Trackers / etc — add this as a new top-level section.

Refresh button should re-hit the endpoint. Auto-refresh OFF by default (queries can be expensive).

**Why this matters:** Mike currently has no aggregated view of the acquisition story. This becomes the artifact he can screenshot for an investor/buyer conversation, and the dashboard he checks every 2 weeks per CLAUDE.md's metric cadence.

Commit message: `feat(admin): acquisition-metrics snapshot endpoint and dashboard`

---

### TASK 3 — Wire up PostHog product analytics

**Approved by Mike on 2026-05-09.** PostHog has a generous free tier and is the right tool for this stage.

**Setup steps:**

1. **Account:** Mike to create a PostHog Cloud account at posthog.com and a project called "Good Fights." Capture the project API key. (Ask him for it before starting code work — don't commit raw keys.)
2. **Env vars** (Render + Vercel + EAS):
   - `POSTHOG_KEY` (backend, Render)
   - `NEXT_PUBLIC_POSTHOG_KEY` (web, Vercel)
   - `EXPO_PUBLIC_POSTHOG_KEY` (mobile, eas.json)
   - `POSTHOG_HOST` if non-default (typically `https://us.i.posthog.com`)
3. **SDKs:**
   - Mobile: `posthog-react-native` in `packages/mobile`
   - Web: `posthog-js` + Next.js provider pattern in `packages/web`
   - Backend: `posthog-node` in `packages/backend`
4. **Initialization:** Wrap providers at app root for mobile + web. Initialize a singleton client for backend.
5. **User identification:** Call `identify` on login/refresh with the user's UUID. Anonymous distinct ID for pre-auth events.

**Events to instrument (start minimal — these 6 cover ~80% of the dashboard):**

| Event | Where | Properties |
|---|---|---|
| `app_open` | Mobile/web app entry | `region`, `platform` |
| `view_event` | Event detail screen mount | `event_id`, `event_name`, `promotion`, `is_live` |
| `view_fight` | Fight modal/page open | `fight_id`, `event_id`, `is_live` |
| `rate_fight` | Successful rating submit | `fight_id`, `rating`, `is_live`, `time_since_fight_end` |
| `write_review` | Successful review submit | `fight_id`, `review_length`, `is_live` |
| `enable_notifications` | Push permission granted OR bell tapped | `source` (settings/fight/event) |

**User properties to set on identify:**

- `install_date` (from User.createdAt)
- `region` (from User.broadcastRegion)
- `followed_fighter_count`
- `total_ratings`
- `is_email_verified`

**Once events are flowing:**

- Update the `liveEvents` and `operational` fields in the acquisition-snapshot endpoint to call PostHog's query API
- Build a PostHog dashboard with: DAU/MAU trend, retention curve, funnel (app_open → view_event → view_fight → rate_fight), notification opt-in rate

**Why now:** UFC 328 was tonight (2026-05-09). MVP Netflix is 2026-05-16, UFC White House is 2026-06-15. We need PostHog live before White House so we can capture peak-concurrency data on the largest card of the campaign.

Commit message: `feat(analytics): wire PostHog across mobile, web, and backend`

---

## Decisions made on 2026-05-09

- ✅ Acquisition narrative becomes a standing lens for marketing decisions (not a campaign change)
- ✅ Build admin-panel acquisition-metrics dashboard
- ✅ Adopt PostHog for product analytics (free tier, 6-event minimum to start)
- ✅ Marketing plan file needs to be located on laptop and updated — handoff issued because Mike was on phone

## Open questions for next session

1. Where is `GOOD_FIGHTS_90_Day_Marketing_Plan.md`? Confirm location before editing.
2. PostHog project API key (Mike to provide after account setup).
3. Should the admin metrics dashboard be public-tier admin-only (current admin email allowlist), or behind a stricter gate? Default: same allowlist as existing admin panel.
4. Reddit post for UFC 328 — was it posted? (Carry-over question from the 2026-05-09 session that we never answered before pivoting to strategy.)

## Pointers

- Marketing context: CLAUDE.md → "Marketing Sessions" section
- Today's daily log (with Marketing section): `docs/daily/2026-05-09.md`
- Existing admin panel: `packages/backend/public/admin.html`, `packages/backend/src/routes/admin.ts`
- Live event system (where concurrency data lives): `packages/backend/src/services/eventLifecycle.ts`
- Coverage breadth (for dataset moat metrics): `packages/backend/src/config/liveTrackerConfig.ts`
- Backfill orchestrator (proves data freshness): `packages/backend/src/scripts/backfillResults.ts`
