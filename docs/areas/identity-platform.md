# Identity Platform — From Aggregator to Fan Record

> **What this doc is.** The strategic thesis that Good Fights' center of gravity
> should be the *fan*, not the *fight*. Open-thinking mode, like `sale-value.md`
> — a frame to shape decisions, not a checklist to execute. Born from the
> 2026-05-31 conversation on user psychology.
>
> **One-line thesis:** *Rotten Tomatoes is about the object. Letterboxd is about
> the subject.* Same data — scores on titles — opposite center of gravity. We
> want to be the subject platform.

---

## The pivot

The app was envisioned as **Rotten Tomatoes for fights**: hype/rate fights, the
value is the aggregate score, the fight is the hero. The reframe is **Letterboxd
/ Strava / Last.fm for fight fans**: every fight you touch leaves a mark on your
permanent fan record, and the app reflects that record back as *who you are*.

The aggregate score doesn't go away — it gets **demoted to a byproduct**. Users
still hype and rate exactly as before. What changes is what the app does with it:
instead of rolling each tap into a crowd average and forgetting the user, it
deposits it into their permanent record and mirrors it back.

**Why this is the bigger business:** an aggregator has zero switching cost (your
vote disappears into an average; the site has no reason to remember you). An
identity platform has a *compounding* one — the longer someone records their
fandom, the more leaving costs them, because the record *is* them now. That's a
retention moat the aggregator model can't produce.

---

## Why fans actually engage (the psychology underneath)

The 2026-05-31 discussion stress-tested the hypothesis "people rate to give
credit to fighters." Verdict: real but secondary. In a fight app you rate the
*fight*, not the *fighter*, and most 5★ ratings mean "I was thrilled watching
this," not "this fighter deserves credit." The actual drivers, in order:

1. **Rendering a verdict.** Fight fans are judges by nature — scorecards, "who
   won round 3," hot-take culture. Rating is the lowest-friction verdict. *This
   is the engine.*
2. **Fan identity / "I'm a real one."** A rating history is proof of fandom. The
   count is a flex, the way a Letterboxd film count is.
3. **Closure.** You gave 3+ hours to a card; the rating closes the loop (Strava's
   "finish the run").
4. **Witness / "I was there."** Being on record for a moment before the takes
   flood in.

"Giving credit" is the *emotional flavor* of #1/#2, not the mechanism. Build for
verdict + identity, not for tribute.

---

## Core ideas to hold onto

1. **Don't abandon hype/ratings — demote the aggregate to a byproduct.** The RT
   layer survives as the acquisition hook; identity is the retention layer.
2. **Make the user the hero of the screen.** The highest-value surface becomes
   the *profile* — history, taste, accuracy, tenure. Fights are the raw material.
3. **Falsifiable identity is the stickiest kind.** Taste is soft; *predictions*
   are hard — right or wrong, on record forever. A self-scoring pick history
   ("63% picker, 71% on finishes") is the richest identity artifact *and* an
   argument-starter. (Predictions exist in schema, were pulled from UI — see
   `sale-value.md`. This thesis is the strongest reason to re-introduce them.)
4. **Identity platforms are colder at the start, not warmer.** An empty diary is
   sadder than a thin aggregate. The cold-start problem (already known from Fan
   DNA) gets *worse* here. Onboarding must seed identity fast — "rate 10 classic
   fights to start your record," surface Fan DNA after 5 ratings, not 50.
5. **No leaderboards is the right constraint and it forces the better design.**
   Reframe every competitive metric as *self-knowledge*, not standing: "you're a
   63% picker" (identity), never "#47 of 200" (leaderboard). Strava compares you
   to your past self, not a podium. Consistent with the
   [rewarding-users](rewarding-users.md) "no leaderboards, no prizes" rule.

---

## The three-layer model

Every feature either **captures** a mark, **reflects** the record, or **projects**
the identity. If it does none of those, it's not part of this product.

### Capture — the artifacts of fight fandom

Two arms: **universal** (every fight, low friction) and **editorial** (curated,
high-signal, rare — see Controversy Polls below).

- **Hype** (have it) — anticipation on record before the bell.
- **Ratings** (have it) — the verdict after.
- **Predictions** — winner / method / round, locked before the fight. The
  accountability engine. *(Schema exists; UI removed. Re-introduce.)*
- **Round-by-round scorecards** — huge in boxing/MMA culture, badly served by
  apps. "10-9 Volk" is identity; your card vs. the judges' is argument fuel.
- **Controversy polls** (NEW — see below) — editorial, per-fight, on-demand.
- **"I was there" / "watched live"** — attendance + live-watch flags. Witness
  identity.
