# GOOD FIGHTS — AI-Leveraged Marketing Plan 2026
### The Solo Dev × AI Team System

> *"Two operators. One human, one model. Every dollar attributed. Every claim sourced. Every artifact a deal asset."*

**Created:** 2026-05-13
**Author:** Mike (founder) + Claude (AI partner)
**Runs alongside:** `GOOD_FIGHTS_90_Day_Marketing_Plan.md` (does not replace it — augments it)
**Triggered by:** the 2026-05-13 attribution gap — we couldn't tell if $80 of ad spend caused anything, so we're rebuilding the system to never have that question again.

---

## THESIS

A solo dev paired with AI can outproduce a 4-person marketing team per dollar spent — *if* the dataset is treated as both the moat and the content engine, and *if* every action is attributable.

Combat sports marketing in 2026 is a noise market. Every promotion has a Twitter account. Every fight site has a writer. What no one else has is **10 years of fan-rating data across 11 promotions**. That dataset is the only asymmetric advantage Good Fights has, and we underuse it.

This plan turns the dataset into a flywheel:
- **Data → content** (Hype Index, sleeper picks, retrospectives)
- **Content → audience** (Twitter, Reddit, press)
- **Audience → installs** (with attribution)
- **Installs → ratings** (more data)
- **More data → better content** (loop)

The goal is not virality. It's **attributable repeatable signal**.

---

## GUARDRAILS

What this plan is NOT:

- ❌ Not a replacement for the 90-day plan — runs alongside it through 2026-07-13, then absorbs it
- ❌ Not a license to redesign the product
- ❌ Not a license to increase ad spend (still $100/mo) until attribution proves it's working
- ❌ Not chasing virality — chasing **repeatable signal**
- ❌ Not adding new channels — written/async only. No live video. No cold DMs. No TikTok.
- ❌ Not pushing the founder into extrovert work

What this plan IS:

- ✅ Attribution-first — every spend has a clean before/after
- ✅ AI-leveraged production — Claude drafts, Mike ships
- ✅ Dataset-fueled — every claim sourced from `goodfights.app` data
- ✅ Acquisition-aware — every artifact serves both growth AND the deal narrative
- ✅ Compounding — week N's work feeds week N+1's content

---

## THE FIVE SYSTEMS

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. ATTRIBUTION SPINE  ──┐                                     │
│         (the foundation)  │                                     │
│                           ▼                                     │
│   2. HYPE INDEX ENGINE ──► 3. PRESS HOOKS ──► 4. SEO LANDING    │
│      (weekly content)     (monthly pitches)   (long-tail)       │
│                                                                 │
│   5. LEGACY DRIP (bi-weekly to 2,000 dormant users)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## SYSTEM 1 — ATTRIBUTION SPINE
### The non-negotiable foundation

**The problem this solves:** On 2026-05-13 we couldn't tell if a $80 UFC 328 ad spend caused a 30-install spike or if it was legacy-site Sunday redirect traffic. That ambiguity is unacceptable going into the UFC White House card with a $70+ spend.

**Components:**

| Component | What it does | Cost | When live |
|---|---|---|---|
| UTM tagging schema | Every outbound link tagged by source/medium/campaign | $0 | This week |
| Legacy-site redirect UTM | Differentiates `?utm_source=fightingtomatoes` traffic | $0 | This week |
| Install referrer capture | Play Store + App Store install attribution | $0 | This week |
| PostHog mobile SDK | Cross-platform first-open + session events | $0 (free tier) | Before June 14 |
| Control weeks | Designated no-ad weeks to establish organic baseline | $0 | May 18–24 first one |
| Weekly attribution report | Claude pulls + writes Monday brief | $0 (AI time) | Starting May 19 |

**Acceptance criteria:** the question *"did spend X cause result Y"* has a yes/no answer with data, every time.

**Deliverables (week of May 13–18):**

