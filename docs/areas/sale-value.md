# Sale Value — Long-Horizon Acquisition Thinking

> **What this doc is.** Open-thinking mode for building the value of Good Fights
> as an acquirable asset, and for selling it when the time comes. **Not** a
> workstream with a checklist. **Not** a plan to follow. It's persistent context
> so any session can pick up the conversation without re-educating.
>
> Every session reassesses and replans. Plan evolves. Don't lock anything in.

---

## How to use this doc

When Mike says "let's talk about building the sale value", "sale session", or
"selling the app":

1. Load this doc.
2. Open with current state (what's changed since the last entry).
3. Let Mike lead the reassessment — don't push a plan.
4. Update this doc when the framework shifts or new insights land.
5. Save new roadmap items as project memories; add pointers here.
6. Honesty over optimism. Push back when claims overreach.

---

## Current state (as of 2026-05-20)

- **Users**: ~200 active, 2,000 total (mostly migrated legacy from
  fightingtomatoes.com)
- **Goal**: 100K users × 5+ avg fighter follows
- **Sale framing**: one-shot sale, timed to a combat-sports sector swell
  (not necessarily fighter-driven). Floor 12-18mo, ceiling 24+mo. 60-day
  path to term sheet when swell hits.
- **Reality check**: at 200 users, almost nothing on this doc is executable
  today. The point is to shape the app's data surface NOW so assets exist
  with history when scale lands. Engagement timestamps can't be backfilled.

---

## Posture

- **Honesty over optimism.** 200 users is small. Don't dress it up.
- **Shape decisions now, gate execution.** Most items here unlock past 25K
  or 100K MAU. Build the surface; defer the productization.
- **Connect dots, don't silo.** This conversation reads decisions made in
  other workstreams (marketing, AI enrichment, follow-fighter, rewarding-
  users, live trackers) through the acquirer lens. It doesn't replace them.
- **Plan keeps evolving.** Treat every session as a reassessment. New
  insights can rewrite the framework — don't defend old positions for
  consistency.

---

## The 6 data assets

The portfolio of potentially-sellable data the app produces:

1. **Interest graph** — fighter follows with `followedAt` timestamps. The
   timestamp column is load-bearing for the longitudinal-interest narrative.
2. **Ratings density** — 1-10 ratings of completed fights. Letterboxd-style
   verdict data.
3. **Hype scores** — pre-fight 1-10 excitement from engaged users.
4. **Prediction calibration** — winner / method / round predictions, scored
   against outcomes. **Currently NOT in the UI** — schema columns exist
   (`FightPrediction.predictedWinner`, `predictedMethod`, `predictedRound`,
   `accuracyScore`) but the feature was removed in 2026.
5. **Taste graph** — AI-enriched fight tags × user ratings = preference
   profile per user / per cohort.
6. **Comment corpus** — user comments on fights and fighters. Sport-specific
   natural-language ground truth.

Note: things like hype trajectory, geographic taste deltas, and cross-org
follow overlap are **slicing dimensions** on these six, not separate assets.
Don't pad the list.

---

## Buyer landscape — what each type actually wants

Common across all buyers: data that's hard to replicate, has a verifiable
signal, comes with users they can't reach otherwise, and ideally generates
recurring revenue.

Specific drivers per type:

| Buyer type | Examples | What they actually want |
|---|---|---|
| **Sportsbooks** | DraftKings, FanDuel, ESPN BET, BetMGM | **Users + edge-as-proof.** Not primarily a data feed. Prediction calibration matters as evidence your users are sharp/engaged (= high-LTV bettor candidates), not as a licensed product. |
| **Streamers** | DAZN, ESPN+, UFC Fight Pass, Netflix | Subscribers they can't reach + programming intelligence (which fights/styles drive engagement). Taste graph is most valuable to them but only bundled into a full acquisition. |
| **Promotions** | TKO/UFC, PFL, ONE, Matchroom, BKFC | First-party fan ID, regional reach data, cross-org overlap (e.g. UFC fans who follow BKFC names = poach targets). |
| **AI labs** | Google, OpenAI, Anthropic | Training corpus. Comment corpus specifically. Sport-specific natural-language is rare. |
| **Media** | Bleacher Report, MMA Fighting, The Athletic, Bloody Elbow | Audience + editorial trust signal. Ratings density is what they value, but they pay the least. |

---

## Comp anchors (research May 2026)

Real deals, real numbers. Each row anchors the financial expectation for
that asset type.

| Asset | Tier | Anchor comp |
|---|---|---|
| **Prediction calibration** | HIGH | Kalshi $22B valuation, ~$260M+ 2025 revenue; Polymarket $9B / $22.88B 2025 trading volume |
| **Comment corpus** | HIGH | Reddit $203M aggregate AI licensing (Google ~$60M/yr + OpenAI ~$70M/yr) |
| **Interest graph** | MEDIUM-HIGH | NYT/The Athletic $550M for 1M paying fans; DraftKings LTV ~$2,500/converted customer |
| **Ratings density** | MEDIUM | Letterboxd ~$50-60M at 10M members = **~$5/member ceiling**; consumer-media multiple, not data multiple |
| **Taste graph** | MEDIUM | Netflix internal $1B/yr retention impact; never licensed externally |
| **Hype scores** | LOW | No standalone precedent; derivative of interest + ratings |

**Sources** (full citations in research thread, May 2026): SEC filings,
TechCrunch, Variety, PYMNTS, Stock Analysis, SBC News, Bloomberg,
Axios, Sportico, BuzzFeed News.

---

## Key reframes (corrections from research)

- **Sportsbooks buy users, not data feeds.** Prediction calibration matters
  as proof your users are valuable, not as a licensable product. Earlier
  framing of "license the prediction feed" was wrong; the actual deal is
  user acquisition with the data as strategic rationale.
- **Predictions were removed from the UI** (2026). Schema columns still
  exist. This is a sale-value-impacting product decision worth re-evaluating
  once the user base grows — re-add to main UI, build a power-user "Pro
  Picks" mode, or a separate web surface. **Defer.**
- **Ratings density ≠ user count.** Both matter, separately. User count is
  the prerequisite (without users, no ratings). Density per fight is what
  makes a rating an asset vs noise.
- **Letterboxd-aesthetic ≠ Letterboxd-pricing.** The Letterboxd-for-fights
  framing is a great product anchor but a terrible sale anchor — caps the
  story at $5/member. The user base unlocks much higher-multiple narratives
  (sportsbook user-acquisition, streamer programming intelligence).
- **Comment corpus is a sleeper asset.** AI labs weren't in the original
  buyer landscape; the Reddit deals make them real.
- **Hype trajectory was oversold.** Most fights, hype is stable from booking
  to walkout. Trajectory only matters for outlier fights (viral pre-fight
  moments, late-notice replacements). At best a slicing dimension, not its
  own asset.

---

## What the app does today

- Rate completed fights 1-10
- Hype upcoming fights 1-10
- Follow fighters (with `followedAt` timestamps preserved — load-bearing
  for the sale narrative; never derive)
- Comment on fights and fighters
- AI-tag fights by style/story (in progress, `docs/areas/ai-enrichment.md`)
- Fan DNA personality labels per user
- Live trackers for ~14 promotions (UFC, ONE, PFL, BKFC, Matchroom, etc.)
- Notifications tied to fight events
- Spoiler-free mode

---

## What the app doesn't do (relative to buyers)

- **No winner/method/round predictions in UI.** The #1 asset class is
  missing. Schema columns exist; product surface doesn't.
- **No verified prediction accuracy scoring** or leaderboard.
- **No backtest of hype scores** against real-world outcomes
  (PPV, viewership, line movement, Google Trends).
- **No B2B revenue, no API, no licensed feed.** All asset multiples step
  up with recurring revenue attached.
- **No scale on interest graph.** ~200 active vs 100K+ needed for the
  Athletic-style narrative.
- **No international diversity.** US/Canada heavy; streamers like DAZN
  and ONE pay more for global audiences.
- **No public data narrative.** No press hits citing Good Fights data,
  no published reports — buyers don't acquire what they haven't heard of.
- **Comment corpus untreated as an asset.** Just exists; no curation,
  no protection, no narrative.

---

## Buyer-aware narrative artifacts

Things to publish *about* the data — make Good Fights legible to corp dev
people doing 30-minute industry scans. None are the product; all are the
story-of-the-product.

- **Quarterly "Hype Index" PDF.** "Good Fights' fans rated UFC X the
  most-anticipated card of Q2." Press picks it up. Indexable artifact.
- **Annual "State of Combat Sports Fandom" report.** Charts, regional
  breakdowns, taste shifts. Media-citable.
- **Dataset one-pager.** Volumes, coverage, promotions, methodology.
  Hand-off material for first buyer contact.
- **Methodology / trust doc.** How hype is computed, how predictions are
  scored, what the backtest shows. Diligence-ready.
- **Press hits.** MMA Fighting, Bloody Elbow, The Athletic citing
  Good Fights data. Each is a credibility artifact.
- **Founder narrative deck.** 10 slides where the data assets are central.
  Drafted now, refined yearly.

---

## Roadmap items

Each item below is gated on growth. None execute at 200 users — the value
of having them on the roadmap is in shaping the data surface now.

- **[Hype-vs-outcomes backtest](../../packages/backend/...)** — weekend
  project, validate or kill the predictive-signal narrative. Memory:
  `project_hype_backtest_roadmap.md`. Defer until hype dataset is dense
  enough (~few hundred completed fights with hype scores).
- **[B2B data API](../../packages/backend/...)** — recurring revenue line
  is the multiplier. Memory: `project_b2b_api_roadmap.md`. Gated on ~100K
  users; start counterparty conversations at ~25K MAU.
- More will be added as the conversation evolves.

---

## Open questions (intentionally unresolved)

These stay open across sessions. The point is to monitor, not decide.

- **Most plausible buyer type.** Currently: probably a sportsbook (user-
  acquisition story) or a promotion (first-party fan ID). Streamers are
  third. AI labs are a sleeper wildcard. Revisit as the landscape shifts.
- **Re-introduce predictions to the product.** Open product question with
  sale-value implications. Defer until user base supports it.
- **Geographic expansion.** International users make us more attractive to
  global buyers (DAZN, ONE). Currently not prioritized; revisit.
- **When to commission a formal valuation.** $5-15K externally. Don't pay
  for one until ~6 months pre-sale. Premature today.
- **B2B counterparty (first paying customer).** Even a $5K/yr media-outlet
  contract changes the narrative. Worth scoping when MAU > 25K.

---

## Related context

- **[Sale timing — wait for sector upswell](../../memory/project_sale_timing_upswell.md)** — one-shot, timed to swell, 12-18mo floor
- **[Sector Swell Monitor](../../memory/project_sector_swell_monitor.md)** — monthly briefing on timing landscape, build pending
- **[Follow-fighter workstream](follow-fighter.md)** — feeds the interest graph asset
- **[AI enrichment workstream](ai-enrichment.md)** — feeds the taste graph asset
- **[Rewarding users workstream](rewarding-users.md)** — feeds engagement depth → ratings density
- **[Live trackers workstream](live-trackers.md)** — feeds promotion coverage → first-party-fan story
- **[AI Marketing Plan 2026](../../GOOD_FIGHTS_AI_MARKETING_PLAN_2026.md)** — feeds awareness → buyer recognition
- **[Two dataset fields that lie](../../memory/lesson_dataset_aggregates_dishonest.md)** — `Event.totalRatings` is dead; legacy `FightRating.createdAt` is import-time. Matters for any acquisition-facing metric.

---

## Changelog

- **2026-05-20** — Initial doc. Framework, buyer map, comp anchors,
  reframes captured from research thread. Two roadmap items seeded
  (hype backtest, B2B API).