- **Reviews/comments** (have it) — your voice on record.
- **Lists & tier lists** — Fight of the Year ballots, personal canon, S/A/B
  tiers. Identity in pure form, inherently shareable.

### Reflect — mirror the record back as identity

- **Fan DNA** (have it) — the centerpiece, not a side feature. Lean harder.
- **Prediction accuracy stat line** — overall %, by method/division/org. A
  baseball-card stat block for *you*.
- **Taste deltas** — "you rate decisions 1.2★ below the crowd," "you've never
  given 5★ to a card that went the distance." The Last.fm / Wrapped move; the
  most shareable thing we can build.
- **Your Fight Year** — annual wrapped: fights watched, hours, best card, your
  FOTY, your accuracy, archetype shift. Posted once a year → free acquisition.
- **Tenure / "fan since"** — quiet status that can't be bought, only accrued.
- **Streaks done right** — "47 UFC cards, none missed." A record, never a nag.

### Project — let the identity travel

- **The shareable fan card** — public profile as one image (archetype, accuracy,
  top-rated fights, tenure). The install funnel.
- **Follow other *fans*, not just fighters** — a taste-based social graph. Turns
  a tool into a community; where long-term value compounds.
- **Take-vs-crowd cards** — "I gave this robbery 2★, the crowd gave 4★." Built to
  be argued with → built to spread.
- **Critic credibility** — surface fans whose hype best predicted great fights.
  Reputation as *identity*, never a ranked board.

---

## Controversy Polls (Mike's idea, 2026-05-31)

**The idea:** an admin-authored, per-fight poll surfaced only when a fight has a
genuine dispute — *"Was that an early stoppage?"*, *"Should he have been
penalized for the eye pokes?"*, *"Robbery or fair decision?"* Added from the
admin panel on a fight-by-fight basis. The user's vote becomes part of their
permanent record so they can remember **what they thought the first time they
watched it.**

**Why this slots in perfectly:**

- It's the **editorial arm** of the capture layer. Where hype/ratings/predictions
  are universal, polls are curated and *rare*. That rarity is the feature — it
  sidesteps the "six verbs is a chore" risk (see Risks) because a poll only
  appears when there's real controversy worth a verdict.