1. Tagging schema doc at `docs/marketing/attribution-spine.md`
2. Update legacy `fightingtomatoes.com` redirect to append `?utm_source=fightingtomatoes&utm_medium=redirect&utm_campaign=legacy-org`
3. Add install referrer event to mobile (`packages/mobile/services/analytics.ts` or new file)
4. Wire PostHog SDK into mobile app
5. Designate May 18–24 as **Control Week #1** — zero paid spend, observe baseline

**Future-state:** every action this plan generates carries UTM. Every campaign is sandwich-comparable against a control week. No more "we think the spend did something."

---

## SYSTEM 2 — HYPE INDEX CONTENT ENGINE
### The flywheel

The Twitter Hype Index cadence in the 90-day plan is ONE post per fight week. Scale it: **AI-drafted, multi-channel, multi-format, every fight week.**

**Post format — non-negotiable (LOCKED 2026-05-13):**

For posts tied to a specific card:
- **Image 1: the official card poster, unedited** (UFC/MVP/promotion poster as-is — posting unmodified is standard MMA Twitter practice, low legal risk, faces stop thumbs)
- **Image 2: the Good Fights data graphic, branded template** (consistent fonts/palette/logo every week, no fighter likenesses)
- Twitter renders multi-image as 2x2 grid by default — both visible at once
- Caption leads with the data hook, ends with `goodfights.app`

For evergreen posts (career arcs, year-end rollups, cross-promotion comparisons, "most overrated fight of [month]"):
- Single branded data graphic, no poster
- Same template, swap data

**Why this format works:**
- Posters carry the attention (faces)
- Data graphic carries the brand (Good Fights visual identity)
- Editing them together creates legal risk (modifying official IP) and breaks weekly template consistency
- Data graphic is reusable across Reddit, IG, newsletter — locked to no specific event

The caption is the hook: leads with the data point, ends with `goodfights.app`. AI drafts 3 caption variants per post — data-led, story-led, humor-led — Mike picks one (default: humor).

**Weekly cadence during a fight week (Tue → Sun):**

| Day | Post | Channel | Format |
|---|---|---|---|
| Tuesday | Top 5 most-hyped fights on the card | Twitter + IG Story | **Branded graphic** + caption |
| Wednesday | Sleeper fight of the week | Reddit (r/MMA, r/MMA_TV) | Text post + embedded chart screenshot |
| Thursday | Hype gap warning — high hype, mismatched matchups | Twitter | **Branded graphic** + caption |
| Friday | Pre-card hype heatmap | Twitter + IG Story | **Heatmap graphic** + caption |
| Saturday | Live reaction thread (light touch) | Twitter | Text replies during prelims |
| Sunday morning | Hype-vs-actual retrospective | Twitter + Reddit verdict | **Comparison graphic** + writeup |

**Non-fight week (Mon → Fri):**

| Day | Post | Channel |
|---|---|---|
| Wednesday | "Most overrated fight of [last month]" | Twitter |
| Friday | Fighter spotlight — career hype arc | Twitter + IG |

**AI's role (every week, every post):**

1. Pull raw data from DB (script generates JSON)
2. Draft 3 caption variants per post: **data-led**, **story-led**, **humor-led** (humor is the default per established preference)
3. Generate Canva-ready data graphic spec
4. Suggest optimal post time based on past engagement
5. Cross-link to relevant landing page (System 4)

**Mike's role:**

1. Pick the variant (usually humor)
2. Hit publish
3. Log result in tracking sheet

**Estimated time per fight week for Mike:** 30 min total across the whole week.

**Reuse loop:** every graphic is logged for the press hooks engine (System 3) and the buyer one-pager. Nothing is single-use.

---

## SYSTEM 3 — PRESS HOOKS ENGINE
### Monthly briefing

The dataset contains pitchable stories that journalists at The Athletic, Bloody Elbow, Cageside Press, Sherdog, and MMA Fighting would actually run. They don't have this data. We do.

**Monthly process (1st of each month, ~2 hours):**

1. **AI scan** — Claude runs a series of analyses against the database:
   - Highest hype-vs-actual gap in the prior 30 days
   - Most-rated fight of the past month
   - Fighter whose hype score arc changed most dramatically
   - Promotions with rising / falling average satisfaction
   - "Letterboxd-style" rankings (most-loved fight of 2025, most-hated, etc.)
