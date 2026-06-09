# Identity Platform — the "about the user, not the rating" thesis

> **What this doc is.** The source-of-truth for Good Fights' core pivot:
> from a site **about fights and their ratings** (an aggregator) to a site
> **about the user** (an identity platform). Referenced as canonical by
> `sale-value.md`, `rewarding-users.md`, and `follow-fighter.md`. Until now the
> thesis lived only in scattered memories and the margins of `sale-value.md`;
> this consolidates it. **Living doc — update it as the framework sharpens.**

---

## The one-line thesis

**Letterboxd, not Rotten Tomatoes.**

- **Rotten Tomatoes** is an *aggregator*. The product is **the score** — a number
  about the *thing* (the movie, the fight). The user is a vote, anonymous and
  interchangeable. You visit, you read the number, you leave. RT doesn't know you
  and doesn't try to.
- **Letterboxd** is an *identity platform*. The product is **you** — your taste,
  your history, your track record, the version of yourself the app reflects back.
  The ratings are real, but they're **inputs to an identity**, not the output. You
  come back because the app *is your fan diary*, not because you need a score.

Good Fights was built as the Rotten Tomatoes of fights (rate it 1–10, see the
average). The pivot is to become the **Letterboxd of fight fandom**: the place
that knows what kind of fan you are and pays that back to you.

---

## Why pivot (three reasons, in priority order)

1. **Retention.** A score is consumed once and forgotten. An identity compounds —
   every rating, hype, follow, and allegiance deposit makes the app's picture of
   *you* richer, which makes the next visit more rewarding. The app "remembers you,
   reflects you back, and pays off your effort" (see `rewarding-users.md`). That
   loop is what brings people back without nagging them.

2. **Participation.** Aggregator framing has a knowledge barrier ("is my opinion
   right?"). Identity framing has none ("this is who *I* am"). Lowering the barrier
   to contribute is existential while we're small and fighting the cold-start /
   empty-room problem. The clearest example: **allegiance over prediction** (below)
   — rooting needs only a gut, predicting needs expertise.

3. **Sale value.** The thing worth selling is **the fans, not the scores.** An
   aggregate rating is replicable noise; a proprietary, time-stamped behavioral
   graph of *who each fan is and what they love* is not. Every buyer type
   (sportsbooks, promotions, streamers, AI labs) wants **users they can't reach +
   a signal about those users** — not a feed of fight scores. The identity pivot
   *is* the acquisition thesis. See `sale-value.md` → "The 6 data assets."

---

## What changes (and what doesn't)

**The pivot is a reframe, not a teardown.** Ratings, hype, and the aggregate
score don't disappear — they get **demoted from product to ingredient.** The fight
pages still show a community average. But the app's center of gravity moves from
*"here's what fights are worth"* to *"here's who you are as a fan, built from what
you've told us."*

| | Aggregator (old) | Identity (new) |
|---|---|---|
| **Home screen** | Editorial feed of fights & scores | A mirror: "Welcome back, Mike — here's your week" |
| **A rating** | A vote on a fight | A deposit into your taste profile |
| **The payoff** | The community average | Your Fan DNA, your closure loops, your track record |
| **Onboarding** | Drop into a list of fights | Seed a persona, then show the app already knows you |
| **The verb** | "Rate / predict the winner" | "Rooting for / in your corner / who you are" |
| **What we sell** | Ratings density | The fans — a behavioral graph |

**Load-bearing constraints (do not regress):**
- **No leaderboards, no prizes, no gamification.** Identity ≠ competition. Reward
  is *closure + self-recognition*, not points. (Letterboxd/Strava/Last.fm aesthetic;
  anti-Duolingo.) See `rewarding-users.md`.
- **The timestamp is sacred.** `followedAt`, the locked-pre-fight allegiance pick,
  import-time vs. real `createdAt` — the *history* is what makes identity an asset.
  Never derive, never overwrite. See `follow-fighter.md` §"The timestamp is sacred"
  and `memory/lesson_dataset_aggregates_dishonest`.
- **Private by default.** Self-understanding, not public performance.

---

## The exemplar decision: allegiance over prediction (2026-06-08)

The single cleanest application of the thesis to date. The mostly-built winner-pick
feature ships as **"who are you rooting for"** (want-to-win), **not** "who will win"
(predict-the-winner).

- Rooting-for is an **affiliation** (who you are); predicting is a **judgment**
  (what you did once, then it evaporates). *"Allegiance is the Letterboxd verb;
  prediction is the Rotten Tomatoes verb in a fan costume."*
- It captures more users (gut > expertise), retains better (your fighter losing is
  *heartbreak that brings you back*, not *failure that makes you quit*), and yields a
  richer identity signal (a multidimensional allegiance signature vs. one accuracy
  scalar).

Full rationale, the held cost (it demotes prediction calibration — the top
comp-anchored sale asset — judged acceptable at this scale), the "bridge stays
standing" optionality, and the touchpoint-by-touchpoint communication playbook live
in **`sale-value.md` → "Allegiance over prediction (2026-06-08 decision)."** That
section is canonical; this doc points at it rather than restating it.

---

## The product pillars that express the thesis

These are the surfaces where "about the user" becomes real. Each has its own deeper
workstream doc; this lists them as one coherent system.

1. **Home screen = the mirror.** The above-the-fold of the home screen is the
   primary point of user contact. It must say *"this is a site about you"* in the
   first second: a greeting + a stack of personal facts (your next fight, fights you
   hyped this/last weekend, a fighter you root for / follow just got booked, a taste
   insight). Today's home is a content feed with zero personalization — the biggest
   single gap between thesis and product. **Phase 1, objective #1.** See planning
   below.

2. **Onboarding = persona seeding.** New users should leave onboarding with the app
   *already knowing them* — a Letterboxd-style "explain it, then rate a fast stack
   of fights to seed a persona" flow. Feeds Fan DNA and the follow graph from minute
   one, and sets the closure-loop expectation. **Phase 1, objective #2.** See
   `follow-fighter.md` Decisions §6/§7 (onboarding picker) for the follow half.

3. **Fan DNA = qualitative identity.** The reflected self. Must move from thin,
   static labels (e.g. a username permanently tagged "Hot Take Artist") to **deep,
   qualitative, comparative insights**: *"you love strikers,"* *"you're drawn to
   women's MMA,"* *"you live for back-and-forth wars,"* *"you reward the weird ones,"*
   *"vs. other fans you rate grindy decisions 1.4 higher."* This is gated on far
   richer AI enrichment of historic fights (more fields, more tags, more coverage).
   **Phase 1, objective #3.** See `rewarding-users.md` (Fan DNA engine) +
   `ai-enrichment.md`.

4. **Follow graph = the interest spine.** The time-stamped, cross-promotional
   record of who each user opted into. Already the highest-value sale asset and the
   backbone of half the home-screen facts ("a fighter you follow just got booked").
   See `follow-fighter.md`.

5. **Closure loops = the app remembers you.** Hype → outcome payoff, anniversary
   surfacing, "you were in his corner," weekly recap, annual Wrapped. The mechanism
   by which past actions return as identity. See `rewarding-users.md`.

---

## Phase 1 strategic objectives

Three hard pushes, planned in detail in this doc's sibling planning sections (and in
the workstream docs). All three answer the same question: *when a user opens the
app, do they immediately feel it's about them?*