- It's a **falsifiable, in-the-moment judgment** — exactly the verdict-rendering
  psychology that drives engagement (#1 above), captured at its hottest moment.
- It's a **memory hook**, which is the diary spine made literal: *"When I first
  watched this, I called it an early stoppage."*
- It's **argument fuel that travels**: "73% of Good Fights fans said early
  stoppage" is a shareable, press-citable artifact — ties into the
  [editorial/blog growth engine](../areas/) and the buyer-facing narrative.

**Design principles (carry the same DNA as hype/ratings):**

1. **Lock the vote** once the user casts it (or at fight settle). The whole value
   is "what I thought *the first time*" — a re-vote destroys that. Mirrors the
   hype-lock-at-walkout principle.
2. **Timestamp it and never derive** (`votedAt`). Load-bearing for the
   "in-the-moment witness" narrative and the sale (same rule as `followedAt`).
3. **Editorial curation = quality control.** Polls only exist where an admin
   judged there's genuine controversy. No poll spam; high signal per poll.
4. **Generic, reusable schema.** A `FightPoll` entity attached to a `Fight` with
   an admin-authored question + N options + locked user votes. Reusable beyond
   controversy ("Fight of the Night?", "Rematch worthy?", "Did the right fighter
   win?"). Build it once, use it for any per-fight binary/multi-choice verdict.
5. **Surface in closure + profile.** Show crowd split after voting (closure
   payoff); collect a user's poll calls on their profile ("Your controversy
   verdicts") as another facet of the fan record.

**Sale-value angle:** a new micro-asset — *curated controversy sentiment*.
Sport-specific ground-truth labels on disputed moments (early stoppage Y/N, fair
decision Y/N) are exactly the kind of human-judgment signal that's hard to
replicate and interesting to AI labs and promotions. Feeds the comment-corpus /
taste-graph story in `sale-value.md`.

**Open questions:**

- When does a poll open/close? (Lean: opens when admin adds it post-fight, never
  auto-closes — late watchers still vote, but each vote is timestamped so
  "in-the-moment" cohorts stay separable.)
- Spoiler interaction — a controversy poll reveals there *was* controversy. Must
  respect Spoiler-Free Mode (hide poll until the user has rated/revealed).
- Do polls feed Fan DNA traits? (e.g. "Contrarian on stoppages.") Probably yes,
  eventually — another reflect-layer signal.

---

## The spine

> **Every fight you touch leaves a mark on your permanent fan record — and the
> app reflects that record back as who you are.**

Hype = the mark before. Prediction = your call on record. Scorecard/rating/poll =
your verdict. Comment = your voice. Over a season it composes into an identity
you couldn't fake and don't want to abandon.

Slogan (sole, adopted 2026-05-31): **"You, as a fight fan."** Pair with the name —
**"Good Fights. You, as a fight fan."** The prior utility slogan *"Never miss a
good fight."* was **retired** with the pivot. Role note: the slogan is a
positioning statement, not a first-screen instruction (a fragment implying a
predicate), so hero it on brand surfaces but keep the concrete action beside it in
empty/onboarding states — and the "what is this app?" acquisition job now lives in
the store subtitle / body copy, not a slogan. See [[project_good_fights_slogan]].

---

## Risks / honest constraints

- **Don't fragment the core loop.** Hype + rate + predict + score + list + review
  + poll is too many verbs → a chore (the Duolingo anti-pattern the
  [rewarding-users](rewarding-users.md) doc warns against). Pick a spine verb to
  add next (likely **predict** — it powers accuracy-identity) and add slowly.
  Controversy polls dodge this because they're *rare and editorial*, not a
  per-fight obligation.
- **Cold start is worse, not better.** Seed identity on day one or the empty diary
  kills first-run retention.
- **This is a retention thesis, not an acquisition thesis.** An empty diary pulls
  no new users. The RT-style utility hook stays the front door; identity keeps
  people once they're in. Don't let the shiny vision cannibalize the funnel.
- **Keep the data honest.** The whole asset value rests on integrity — see
  [Two dataset fields that lie](../../memory/lesson_dataset_aggregates_dishonest.md).

---

## Why this is the better *sale*

A buyer pays little for an aggregate score (commodity; ESPN can reproduce it).
A buyer pays for **a proprietary behavioral graph of fight fans** — taste,
accuracy, tenure, social trust edges, controversy verdicts. The identity model
generates exactly that as a byproduct of its core loop. RT-mode produces scores;
identity-mode produces fans. *We're selling fans.* Every capture feature thickens
the asset; every reflect feature deepens retention so the asset keeps growing.
See `sale-value.md` for the asset/comp framework this feeds.

---

## Validate before building

Before committing, check data you already have: do retained power users come back
for the **aggregate** (checking scores) or for **their own history**
(revisiting profile/ratings)? If profile/history engagement is already
disproportionate among retained users, the identity thesis is empirically live.
If nobody touches their own history, there's a sequencing problem to solve first.

---

## The Clarity Litmus Test (load-bearing constraint)

Predictions were originally removed (early build) for a deliberate reason, not by
accident: Mike opened several competitor apps, found them confusing — too many
features, no focus, couldn't tell what the app was *for* — and stripped Good
Fights down to a single clear purpose: **hype and rate fights, see which ones are
good.** The governing test:

> **Can a brand-new user open this screen and immediately know what they're
> looking at?**

This is non-negotiable and it constrains the entire identity pivot. The
resolution (revised 2026-05-31):

- **Identity is the positioning headline, not a deep layer.** The focus the
  litmus test protects is *no longer* "rate fights" — it's **"who you are as a
  fight fan."** Clarity is about *legibility*, not about which thing is primary.
  The app states its identity purpose on the first screen. (Earlier framing —
  "clarity governs the front door, identity governs the depth" — was too timid;
  it buried the marquee. Corrected.)
- **Empty state is critical-path, not polish.** A new user has no identity yet,
  so the first-run/empty state must make the identity promise legible *while
  empty*: show what fans here become (Hot Take Artist, Globetrotter, Skeptic…),
  then "start rating to find out who you are." Onboarding "rate the classics"
  (Sprint 1 Track C) is the *spine* of this, not a cold-start patch — it's the
  fastest path from empty to a legible identity, in minutes.
- **Consolidate, don't layer.** Feature depth does **not** progressively
  disclose. New capability folds into *existing moments* instead of adding
  screens/tabs/depth. Concretely: **hype and winner prediction share one modal as
  equal-weight peers** — one combined pre-fight *take* (how hyped + who wins),
  neither primary. Net result: **two moments total** — pre-fight (hype + pick)
  and post-fight (rate). Surface count stays flat, a *stronger* clarity guarantee
  than layering (layering only delays the confusion to a deeper screen).
- **The entry gesture stays concrete; the frame becomes identity.** Same gestures
  (hype / pick / rate), reframed as *building your record*, not feeding a
  database of good fights. The ratings don't leave the front — their *meaning*
  changes.
- **The litmus test is a ship gate**, not a vibe — and it applies to the combined
  pre-fight modal. Hype and pick are **co-equal**, not primary/secondary. The
  modal's legible purpose is your **pre-fight take** (excitement + call),
  presented as one coherent act so the two inputs read as a single gesture rather
  than clutter. Both stay quick (1–10 + tap a fighter). The design risk here is
  *incoherence*, not "prediction overshadowing hype" — the old hype-primary
  instinct is a relic of the pre-pivot positioning.

---

## Sprint 1 — Minimum Viable Pivot to Identity-First

**Goal:** Flip the center of gravity so a user *feels* the app is about them — by
making **fan identity the stated positioning** (front-of-app, not a deep layer),
reviving winner predictions *inside the combined pre-fight modal — co-equal with
hype* as the falsifiable spine,
making the profile a fan home-base anchored on one headline stat, and ensuring
both new *and* dormant users hit a non-empty record fast. The Clarity Litmus Test
holds via consolidation (flat surface count) + a critical-path empty state, not
by hiding identity.

**Two findings that shaped the scope:**
1. *Predictions is a revive, not a rebuild.* Dormant prediction UI still lives in
   the mobile tree (`app/activity/predictions.tsx`, `PredictionModal.tsx`,
   `PredictionAccuracyChart.tsx`, `CommunityPredictionsCard.tsx`, pie/bar charts)
   and the `FightPrediction` schema (`predictedWinner/Method/Round/accuracyScore/
   isLocked`) is intact. Mostly rewire + revive the settle logic. *Caveat:* some
   of those components may be hype-framing, not winner-pick — needs a ½-day audit
   to separate.
2. *Cold start is smaller than the warm-base lever.* ~2,000 legacy users already
   have rating records and have simply never seen the identity surface. Revealing
   an existing record beats seeding a new one — and directly tests the thesis.

### Track A — Revive winner predictions (the spine)
- Audit dormant prediction components (½ day) — winner-pick vs hype-framing.
- **Winner only.** No method/round this sprint — binary is easy to score, easy to
  understand, yields the clean identity number ("63% picker").
- Pick flow lives **inside the combined pre-fight modal** (no longer "the hype
  modal") — hype and winner pick are **equal-weight peers** in one take (how
  hyped + who wins), neither subordinate. Both quick (1–10 + tap a fighter). No
  new tab, no new screen. Lock at fight start (`isLocked` exists). *(Open: can a
  user submit one without the other? Lean yes, but present them as one act.)*
- `app/activity/predictions.tsx` is repurposed from an *entry* surface to a
  *reflect* surface (pick history + accuracy). Entry = the hype modal;
  reflection = the profile.
- **Settle job** — the one genuinely new backend piece: on fight completion (hook
  `eventLifecycle`), fill `isCorrectWinner` + roll up per-user accuracy.
- Reveal moment after submit: the existing hype reveal grows a second beat —
  community pick split ("68% picked Jones"), reusing `CommunityPredictionsCard`.
  Respect Spoiler-Free Mode.

### Track B — Profile as identity home-base (reflect / user-as-hero)
- Lead the profile with **one identity stat**: pick accuracy % once enough picks;
  until then the Fan DNA personality type is the hero.
- Mostly reorder + reframe existing surfaces (Fan DNA, Hype vs Outcome, counts —
  all shipped) into a user-first layout. Revive `PredictionAccuracyChart` once the
  settle job runs.

### Track C — Cold start (new users)
- **Onboarding "rate the classics":** 12–15 iconic fights; rate the ones you know
  → instant non-empty record + Fan DNA. (Needs a curated iconic-fights list.)
  Reinforces "this app is about rating fights" — *strengthens* the litmus test.
- Lower Fan DNA threshold so a type surfaces after ~5 ratings.
- New users can pick winners on the nearest upcoming card — stake before history.

### Track D — Warm-base re-engagement (highest ROI)
- One nudge to ~2,000 legacy users: *"You've rated 1,247 fights. Meet your Fan
  DNA →"*, deep-linked to profile/fan-dna. The record already exists; just reveal
  it. Doubles as the thesis test.

### Track E — Instrument (so Sprint 2 can read the thesis)
- PostHog events: `profile_view`, `fan_dna_view`, `prediction_made`,
  `prediction_settle_view`. Closes the validation gap — in 4–8 weeks, answer "do
  retained users come back *for their record*."

### MVP acceptance criteria (done when…)
1. A user can predict a fight's winner; it locks at start; it's scored after.
2. The profile leads with a single identity stat + Fan DNA, user-as-hero layout.
3. A brand-new user finishes onboarding with a non-empty record + Fan DNA type.
4. Dormant users receive one "your record exists" nudge with a working deep link.
5. The profile / fan-dna / prediction funnel is tracked in PostHog.
6. **Every new/changed surface passes the Clarity Litmus Test** — a fresh user
   knows what it's for in ~3 seconds. This gates ship, same weight as the rest.

### Out of scope (Sprint 2+)
Controversy polls (needs admin tooling), method/round predictions, scorecards,
lists/tier-lists, follow-other-fans, shareable fan-card image, full visual profile
redesign.

### Sequencing
Backend settle job + accuracy endpoint → revive pick UI + reveal → profile reorder
+ accuracy card → onboarding classics + DNA threshold → re-engagement push +
PostHog (last two can run parallel).

---

## Related

- [rewarding-users.md](rewarding-users.md) — the workstream that owns identity
  features; idea inventory lives there. This doc is the strategic frame above it.
- [sale-value.md](sale-value.md) — the acquisition lens; identity model thickens
  the 6 data assets.
- [follow-fighter.md](follow-fighter.md) — interest graph, the social-graph seed.
- [ai-enrichment.md](ai-enrichment.md) — taste-graph tags powering reflect-layer.

## Track A build status (2026-06-04) — branch `winner-predictions`, NOT on main

Track A (revive winner predictions) is **in progress on a long-lived branch
`winner-predictions`** that will stay unmerged for several days. Built so far:

- **Capture is live in dev.** Winner pick added to the pre-fight modal as a
  co-equal peer to hype (tap a headshot to crown a winner). Both persist through
  the existing `/prediction` upsert. A community winner-split bar shows on the
  card and (animated) in the modal. Backend exposes `winnerPredictionFighter1/2`
  on the three endpoints that feed `UpcomingFightCard` (`/events`,
  `community.ts` topUpcomingFights, `GET /fights`).
- **No settle job is being built — and that's correct.** The genuinely-new
  backend piece the sprint plan named ("settle job → fill `isCorrectWinner` +
  roll up accuracy") turned out to be **unnecessary**: prediction accuracy is
  already computed **live at read time** (`auth.fastify.ts` `/profile`,
  by-event, global-standing — compare `predictedWinner === fight.winner` on the
  fly, draws/nc excluded). The stored columns `isCorrectWinner` / `accuracyScore`
  / `User.accuracyScore` are **dead scaffolding; nothing writes them.** Live
  compute is the source of truth and auto-corrects when a scraper revises a
  result. A fight-completion hook is only needed for a *notification* ("you went
  4/5"), which is a separate deferred feature — not a prerequisite for the
  accuracy identity number.
- **Reflect is the real remaining work** (Track B): the accuracy stat already
  exists server-side; the profile just needs to surface it and lead with it.

See `docs/daily/2026-06-04.md` for the full build log.

## Changelog

- **2026-06-04** — Track A build started on branch `winner-predictions` (multi-
  day, unmerged). Capture shipped in dev (modal pick + community bars + backend
  fields). Discovered the settle job is unnecessary — accuracy is computed live;
  the `isCorrect*`/`accuracyScore` columns are dead. Remaining: surface the
  accuracy stat on the profile (Track B).
- **2026-05-31** — Initial doc. Aggregator→identity pivot, fan psychology,
  three-layer model, controversy-polls idea, spine, risks, sale payoff.
- **2026-05-31** — Added Clarity Litmus Test (why predictions were removed →
  load-bearing constraint) + Sprint 1 (Minimum Viable Pivot), tracks A–E, MVP
  criteria, out-of-scope, sequencing. Behavioral validation positive but
  directional (24% of hypers close hype→rate loop; 51% of organic raters return
  2+ days; n=167 organic). Predictions = revive (dormant UI + intact schema).
- **2026-05-31 (revised, same session)** — Reframed the constraint after Mike's
  correction: **identity is the positioning headline, not a deep layer** (clarity
  = legibility, not "ratings primary"). **Empty state elevated to critical-path.**
  **Consolidate, don't layer** — hype + winner pick share one combined pre-fight
  *take* modal as **equal-weight peers** (not hype-primary; that instinct is a
  pre-pivot relic) rather than progressive disclosure; two moments total
  (hype+pick, then rate); flat surface count. `predictions.tsx` repurposed
  entry→reflect.