2. **Briefing output** — 5–10 pitchable angles with the supporting data for each
3. **Pitch selection** — Mike picks 1–2 strongest
4. **AI drafts the pitch email** + a one-page data supplement
5. **Mike sends to 3–5 outlets** (no cold DMs, just one short email with the data)

**Target outlets (low-touch, async pitching):**

- Tier A: The Athletic MMA, Bloody Elbow, Cageside Press
- Tier B: Sherdog, MMA Fighting, MMA Junkie
- Tier C: MMA podcasts that read research-driven content (Heavy Hands, Co-Main Event)

**Acquisition lens:** every press hit citing "Good Fights data" is worth more than 100 installs. Buyers read press; press hits anchor the brand. The phrase "according to Good Fights" appearing in a Bloody Elbow column is a deal asset.

**First execution:** 2026-06-01.

---

## SYSTEM 4 — LONG-TAIL CAPTURE (REWORKED)
### Without the web app

**Original plan:** auto-generated SEO landing pages in `packages/web` for every event/fighter.
**Status as of 2026-05-13:** `packages/web` is frozen per the 2026-05-11 decision, and the user has confirmed reactivating it is not on the table for this plan.

**Revised approach — two parallel tracks:**

### Track A — Landing-page static SEO (low effort, deferred to post-July 13)

`packages/landing` (currently goodfights.app, static site) can host auto-generated event/fighter pages without violating the web-app freeze. Static generation is a different surface and a different deploy target.

- Auto-generated event pages at `goodfights.app/event/[slug]`
- Auto-generated fighter pages at `goodfights.app/fighter/[slug]`
- Annual "best of" rollups at `goodfights.app/best-of/[year]`
- Sitemap + JSON-LD structured data + App install CTA on every page
- **Decision deferred:** confirm with Mike before building. ~6-8hr work.

### Track B — Long-tail capture WITHOUT the web app (active now, no build needed)

If Track A stays on hold, distributed long-tail capture replaces it. AI seeds combat-sports-data-citing content across surfaces Google already indexes:

| Surface | Tactic | Cadence |
|---|---|---|
| **Reddit (r/MMA, r/boxing)** | Data-driven post-card threads with shareable charts | Every major card |
| **Quora** | AI-drafted answers to combat sports questions, citing Good Fights data | 2-3 per week |
| **Wikipedia (carefully)** | Citations on MMA articles where Good Fights data genuinely fills a gap. NOT self-promotional. Must be community-acceptable. | Opportunistic |
| **Substack collaborations** | Find MMA Substack writers, offer them data drops they can cite | Monthly outreach |
| **GitHub public repo** | Open-source aggregate (anonymized) dataset. Indexed by GitHub Search + Google + appears on Hacker News. | One-time launch + monthly updates |

**Track B has higher leverage right now** than Track A because:
- Zero build cost
- Pages already indexed (Reddit/Quora/Wikipedia rank on Google natively)
- Builds dataset credibility (citations from third parties > self-published)
- Acquisition-narrative friendly (press lifts cite Reddit threads, not your own site)

**Recommendation:** run Track B starting June 1. Revisit Track A at 2026-07-13 reassessment with attribution data showing what works.

**First execution:** 2026-06-01 (Track B Reddit + Quora cadence begins).

---

## SYSTEM 5 — LEGACY USER RE-ENGAGEMENT DRIP
### The dormant asset

2,000 migrated legacy users sit in the DB. The 2026-04-18 announcement email landed once. They are mostly dormant. They are also a deal asset that grows with engagement.

**Cadence:**

- Bi-weekly "what to watch" email, sent via Resend Broadcasts
- Two segments:
  - **Installed segment** — "rate these fights" CTA
  - **Not-installed segment** — soft install CTA + sample of new data
- Aligned to fight-week calendar — emails land Tuesday before major cards

**AI's role:**

- Drafts the email each fortnight from the upcoming-fights calendar + dataset
- Generates 3 subject line variants (data, story, humor — humor default)
- Reviews Resend open/click data, suggests adjustments
- Cross-references which segment converted on prior emails

