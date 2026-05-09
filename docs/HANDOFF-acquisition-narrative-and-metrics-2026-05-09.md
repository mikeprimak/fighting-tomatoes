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

---

# Addendum — Same session, later (2026-05-09)

After the initial handoff, Mike and Claude continued the conversation and made additional decisions. The sections below extend (do not replace) what's above.

## Mike's stated targets and dataset facts

**Personal sale-price target:** $7M USD minimum. Open to higher; this is the floor he feels he needs personally. Not a wishful figure — a real anchor for decision-making.

**Legacy dataset (canonical numbers — use these, not estimates):**

- 13,000+ fights tracked
- 66,000+ community ratings
- 1,400+ events covered
- 10-year continuity across legacy platforms → Good Fights mobile

Per-fight rating density averages ~5. The strength is **continuity + breadth**, not raw rating count. Lead with: *"10 years of continuous fan-rating data across 1,400+ events and 11+ promotions, with the rate of new ratings now accelerating as the mobile product matures."* Pull the actual current rating-rate trend (legacy vs. last 90 days vs. last 30 days) when running the metrics dashboard — that slope is the most important pitch number.

## $7M target — what it requires

The $7M figure sits at the **Scenario B / Scenario C boundary** in the broader valuation framework. Three plausible paths:

1. **Strategic buyer at lower-mid range** ($5–8M). Most likely. Requires 100K+ MAU, peak concurrency proof on a major UFC PPV, dataset narrative quantified, and a buyer in the building who already wants what we have.
2. **Asset deal + dataset licensing combo.** Company sells for $3–4M to a media/sports buyer, dataset licensed for $2–3M to a sports-data buyer in a parallel transaction. Adds to $7M but doubles the deal complexity.
3. **Competitive process.** $5M offer becomes $7M because a second buyer surfaces. Requires deliberate buyer-pipeline work starting now, not at month 11.

All three paths require the buyer pipeline workstream below. Path #1 is the most likely; design toward it.

---

## TASK 4 — Add Twitter Hype-Index posts to active marketing plan

**Approved by Mike on 2026-05-09.** Once the marketing plan file is located in TASK 1, add a new recurring tactic.

**What to add to the plan:**

A weekly Twitter post cadence — every fight week (Tuesday or Wednesday is the right slot, before media-day coverage peaks) — featuring the Good Fights Hype Index for that weekend's card. Format options:

- Top 5 most-anticipated fights by hype score
- Biggest hype risers (fights gaining hype across the week)
- Fighter-vs-fighter hype matchup graphics
- "Hype score gap warning" — fights where pre-fight hype was high but the matchup looks lopsided

**Why:** Mike has confirmed he is effectively the only operator in the space quantifying **pre-fight hype**. Post-fight ratings have a few entrants. Pre-fight hype has none. This is a defensible content niche that:

- Requires no new product work — uses data Good Fights already collects
- Generates organic Twitter shares (MMA Twitter loves quantified hot takes)
- Self-markets the app on the platform where MMA fans aggregate
- Builds the press hook for "Good Fights Hype Index" as a recognizable phrase
- Costs ~30 minutes per week to produce

**Cadence:** Start this week. Don't wait. UFC 328 is too late, but post a retrospective hype-vs-actual graphic *after* tonight's main card to prove the model. Then start prospective hype posts for UFC Fight Night 2026-05-16 (MVP Netflix card week) onward.

**Plan integration:** The marketing plan probably has a weekly tactics section organized by phase or week. Insert a "Twitter Hype Index" recurring item into every fight-week column from this point forward. Don't replace existing tactics — add to them.

**Hype Index positioning note:** This is currently an **informal positioning we are strongly considering**, not a committed brand strategy. Do NOT yet rewrite Good Fights' core positioning, App Store description, or landing page around "the hype index of combat sports." That decision is pending. The Twitter posts are a low-risk experiment to see if the format gets traction; full positioning shift happens only if the experiment succeeds.

Commit message: `docs(marketing): add Twitter Hype Index weekly cadence to plan`

---

## New workstream — Buyer pipeline (separate from 90-day plan)

**Approved by Mike on 2026-05-09.** This runs **in parallel** to the 90-day marketing plan, not inside it. The 90-day plan is about momentum + audience; this workstream is about generating the offer that hits $7M.

The single biggest mistake at Mike's stage would be waiting until month 11 to start buyer conversations. By then it's too late — buyer relationships take months to warm, and a competitive process needs at least 2 active conversations running in parallel. **Start now, low-key, even when the metrics aren't where they need to be yet.**

### Sub-task 4a — Build buyer landscape map

A simple structured document — could live as `docs/marketing/buyer-pipeline.md` — listing potential acquirers in tiers:

**Tier 1 (most likely strategic buyers):**
- DAZN — combat sports streaming, history of niche acquisitions, plausible primary fit
- TKO Group / UFC — Fight Pass needs a fan-engagement layer, but they prefer building over buying
- Endeavor (TKO parent) — broader portfolio fit
- PrizePicks — DFS-adjacent, MMA vertical is underdeveloped
- DraftKings — MMA betting product would benefit from fan data
- FanDuel — same logic as DraftKings

**Tier 2 (asset/data buyers):**
- FloSports — combat sports media rollup pattern
- Stats Perform — sports data licensing
- Genius Sports — sports data + betting infrastructure
- Sportradar — global sports data
- Vox Media (SB Nation parent) — owned MMA Fighting historically

**Tier 3 (long-shot or wildcard):**
- ESPN / Disney — has UFC rights, unlikely to buy small but possible
- Comcast / NBC Sports — boxing rights holder
- Liberty Media — F1 + Atlanta Braves owner, sports M&A appetite
- Saudi-backed combat sports vehicles (Riyadh Season, etc.) — emerging buyer pool

Each row should capture: company name, why they fit, decision-makers (if known), warm-intro path (if any), last contact (initially blank).

### Sub-task 4b — Prep core artifacts

A buyer pipeline needs deliverables ready *before* the conversation, not during. Prep these over the next 60 days:

1. **One-pager** — single-page PDF with: dataset numbers, coverage breadth, MAU + growth, the 10-year continuity story, the Hype Index angle (if positioning solidifies), screenshots, contact info. Mike's job to write; Claude can draft.
2. **Demo deck** — 8–12 slides expanding the one-pager: market context, problem/solution, dataset moat, audience growth, fight-night demo metrics, financial summary, the team (Mike), the ask. Used for warmer conversations after initial interest.
3. **Live demo flow** — a scripted 5-minute product walkthrough optimized for buyers, not users. Different beats than the App Store preview video. Highlights the things a buyer cares about: data depth, live event system, push notification engagement, multi-org coverage.
4. **Financial summary** — revenue (if any), costs, runway. Even at $0 revenue, the cost side matters: "monthly burn $X, primarily Render/Vercel/AWS." Buyer wants to see operational discipline.
5. **Dataset query pack** — pre-canned SQL that produces the exact numbers a buyer's diligence team will ask for. Total ratings by year, ratings density distribution, retention cohorts, top-rated fights all-time, etc. When the buyer asks "can you get us X?" Mike answers in 4 hours, not 4 days.

### Sub-task 4c — Outreach cadence

Start with **passive signaling** — building visibility so buyers find Mike — before active outreach.

**Months 0–3 (now through July 2026):**
- Don't pitch anyone yet. Build proof.
- Twitter Hype Index posts (TASK 4) — by their nature, this gets the app on industry radar
- Press hits during marquee fight weeks — even one piece in The Athletic / Bloody Elbow / Cageside Press signals to buyers that Good Fights "is a thing"
- Soft mentions in podcasts (MMA Hour, Heavy Hands, etc.) — not paid, just organic outreach to hosts with the dataset angle

**Months 3–6 (July–October 2026):**
- First deliberate buyer touches. Warm intros only — no cold outreach yet.
- Goal: 5–10 informational conversations with corp-dev or strategy-side people at Tier 1 + Tier 2 companies
- Frame as "I'd love to learn how you think about fan-engagement products in MMA" — informational, not sales
- These are *relationship-building* meetings. No deck needed yet, just the one-pager.

**Months 6–12 (October 2026 – April 2027):**
- Convert relationships into real conversations.
- If metrics are where they need to be (100K+ MAU, fight-night concurrency proof), start running a quiet process with 2–3 most-interested parties
- This is the point at which engaging an M&A advisor becomes a real consideration (see 4d)

### Sub-task 4d — Advisor question

At a $7M target, Mike is in a band where boutique M&A advisors / sell-side bankers will take the engagement. Typical fee 5–8% of deal value (so ~$350–560K on a $7M deal). The trade is: they bring buyer relationships and run the process, you focus on building the company.

This is **not a decision for now** — too early. But by month 9 of the pipeline, the question becomes: is Mike going to run this himself, or engage a boutique? Honest answer for most solo founders without M&A experience: **engaging an advisor at the right moment usually pays for itself**. The advisor's relationships compress 6 months of warming into 6 weeks. Worth a real evaluation when the moment arrives.

Names to research when the time comes (not endorsements — starting points): Drake Star, Bowery Capital, AGC Partners (consumer/media boutiques with sports-tech experience). Also founder-friendly options like Fairmount Partners.

### What to do with this workstream now

**The next session does not need to do all of this at once.** The minimum viable next step is:

1. Create `docs/marketing/buyer-pipeline.md` with the buyer landscape map (Tier 1/2/3 companies, blank fields for relationships and contacts)
2. Add a stub for each prep artifact (one-pager, deck, demo flow, financials, query pack) — even if empty, having the slot reserved means it gets filled
3. Set a quarterly cadence to review the pipeline doc and update relationships

The artifacts get drafted across multiple future sessions, not all today.

Commit message: `docs(marketing): buyer pipeline workstream and landscape map`

---

## Future product surfaces (strategic optionality)

Mike confirmed on 2026-05-09 that he is **open to future product features**, with the explicit framing: **optimize new features for highest payoff toward maximizing sale value**, not for product-purity reasons.

This is the right framing. Concretely it means:

### Features that likely *do* multiply sale value

- **Hype Index as a productized surface** — dedicated landing page, public-facing fighter/event hype scores, embeddable widgets. Reinforces the "category-defining" pitch.
- **Predictions market** (round/method/winner predictions, no money) — generates more first-party data per fight, more daily-use behavior, better fight-night concurrency
- **Co-watching chat** — see "Deliberate shelf" below
- **Fighter pages with historical hype + rating trends** — turns the 10-year dataset into a *visible, marketable surface* rather than a backend stat
- **Hype Index public API / widget program** — distribution layer that gets the brand on third-party sites and broadcasts; low maintenance, high signaling
- **Subscription tier** ($4.99/mo or similar) — even modest ARR (e.g., $5K MRR) unlocks revenue-multiple math for buyers, which can change the deal valuation framework entirely

### Features that likely *don't* multiply sale value

- General-purpose social network expansion (timelines, follows-of-follows, etc.) — dilutes the rating-app identity, doesn't add to the dataset moat
- Cross-vertical expansion (boxing-only or martial-arts-only spinoffs) before the core combat-sports product is dominant
- Heavy editorial/content production — capital-intensive, doesn't compound the dataset
- Marketplace / e-commerce features — unrelated to the moat

### Deliberate shelf — Co-watching chat feature

Mike started building a co-watching chat feature in Good Fights with: synced round scoring, fight-themed reactions/gifts, emoji fight ratings. He shelved it deliberately for v1 to keep Good Fights laser-focused on rating fights.

**This call was correct and should hold through 2026-07-13.** Reasons:

1. Focus is the v1 product's edge. "Good Fights = rate fights" is a 3-second elevator pitch. Adding chat dilutes it.
2. Real-time chat infrastructure is the most maintenance-heavy code a solo dev can ship. One bad PPV night and the chat is offline at the worst possible moment.
3. Beating WhatsApp on general chat is impossible. The feature only works if it's *complementary* — i.e., in-app reactions tied to fight events, synced round scoring, prediction markets within the group. That's a different, more ambitious product than v1.

**But the unbuilt feature is itself a deal asset.** When pitching buyers: *"We have a co-watching social layer prototyped, with strong viral mechanics observed in early testing"* is a slide that adds 10–20% to offers. It signals upside without committing to the build.

Two paths post-July 13:

- **Path A — Build it ourselves as v2 launch** if metrics suggest the core product is plateauing and chat is the unlock. Frame it as a major v2 product moment.
- **Path B — Hold it for the buyer** if a strategic acquirer surfaces who would want to ship it post-acquisition with their resources. This becomes part of the "what we'd do with your company" pitch.

Don't decide which path until the 90-day campaign concludes and we can see how the metrics moved.

---

## Updated decisions log (cumulative through 2026-05-09)

- ✅ Acquisition narrative becomes a standing lens for marketing decisions
- ✅ Build admin-panel acquisition-metrics dashboard (TASK 2)
- ✅ Adopt PostHog for product analytics (TASK 3)
- ✅ Add Twitter Hype Index weekly cadence to marketing plan (TASK 4)
- ✅ Hype Index positioning treated as informal strategy, not yet a committed rebrand
- ✅ Stand up buyer pipeline as a parallel workstream — not inside the 90-day plan
- ✅ Future product features evaluated against sale-value impact, not product-purity
- ✅ Co-watching chat shelf decision holds through 2026-07-13; revisit post-campaign
- ✅ $7M USD is Mike's stated minimum sale-price target; design toward this anchor

## Updated open questions

5. Marketing plan file format — what does its weekly cadence section look like? (Required to know how to insert the Twitter Hype Index item correctly in TASK 4.)
6. Does Mike already have buyer-side relationships from the legacy platforms / 10-year combat sports operating history? Any warm-intro paths into Tier 1 companies?
7. Should `docs/marketing/` be created as a new top-level marketing docs directory, or do we keep marketing files at the root / under `docs/plans/`?