1. **Home screen above-the-fold** — the mirror. Greeting + personalized fact stack.
   *Primary objective — this is the front door.*
2. **Onboarding** — Letterboxd-style explain-then-rate flow that seeds an initial
   persona + initial follows.
3. **Fan DNA depth via better AI enrichment** — qualitative, comparative,
   never-static insights; requires a deeper + wider historic-fight enrichment pass.

> **Status:** thesis consolidated 2026-06-09. The three objectives are entering
> hard planning. Detailed plans will be appended here and/or to the workstream docs
> as they're worked.

---

## Open questions

- **How personalized can above-the-fold be for a brand-new / logged-out user?**
  The mirror needs data to reflect. What's the graceful degradation path from
  "Welcome back, Mike + 5 personal facts" down to a zero-history user? (Onboarding
  is the bridge — it manufactures the first data.)
- **Does the aggregator home still exist for logged-out / discovery, or does the
  identity home fully replace it?** Likely: identity above the fold, content below
  it; logged-out sees content-first.
- **How deep before Fan DNA is "interesting"?** The current labels are too thin.
  What's the minimum enrichment field-set + rating count that produces a genuinely
  surprising, screenshot-worthy insight?
- **Where's the line on privacy vs. shareability?** Identity wants to be
  screenshotted (organic growth) but stay private by default.

---

## Related docs

- **`sale-value.md`** — the acquisition lens; "selling fans not scores"; the 6 data
  assets; the canonical allegiance-over-prediction decision.
- **`rewarding-users.md`** — the product expression: Fan DNA engine, closure loops,
  the reward philosophy (no leaderboards/prizes).
- **`follow-fighter.md`** — the interest graph: the highest-value user asset + the
  onboarding follow picker.
- **`ai-enrichment.md`** — the enrichment substrate that Fan DNA depth depends on.
- **`memory/project_identity_platform_pivot`** — the original (doc-less) memory this
  consolidates.
- **`memory/lesson_dataset_aggregates_dishonest`** — why dataset history must stay
  honest for the identity asset to be real.

---

## Changelog

- **2026-06-09** — Doc created. Consolidates the long-referenced but never-committed
  identity-platform thesis from `sale-value.md`, `rewarding-users.md`,
  `follow-fighter.md`, and project memories. Sets Phase 1's three objectives (home
  above-the-fold, onboarding, Fan DNA depth). Closes the doc gap flagged in
  `docs/daily/2026-06-08.md`.