**Mike's role:**

- Pick subject line
- Hit send

**Acquisition lens:** an active mailing list of 2,000 combat sports fans with measurable open rates is itself a deal asset. Resend → Mailchimp-style exports are standard buyer-diligence requests.

**First execution:** 2026-06-30 (after attribution is wired, after the first press hook, before the White House follow-through).

---

---

## PRODUCT CHANGES THAT UNLOCK MARKETING
### Catalog — Mike picks, not all at once

The original plan said "don't redesign the product during marketing push." That constraint is now lifted (2026-05-13): product changes are on the table IF they unlock distribution. Below is the catalog, ranked by **marketing leverage per build-hour**. Recommendation: pick 1-2 to commit to, not all five.

### PC-1 — Share Card Generator (HIGHEST LEVERAGE)

**What:** When a user submits a rating, the app generates a beautiful, branded shareable graphic — fighter portraits, user's rating, community average, Good Fights logo, app URL. Native share sheet pushes it to Instagram Stories, Twitter, iMessage, etc.

**Why it matters:** Every share is a free, native, attributable install ad. Letterboxd, Strava, and Spotify Wrapped all work this way — *the product itself becomes the marketing channel*. The user is the marketer.

**Build estimate:** 12-20 hours. Native share sheet integration + dynamic image generation server-side (Vercel OG image or Cloudflare Workers).

**Attribution:** UTM in shared URL → install referrer captures everyone who clicks back. Single biggest source of clean attributable installs we could ever build.

**Acquisition lens:** "user-generated marketing loop" is investor language. Letterboxd's whole moat is shared rating cards going viral.

**Recommendation:** ✅ Build first. Highest expected value.

### PC-2 — "Year in Combat Sports" Wrapped (HIGH LEVERAGE, SEASONAL) ✅ COMMITTED 2026-05-13

**What:** Spotify-Wrapped-style annual recap. Every December: user opens app → sees personalized "your 2026 in combat sports" — fights rated, top promotion, most-hyped fighter they backed, etc. Beautifully shareable.

**Why it matters:** One annual viral moment. Tens of millions of Spotify Wrapped shares each year are unpaid distribution. Combat sports has no equivalent. We could own it.

**Build estimate:** 30-40 hours. Designed once, runs every December. December 2026 release timing fits the acquisition narrative perfectly.

**Recommendation:** ✅ Build September-November for December 2026 launch. This becomes an annual tradition.

### PC-3 — Embed Widget (LOW EFFORT, MEDIUM LEVERAGE)

**What:** Tiny embeddable widget — `<script src="goodfights.app/widget.js" data-event="ufc-328">` — that any MMA blog, podcast show notes, or substack can drop in to show live community ratings for a fight.

**Why it matters:** Distributes the brand across every MMA blog without doing outreach. Each embed = persistent backlink + brand exposure + clickthrough.

**Build estimate:** 8-12 hours. Static JS + iframe.

**Recommendation:** ✅ Build June, distribute July. Pairs with the Press Hooks engine.

### PC-4 — Public Profile / Personal Stats (MEDIUM LEVERAGE)

**What:** Letterboxd-style public profile — anyone can see another user's ratings (privacy-toggleable). "Mike has rated 1,247 fights, 72 reviews, top fighter: Volkanovski."

**Why it matters:** Drives ego-based sharing ("look at my stats"), creates a social layer, increases retention.

**Build estimate:** 40-60 hours. Privacy controls + public URL routing + design work.

**Recommendation:** ⏸ Defer to post-July 13. Lower attribution leverage than PC-1; longer build.

### PC-5 — 60-Second Install-to-First-Rating Funnel ✅ COMMITTED 2026-05-13

**What:** Audit and shrink the install → first rating flow. Skip onboarding screens. Default to "rate the most recent fight" on first open. Make the first rating possible without signup (guest path).

