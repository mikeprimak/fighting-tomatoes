# Good Fights — Buyer Pipeline

**Purpose:** track potential acquirers and the artifacts needed to talk to them. Sits alongside `GOOD_FIGHTS_90_Day_Marketing_Plan.md`. The 90-day plan is about momentum; this doc is about generating the offer. **Both should be read at the start of every marketing session.**

**Sale-price anchor:** $7M USD minimum (Mike's stated floor, 2026-05-09). Most likely path is a strategic buyer in the $5–8M range; a competitive process with two interested parties is what bridges $5M to $7M.

**Operating principle:** start now, even when metrics aren't there yet. Buyer relationships take months to warm. Waiting until month 11 is the single biggest mistake at this stage.

**Source decisions:** see `docs/HANDOFF-acquisition-narrative-and-metrics-2026-05-09.md` for the full reasoning behind tiers, artifacts, and outreach phases.

---

## Quarterly review reminder

Reviewed every 3 months. **Next review: 2026-08-09.** At each review:

- Update relationships and last-contact dates
- Re-tier any company whose fit has changed
- Decide: still in passive-signaling mode, or time for active outreach?
- Promote any prep-artifact stub from "not started" to "drafted" / "shipped"

---

## Buyer landscape map

Each row tracks: who they are, why they fit, decision-maker (if known), warm-intro path (if any), and last contact (blank to start).

### Tier 1 — most likely strategic buyers

| Company | Why they fit | Decision-maker | Warm-intro path | Last contact |
|---|---|---|---|---|
| **DAZN** | Combat sports streaming; history of niche acquisitions; plausible primary fit | — | — | — |
| **TKO Group / UFC** | Fight Pass needs a fan-engagement layer (though TKO prefers building over buying) | — | — | — |
| **Endeavor (TKO parent)** | Broader sports/media portfolio fit | — | — | — |
| **PrizePicks** | DFS-adjacent; MMA vertical underdeveloped | — | — | — |
| **DraftKings** | MMA betting product would benefit from fan data | — | — | — |
| **FanDuel** | Same logic as DraftKings | — | — | — |

### Tier 2 — asset / data buyers

| Company | Why they fit | Decision-maker | Warm-intro path | Last contact |
|---|---|---|---|---|
| **FloSports** | Combat sports media rollup pattern | — | — | — |
| **Stats Perform** | Sports data licensing | — | — | — |
| **Genius Sports** | Sports data + betting infrastructure | — | — | — |
| **Sportradar** | Global sports data | — | — | — |
| **Vox Media (SB Nation parent)** | Owned MMA Fighting historically | — | — | — |

### Tier 3 — long shots / wildcards

| Company | Why they fit | Decision-maker | Warm-intro path | Last contact |
|---|---|---|---|---|
| **ESPN / Disney** | Has UFC rights; unlikely to buy small but possible | — | — | — |
| **Comcast / NBC Sports** | Boxing rights holder | — | — | — |
| **Liberty Media** | F1 + Atlanta Braves owner; sports M&A appetite | — | — | — |
| **Saudi-backed combat sports vehicles** | Riyadh Season et al; emerging buyer pool | — | — | — |

---

## Prep artifact stubs

Five core artifacts a buyer pipeline needs ready *before* a conversation, not during. **Stubs only — these get drafted across multiple future sessions, not all today.**

### 1. One-pager (single-page PDF)

**Status:** not started. **Target draft:** by 2026-07-13 (end of 90-day plan).

Single-page summary with: dataset numbers (13,000+ fights, 66,000+ ratings, 1,400+ events, 11+ promotions, 10-year continuity), MAU + growth slope, Hype Index angle (if positioning solidifies), screenshots, contact info. Mike to write; Claude can draft.

### 2. Demo deck (8–12 slides)

**Status:** not started. **Target draft:** by 2026-09-30 (start of warm-intro phase).

Expanded version of the one-pager. Used for warmer conversations after initial interest. Sections: market context, problem/solution, dataset moat, audience growth, fight-night demo metrics, financial summary, the team (Mike), the ask.

### 3. Live demo flow (scripted 5-minute product walkthrough)

**Status:** not started. **Target draft:** by 2026-09-30.

Different from the App Store preview video — optimized for buyers, not users. Highlights data depth, live event system, push notification engagement, multi-org coverage. Script + actual recorded demo.

### 4. Financial summary

**Status:** not started. **Target draft:** by 2026-09-30.

Revenue (if any), costs, runway. Even at $0 revenue, the cost side matters: "monthly burn $X, primarily Render/Vercel/AWS." Buyer wants to see operational discipline.

### 5. Dataset query pack

**Status:** not started. **Target draft:** by 2026-09-30.

Pre-canned SQL that produces the exact numbers a buyer's diligence team will ask for: total ratings by year, ratings density distribution, retention cohorts, top-rated fights all-time, hype-vs-actual variance, etc. Goal: when the buyer asks *"can you get us X?"*, Mike answers in 4 hours, not 4 days. Likely lives as a folder of `.sql` files in `packages/backend/scripts/buyer-diligence/`.

---

## Outreach cadence

### Phase 1 — passive signaling (now → 2026-07-13)

**Don't pitch anyone yet. Build proof.**

- Twitter Hype Index posts (TASK 8 in marketing plan) — by their nature, these get the app on industry radar
- Press hits during marquee fight weeks — even one piece in The Athletic / Bloody Elbow / Cageside Press signals to buyers that Good Fights "is a thing"
- Soft mentions on podcasts (MMA Hour, Heavy Hands, etc.) — organic outreach to hosts with the dataset angle, not paid

### Phase 2 — first informational conversations (2026-07-14 → 2026-10-13)

**Warm intros only, no cold outreach.**

- Goal: 5–10 informational conversations with corp-dev or strategy-side people at Tier 1 + Tier 2 companies
- Frame as *"I'd love to learn how you think about fan-engagement products in MMA"* — informational, not sales
- Relationship-building meetings. No deck needed yet, just the one-pager.

### Phase 3 — convert to real conversations (2026-10-14 → 2027-04-13)

- If metrics are there (100K+ MAU, fight-night concurrency proof), start a quiet process with 2–3 most-interested parties
- This is when engaging an M&A advisor becomes a real consideration (see below)

---

## Advisor question

At a $7M target, Mike is in a band where boutique M&A advisors / sell-side bankers will take the engagement. Typical fee 5–8% of deal value (~$350–560K on a $7M deal). Trade: they bring buyer relationships and run the process, freeing Mike to focus on the company.

**Decision deferred until ~month 9 of the pipeline (~2027-02).** Honest answer for most solo founders without M&A experience: engaging an advisor at the right moment usually pays for itself — their relationships compress 6 months of warming into 6 weeks.

When the moment arrives, names worth researching (not endorsements, just starting points): Drake Star, Bowery Capital, AGC Partners, Fairmount Partners.

---

## Open questions to fill in over time

- Does Mike already have buyer-side relationships from the legacy platforms / 10-year combat sports operating history? Any warm-intro paths into Tier 1 companies?
- Which 2–3 Tier 1 companies should be priority targets for the first warm intros in Phase 2?
- Is there a single anchor metric (e.g., "100K MAU achieved") that triggers the move from Phase 1 to Phase 2, or is it date-based?

---

## Reading-protocol checklist

When this doc gets read in a marketing session:

1. Has any company in the table had a new touchpoint? Update its row.
2. Has any prep artifact moved status? Update it.
3. Is the current outreach phase still right, or has the calendar moved us forward?
4. Is anything in the 90-day plan generating a moment we should use for buyer signaling? (a strong concurrency metric, a press hit, etc.)

---

*Created 2026-05-09 from the acquisition-narrative handoff (`docs/HANDOFF-acquisition-narrative-and-metrics-2026-05-09.md`).*