**Why it matters:** After subtracting ~50 paid Android testers from the launch period (per `lesson_paid_android_testers_skew_funnel`), the real organic install-to-open rate is ~82%, not 56%. Healthy, but the open → first rating drop is almost certainly the bigger leak — and we currently have no PostHog data to measure it. Every friction-point removed is a free install conversion.

**Build estimate:** 10-15 hours. Mostly UX work, no new infrastructure.

**Recommendation:** ✅ Quick win. Must pair with PostHog rollout so we can measure funnel drop-offs before AND after — otherwise the optimization is unfalsifiable.

### Summary — what to build this 90 days

| Priority | Product change | Build hours | Marketing unlock |
|---|---|---|---|
| 1 | PC-1 Share Card Generator | 12-20 | Viral loop, free distribution |
| 2 | PC-5 Install-to-rating funnel | 10-15 | Conversion lift, dataset growth |
| 3 | PC-3 Embed Widget | 8-12 | Press/blog distribution |
| 4 | PC-2 Wrapped (start Sept) | 30-40 | Annual viral moment |
| Defer | PC-4 Public profiles | 40-60 | Lower leverage, longer build |

Total committed product investment: ~30-47 hours over 60 days. Doable solo with AI assist.

---

## CREATIVE BETS — LOW-COST EXPERIMENTS
### Layered shots on goal

A plan with one tactic dies on one bad bounce. A plan with ten cheap tactics survives 7 failures and still wins. These are independent experiments — each cheap to try, each with a clear bail criterion.

### CB-1 — AI-Narrated "Hype Index" Podcast (10 min weekly, fully AI)

**What:** Weekly 10-minute combat sports data podcast. Script drafted by Claude from dataset. Narrated by ElevenLabs or similar AI voice (2026-quality is broadcast-ready). Auto-published to Spotify, Apple Podcasts, YouTube Music via Anchor/Spotify for Creators.

**Why it works:** Mike never has to speak. Zero extrovert tax. Podcast directories are SEO real estate. Listeners convert to engaged users at higher rates than ad-driven installs. The phrase "the Good Fights Hype Index" gets repeated weekly in fans' ears.

**Cost:** ~$10-20/mo (ElevenLabs subscription). ~30 min/week to review + publish.

**Bail criterion:** if after 8 weekly episodes total listeners are < 50, retire it.

**Recommendation:** ✅ Start by 2026-06-30. Cheap, recurring, brand-building.

### CB-2 — Show HN / Hacker News Launch

**What:** "Show HN: 10 years of fan-rated combat sports data, now open." Release an anonymized aggregate dataset on GitHub. Post to Hacker News.

**Why it works:** HN audience is dense with engineers, founders, investors, corp dev. Even a moderate-trending HN post puts the project in front of thousands of decision-makers. The dataset itself becomes a credibility object — "the people who released that public dataset" registers differently than "the people with the app."

**Cost:** ~10 hours of prep — anonymization, schema docs, repo README, post timing.

**Bail criterion:** one shot. Either it lands on the front page or it doesn't. If it doesn't, post once to r/dataisbeautiful and r/datasets and move on.

**Recommendation:** ✅ Execute by 2026-07-13 as a 90-day reassessment hard milestone.

### CB-3 — r/dataisbeautiful Posts

**What:** Periodic data visualizations posted to r/dataisbeautiful (21M+ subscribers). "Heatmap of fan-rated fights, 2015-2025." "The 50 most-loved fights of the decade according to 60,000+ ratings."

**Why it works:** r/dataisbeautiful upvotes things that *look* beautiful AND have interesting data. We have both. Subreddit has cross-vertical reach far beyond MMA — civilians who'd never normally see a combat sports app.

**Cost:** Same Canva-template muscle as the Hype Index graphics. Marginal cost zero.

**Bail criterion:** post 3 over 90 days. If none hit top-50 of the day, deprioritize.

**Recommendation:** ✅ One post per month, June-August.

### CB-4 — YouTube Auto-Generated Shorts

**What:** Take every Twitter Hype Index graphic and convert to a 15-second vertical video — same data, animated, AI-voiced. Auto-publish to YouTube Shorts + IG Reels + TikTok.

**Why it works:** Same content, four distribution channels. Cost: ~$0 incremental beyond initial automation setup. YouTube Shorts is undermarketed in 2026 (everyone moved to TikTok); MMA Shorts has lower competition than MMA TikTok.

**Cost:** ~15 hours to build the automation pipeline. ~5 min/week to review.

**Bail criterion:** if after 30 days no Short crosses 1,000 views, kill the channel.

**Recommendation:** ✅ Build automation in June, run July onward.

### CB-5 — MMA Substack Writer Partnerships

**What:** Find 10 MMA Substack/newsletter writers. Offer them a monthly "data drop" — pre-formatted stats and visualizations they can publish in their newsletter, with citation to Good Fights.

**Why it works:** Each newsletter has hundreds-to-thousands of engaged combat sports fans. Each citation = brand impression + backlink. Writers love free content that fills their editorial calendar. Win-win.

**Cost:** ~3 hours initial outreach + 1 hour/month producing the drop.

**Bail criterion:** if after 3 months no writer has actually published a drop, retire.

**Recommendation:** ✅ Outreach in July. Async, low-touch.

### CB-6 — Discord Bot for Combat Sports Servers

**What:** Slash-command bot for Discord. `/hype UFC328` returns the hype index. `/sleeper` returns the highest-hype non-main fight on the next card. Server admins install it.

**Why it works:** Combat sports Discord servers are huge — top 5-10 have 50,000+ members each. Bots get embedded once and live forever. Every `/hype` invocation is a brand impression.

**Cost:** ~20 hours to build initially. ~$0/mo to run.

**Bail criterion:** if after 30 days no server has the bot installed, deprioritize.

**Recommendation:** ⏸ Defer to post-90-day if time. Otherwise nice-to-have.

### CB-7 — Annual "GOOD FIGHTS Fight of the Year" Awards

**What:** End-of-year community-voted awards based on aggregate ratings. Categories: Fight of the Year, Upset of the Year, Most Overrated Card, Sleeper of the Year. Press release. Submission to MMA media outlets.

**Why it works:** Awards become tradition. After year 2 they ARE the conversation in late December. Press loves a year-end peg.

**Cost:** ~5 hours to design, run programmatically off the dataset.

**Bail criterion:** none — this is a heritage move. Run it whether or not it pops year one.

**Recommendation:** ✅ Run December 2026, leveraging the data we already have.

### Bets we're consciously NOT making

- ❌ TikTok primary channel — saturation + Mike-must-talk friction. Shorts (CB-4) covers it sideways.
- ❌ Cold DMs to creators / fighters — extrovert tax, low success rate
- ❌ Live streaming / live Spaces — extrovert tax
- ❌ Paid PR firm — wrong stage, too expensive
- ❌ Twitter Spaces hosting — extrovert tax
- ❌ Sponsoring podcasts (yet) — defer until revenue or ad-spend budget grows

---

## DISTRIBUTION MECHANICS — IN-APP
### What changes in the app unlock distribution

Separate from System 1-5 (which run outside the app). These live INSIDE.

### DM-1 — Notification opt-in optimization

**Today:** unknown what % of installs opt into push notifications. This is THE killer feature; without push opt-in, the fight-night-moment thesis breaks.

**Fix:** instrument PostHog to measure current opt-in. If <70%, A/B test the prompt — timing, copy, when in the flow. Likely 10-15% lift available.

**Build:** 4-6 hours.

### DM-2 — Referral mechanic (small)

**What:** Tiny in-app "invite a friend" button on the profile screen. Shares an install link with UTM tagging.

**Why:** Combat sports is a social hobby. Friends watch fights together. The mechanic exists in zero competing apps.

**Build:** 3-5 hours.

### DM-3 — App Store Optimization (ASO) sweep

**What:** AI-driven keyword research, A/B test screenshots and preview video in Play Console + App Store Connect. Test schedule-led vs hype-led vs ratings-led store copy.

**Why:** Free installs from store search. ASO is the single highest-ROI marketing activity for mobile apps, and we've never done a deliberate pass.

**Build:** 4-6 hours of work, then ongoing iteration.

### Summary — DM priorities

| Priority | Mechanic | Hours | Why |
|---|---|---|---|
| 1 | DM-3 ASO sweep | 4-6 | Highest free-install ROI in mobile |
| 2 | DM-1 Notification opt-in test | 4-6 | Unlocks retention engine |
| 3 | DM-2 Referral button | 3-5 | Social vector for combat sports |

---

## WEEKLY CADENCE — WHAT HAPPENS EVERY WEEK

```
MONDAY MORNING (45 min, Mike + Claude session)
├─ Claude: pull last 7 days metrics from PostHog + DB
├─ Claude: write attribution report — installs by source, MAU change, retention cohort
├─ Claude: propose this week's content plan
├─ Mike: review, adjust, approve
└─ Output: this week's content backlog in docs/marketing/weekly/YYYY-WW.md

TUE–SAT (10 min/day, Mike alone)
├─ Pick variant from Claude's drafted posts
└─ Hit publish

SUNDAY (30 min, Mike + Claude)
├─ If fight week: write retrospective with actual community rating data
├─ Log results from the week
└─ Set Monday's metrics pull

EVERY 2 WEEKS
├─ Momentum dashboard check (per existing 90-day plan)
└─ Attribution audit — did every spend produce a measurable outcome?

EVERY MONTH (1st)
├─ Press hook briefing (System 3)
├─ Legacy drip email (System 5, when active)
└─ Acquisition-readiness dashboard refresh
```

---

## ATTRIBUTION-FIRST PRINCIPLE (THE NON-NEGOTIABLE)

Every action this plan generates has a clean answer to *"did this work?"*:

- Every ad campaign has UTM + a control week comparison
- Every content post has a unique URL or hashtag we can search
- Every email has open/click tracking via Resend
- Every press hit is tied to a referral spike OR a branded-search uptick in Search Console

The 2026-05-13 attribution gap was the wake-up call. **The plan does not move forward without solving it.** No system 2-5 spend or expansion happens until System 1 is operational.

---

## SCALING DECISION TREE

When evaluating a tactic/campaign result:

```
Did it produce a clear signal (≥2x baseline, attributable)?

YES → Re-run next fight week, 2x budget. Document the pattern.
NO  → Try once more, change ONE variable. If still no signal, retire it.
AMBIGUOUS → Attribution problem. Fix the spine. Don't iterate yet.
```

**Default disposition:** start small, prove signal, scale. Never scale before signal.

---

## TOOLING STACK

| Tool | Role | Cost |
|---|---|---|
| **Claude (this assistant)** | Drafting, analysis, briefings | $0 incremental (existing sub) |
| **PostHog Mobile SDK** | First-open + session + funnel events | $0 (free tier, ~1M events/mo) |
| **Resend Broadcasts** | Legacy drip emails | Existing |
| **Canva** | Graphic templates | Free tier |
| **Brave Search API** | Press monitoring (System 3) | ~$0 at scale |
| **GitHub Actions** | Weekly cron — metric pulls, press scans | Free |
| **`packages/backend/scripts/`** | DB extraction scripts | Existing |

**Estimated incremental monthly cost beyond current setup:** $0–$5.

---

## 90-DAY MILESTONES — OVERLAID ON EXISTING PLAN

| Date | Milestone | System |
|---|---|---|
| **2026-05-13** | Plan adopted (today) | — |
| **2026-05-18** | UTM + install referrer live | 1 |
| **2026-05-18** | Control Week #1 begins | 1 |
| **2026-05-24** | Control Week #1 ends — establish organic baseline | 1 |
| **2026-05-31** | Hype Index Engine running ≥3 posts/week | 2 |
| **2026-05-31** | First 90-day reassessment with clean numbers | All |
| **2026-06-07** | PostHog mobile live before White House card | 1 |
| **2026-06-14** | UFC White House — full system test | All |
| **2026-06-21** | First press hook briefing produced & first pitch sent | 3 |
| **2026-06-30** | First legacy drip email sent | 5 |
| **2026-07-13** | 90-day reassessment, attribution-rich data in hand | All |
| **2026-07-14** | SEO Landing System build begins (deferred until now) | 4 |

---

## THE ACQUISITION OVERLAY

Every system feeds the buyer narrative as much as it feeds growth. The mapping:

| System | Pillar served | Artifact produced |
|---|---|---|
| 1. Attribution | Pillar 3 (founder/AI story) | "Marketing ROI is measured" line in deck |
| 2. Hype Index | Pillar 1 (dataset moat) | Recognizable brand asset ("Good Fights Hype Index") |
| 3. Press Hooks | Pillar 1 + Pillar 3 | Press coverage citing the dataset |
| 4. SEO Landing | Pillar 1 (depth visible) | Indexable proof of dataset breadth |
| 5. Legacy Drip | Pillar 1 + audience | Active mailing list (2k+ engaged) |

When the term sheet conversation starts, the artifacts produced by these systems are what fills the deck.

---

## WHEN IT FAILS

This plan is not optimism. Some systems will underperform. Decision rules:

- **Hype Index Engine:** if after 4 fight weeks (~5 weeks) total impressions and click-throughs are not above baseline, retire or pivot the format. Default disposition: keep going — Twitter compounds slow.
- **Press Hooks:** if 3 pitch rounds produce zero hits, change the angle from "data analysis" to "fighter career arcs" (more narrative).
- **SEO Landing:** if pages don't index within 30 days, problem is technical, not strategic.
- **Legacy Drip:** if open rates drop below 15%, list is fatigued — pause, change cadence.

Failure is data per the 90-day plan. The point of attribution is making failure cheap to diagnose.

---

## "IMPOSSIBLE TO FAIL" — WHY THIS PLAN HAS REDUNDANCY

No plan is literally impossible to fail. But this plan is structured to have **multiple independent shots on goal**, each cheap to try, each with a clear bail criterion. Some math:

- **5 Systems** (Attribution, Hype Engine, Press Hooks, Long-tail, Legacy Drip)
- **5 Product Changes** in the catalog (Share Card, Wrapped, Embed, Profiles, Funnel)
- **7 Creative Bets** (Podcast, HN launch, r/dataisbeautiful, Shorts, Substack, Discord, Awards)
- **3 Distribution Mechanics** (ASO, Notifications, Referral)

= **20 independent levers**, each individually cheap, none catastrophic if it fails.

Expected hit rate: 3-5 of 20 will produce clear repeatable signal. That's enough to compound the growth curve.

The plan fails completely only if attribution stays broken — which is why System 1 is the non-negotiable foundation.

---

## ONE-PAGE OPERATING SUMMARY

**The bet:** solo dev × AI can outproduce a 4-person marketing team if the dataset is the engine and attribution is the discipline.

**The constraint:** $100/mo, no extrovert tax, written/async only.

**The five systems:** Attribution Spine, Hype Index Engine, Press Hooks, Long-tail Capture, Legacy Drip.

**The product changes (committed):** Share Card Generator, Install-to-rating funnel, Embed Widget, Wrapped (Dec launch).

**The creative bets (live):** AI-narrated Hype Index podcast, HN launch, r/dataisbeautiful posts, auto-generated Shorts, Substack partnerships, annual Awards.

**The non-negotiable:** every dollar attributed. No spend scale without proof.

**The weekly rhythm:** Monday briefing, Tue–Sat publish, Sunday retrospective.

**The horizon:** the 90-day plan is the experiment. This plan is the operating system that survives it.

---

## ACTION #1 — TODAY

The single highest-leverage thing to do today, before any other system spins up:

> **Add a UTM parameter to the legacy `fightingtomatoes.com` → app store redirect, so the next Sunday-morning install spike is measurable.**

That one change converts the biggest source of attribution noise — legacy redirect traffic — into a clean signal, immediately, for free. Every future ad campaign comparison gets cleaner the moment this lands.

Want me to find where that redirect is configured and propose the change?

---

*Built for GOOD FIGHTS — May 2026. The era of unmeasured spend ends here.*
