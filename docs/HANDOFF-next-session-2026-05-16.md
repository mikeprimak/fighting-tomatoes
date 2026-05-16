# Handoff — Next session triage, 2026-05-16

Mike asked for a project-triage at end of session 2026-05-16. Ranked plan to start the next work session from (do not auto-execute — surface this and confirm scope).

When picking this up: read this doc, summarize the top items to Mike, ask which to start. Don't just start executing #1 — confirm first.

## Ranked plan

**1. Ship the work that's already done (highest ROI, ~1 hr)** — **PAUSED, see notes below**
- `git push` local commit `f050c64` (AI preview on `UpcomingFightCard` + backend `/api/events?includeFights=true` select fix). Prod app shows no AI previews on the events tab until this lands on Render.
- Commit + push the uncommitted `packages/mobile/components/UpcomingFightModal.tsx` AI preview variant (full one-liner under fighter row). Test once on the MVP Rousey vs Carano card, then ship.
- Ask before running `eas update --branch production` to push hype/rating reveal modals + AI preview into the running iOS/Android binaries. (Build credits rule still applies — `eas update` is JS-only and cheap, but confirm anyway.)

**2. AI enrichment cron (this week, before UFC White House Jun 15)**
T-10/T-5/T-2 cadence is decided in `docs/areas/ai-enrichment.md` §Decisions 3. Pipeline runs only via `scripts/enrich-event.ts` by hand today. Build a GH Actions cron mirroring the broadcast-discovery pattern. ~3-4 hr.

**3. Marketing — activate the attribution spine (before Jun 14)**
PostHog SDK, `identify()` on login, and install-referrer wiring are all in code but DORMANT until the next EAS *production build* (binary, not OTA). Trigger that build with enough lead time for a clean install funnel by UFC White House. Ask before kicking the build.

**4. Rewarding Users — Wave 3 (Fan DNA)** — BLOCKED on #2 producing `aiTags` across the whole upcoming card slate, not just MVP. Defer.

**5. Follow-fighter (the acquisition workstream)** — BLOCKED on Mike's six unanswered design questions Q1-Q6 from 2026-05-14 daily doc. Don't build until answered. Worth a quiet ~30 min to think through, not a coding session.

**6. Web app continuation** — mid-QA, custom-domain migration (`goodfights.app` → `packages/web`) is its real unblocker (also lets Apple Sign-In use `goodfights.app` as a Domain). Slot after #2 and #3.

---

## Additional notes from 2026-05-16 (read before acting on #1)

### AI one-liner phrasing & placement — not happy yet, don't just push

- Phrasing rule problem: too many one-liners reference "Netflix" / streaming platform / event-meta nouns. When read in aggregate across an events tab they sound robotic and same-y. Need explicit prompt rules in `extractFightEnrichment.ts` to: avoid leading with platform/broadcaster, vary sentence openers across a card, prefer the *fight-specific* hook (storyline, stake, style) over the *event-meta* hook. Probably worth a re-extract pass after the prompt change.
- UI placement reconsidered: both `UpcomingFightCard` and the full version on the hype modal disrupted visual balance Mike previously dialed in. Next session, before pushing `f050c64`, explore a third surface: **fight detail screen** as the primary home for the one-liner. The card and modal placements are not load-bearing — feel free to remove one or both if the detail-screen placement reads better. Don't ship the current card/modal placements to prod without revisiting.
- Net: #1 in the ranked plan is **paused** pending these decisions. Do not push `f050c64` blindly — bring it up with Mike first.

### Marketing attribution — granularity bar is higher than current spine

The current attribution spine answers "did legacy redirect vs ad spend cause this install?" Mike wants per-channel **per-campaign** granularity: Reddit campaign X vs Google ad Y vs a specific Twitter post vs organic App Store search for "good fights". Implications for #3:
- UTM schema needs a documented campaign-naming convention with a slot for the specific post/ad/keyword, not just `utm_campaign=legacy-org`.
- Twitter Hype Index posts each need their own `utm_content` (per-tweet ID) so individual tweets are diff-able, not aggregated into one bucket.
- App Store organic search ("good fights" keyword) requires App Store Connect Search Ads / search-term reporting setup — separate from the install-referrer wiring already done. Worth a session to map Apple's reporting surface.
- Reddit + Google ad campaigns each need a campaign-level UTM template the ad copy pulls from.
- Document the schema at `docs/marketing/attribution-spine.md` (or update it if it exists) before kicking the next EAS production build.

### Rewarding Users — pre/post-fight scrape framework (architectural commitment)

**⚠️ FOUNDATIONAL PRINCIPLE (added 2026-05-16): the pre + post-fight scrapers are the foundation of the entire Fan DNA system's breadth and depth.** They are not "the thing that produces preview text on cards." They are **the data spine** for:
- Tier 2 + Tier 3 Fan DNA traits (the deep half of the trait taxonomy)
- The recommendation engine's reasoning quality ("Because you love striker-vs-grappler chess matches")
- The closure-loop row copy on `Hype vs Outcome`
- Push notification copy richness
- Web SEO long-form pages (the organic moat)
- The commercial dataset that doubles the acquisition narrative

**Implication:** the scraper extraction schemas must themselves be *appropriately broad and deep*. Design them as if every field will eventually power 3+ downstream features. **Narrow extraction now permanently caps Fan DNA depth.** Broad extraction now means future traits add for free; the field already exists, just write the new compute logic.

Concrete principle when designing the pre-fight schema (already partially exists in `aiTags`):
- Don't extract *only* what the preview line needs. Extract every structured field a reasonable Fan DNA trait might want — camp/coach, career trajectory tags, rematch flag with prior-result details, recent-loss recency, trash-talk/promotional drama level, title implication granularity (interim vs undisputed vs eliminator), significant line movement, public sentiment direction.

Concrete principle when designing the post-fight schema (NEW work):
- Extract beyond the result. Extract pace dynamics (output rate, momentum-shift count), drama markers (controversial decision flag, bad-stoppage flag, ref controversy), highlight beats (knockdowns, near-finishes), narrative arc (early dominance reversed, slow burn, instant fireworks), surprise factor relative to expectations, post-fight context (callouts, retirement teases, gracious vs sour reactions), aftermath markers (title shot earned, future booking implications), quotable moments.

If a future Fan DNA trait requires a field that wasn't extracted at scrape time, the only options are: (a) re-extract from cached source HTML (sometimes possible), (b) re-scrape (often impossible — articles get edited or paywalled later), or (c) ship the trait without that signal (worse quality). **Best mitigation: extract widely upfront.** LLM tokens are cheap; backfill is expensive or impossible.

AI enrichment is now explicitly a **two-sided** workstream:
1. **Pre-fight scrape + LLM parse** (already shipped Phase 1) → narrative for hype/preview surfaces **AND foundation for Tier 2 Fan DNA traits**.
2. **Post-fight scrape + LLM parse** (NEW commitment) → fight result narrative (how it went, pace, momentum, finish quality, surprises) **AND foundation for Tier 3 Fan DNA traits, the recommendation engine, and the commercial dataset**. Feeds:
   - User insight features like *"You like fights that were back-and-forth"*, *"You over-rate decisions"*, *"Your sweet spot is round-2 finishes"*.
   - Closure-loop row copy (`Hype vs Outcome` rows annotated with what actually happened, not just rating delta).
   - Fan DNA Tier 3 inputs (Drama Queen, R1 Closer, pace affinity, etc.).
3. **Commercial value at scale.** The combined pre+post corpus across all promotions over time is a sellable dataset on its own — analogous to broadcast discovery's buyer-facing value, but richer because it pairs *expected narrative* with *actual outcome narrative*. **Schema breadth directly determines buyer-side value.** Build the schema and pipeline aware of this from day one (provenance, source URLs, confidence, timestamps, exportable format).

Action items to write up when those workstreams are next opened:
- Add a **Post-fight enrichment** phase to `docs/areas/ai-enrichment.md` roadmap (sits between Phase 2 and Phase 3 — sources, model, schema additions like `Fight.aiResultTags`, `aiResultPreview`, `aiResultEnrichedAt`).
- Add the **back-and-forth / pace / momentum** insight family to `docs/areas/rewarding-users.md` Wave 3 (Fan DNA) inventory, gated on post-fight enrichment shipping.
- Capture the **commercial dataset value** thesis in both area docs and link it to `docs/areas/follow-fighter.md`'s acquisition narrative — this is a second moat dataset.

Do not edit the area docs in this triage note's session — flag for the next session that opens those workstreams.

### Rename "Hype DNA" → "Fan DNA" AND fold hype accuracy into it as one trait

The personality engine isn't just about hype accuracy — it's about insights about the user **as a fan**: what styles they like, what pace they prefer, decision vs finish bias, weight-class taste, back-and-forth-fight affinity (post-fight scrape feeds this), org loyalty, etc. "Hype DNA" framed it too narrowly around one signal. "Fan DNA" reads cleaner and matches the breadth of inputs (ratings + hype + follows + comments + post-fight narrative tags).

**Architectural consolidation (2026-05-16):** the `Hype vs Outcome` section that shipped 2026-05-15 should NOT live as its own profile section long-term. Hype accuracy becomes one **trait inside Fan DNA**, surfaced as a sentence like *"You call the crowd correctly 62% of the time"* or *"Hot take artist — when you bet against consensus, you're right 71% of the time"*. Same for every future insight: one consolidated `Fan DNA` card on profile → tap → full-screen Fan DNA page listing all traits. Prevents the profile from becoming a wall of single-insight sections as Wave 3+ ships more trait families.

Action when next opening Rewarding Users or AI Enrichment:
- Sweep `Hype DNA` → `Fan DNA` across `docs/areas/rewarding-users.md`, `docs/areas/ai-enrichment.md`, `docs/HANDOFF-ai-enrichment-2026-05-15.md`, `docs/feature-inventory.md`, and `CLAUDE.md`. (5 files, found via grep 2026-05-16.)
- Restructure `rewarding-users.md` so Wave 2's `Hype vs Outcome` is reframed as the **first Fan DNA trait** (not a standalone Wave 2 deliverable that gets a sibling Wave 3 deliverable). Wave 2 and Wave 3 collapse into a single Fan DNA wave that grows trait-by-trait as the data allows.
- On the mobile side: when Fan DNA ships, the existing `app/activity/hype-accuracy.tsx` becomes either (a) the trait-detail view tapped from the Fan DNA page, or (b) deleted and folded into the Fan DNA full-screen. Decision deferred — depends on whether per-trait deep-dives feel right.
- Profile change: replace the standalone `Hype vs Outcome` SectionContainer with a single `Fan DNA` SectionContainer showing 2-3 headline traits (rotating?) and tapping into the full Fan DNA screen.
- Confirm rename with Mike before the sweep in case he prefers a different name ("Fight DNA"? "Your Profile"? "Fan Print"?).

### Fan DNA also hosts recommendation surfaces (added 2026-05-16)

The Fan DNA full-screen has descriptive traits *and* prescriptive recommendation sections that act on those traits:
- **Fights you might love** — fights the user hasn't rated/watched, ranked by predicted love based on their behaviour. Each card shows the *why* inline: *"Because you rated 3 Sean Strickland fights 9+"*, *"Because you like back-and-forth wars"*, *"Because you love bantamweight title fights"*. Pulls from past ratings + Fan DNA traits + AI tags (pre-fight from Phase 1, post-fight once that ships).
- **Fighters you might love** — same shape but for fighter follows. *"Because you follow Topuria and Volk"*, *"Because you rate striker-vs-grappler fights high"*. Becomes a follow-suggestion surface that doubles as a [[follow-fighter]] growth lane (every accepted suggestion increases the dataset's value per the acquisition narrative).
- Both sections must show the **reasoning sentence** alongside every recommendation — opaque recommendations feel like ads, transparent ones feel like the app understands you. Reasoning copy uses the same Fan DNA trait language so users learn their own profile by reading recs.
- Recommendation engine implementation deferred — likely starts as a rules-based scorer on existing signals (ratings, follows, AI tags, weight class, org), upgrades to a learned model only when there's enough behaviour data per user (~25+ ratings). Don't over-engineer v1.
- Cross-references the existing inventory items in `rewarding-users.md` under "Discovery / utility" (Recommendations feed, Style match recommendations) — those rows should be reframed as Fan DNA recommendation sections, not separate discovery features, to keep all personalized surfaces under one banner.

### Cross-promotional recommendation lanes are a first-class Fan DNA feature (added 2026-05-16)

The recommendation sections explicitly surface fighters/fights from promotions the user *doesn't* currently follow heavily — *"Fighters you'd like from PFL"*, *"PFL fights that match your taste"*, *"Bellator alumni now in ONE"*, etc. Reasoning sentence still required: *"Because you rate UFC welterweight wars high — PFL's welterweight tournament has 3 fighters in your style"*.

Why this is load-bearing:
1. **User value** — most fans are mono-org by habit, not preference. Cross-promo recs expand their fight diet using their own taste, not by us guessing.
2. **Acquisition moat** — per [[follow-fighter]] §"Why this is *the* acquisition workstream", cross-promotional intent data is the single most valuable thing about the dataset. Every accepted cross-promo follow turns a passive UFC fan into a tracked PFL/ONE/MVP fan in the DB. UFC has zero data on whether their fans defect when a fighter leaves; we will.
3. **Org-balance gameplay** — over time, the Fan DNA traits include an "org diversity" dimension. A user whose taste profile predicts they'd love RIZIN but who has zero RIZIN ratings is a target for the cross-promo lane.

Implementation note: the recommendation scorer should explicitly weight *promotion novelty* as a factor (penalize recs from the user's most-rated org, reward recs from underrepresented orgs *when the style/taste match is strong enough*). Don't blindly surface random PFL fights — only ones the model genuinely thinks fit the user's DNA.

### Fan DNA trait taxonomy (drafted 2026-05-16)

Trait families (full inventory in chat transcript 2026-05-16 — promote to `docs/areas/rewarding-users.md` when that workstream is next opened):
- **A. Affinity** — style, pace, finish, outcome (back-and-forth wars), weight class, card position, org, gender
- **B. Behaviour** — rating bias vs community, cadence/tenure, follow breadth, comment vs lurk, early vs late rater
- **C. Prediction** — hype accuracy (folded in here), hot take rate, predicted-winner accuracy, sweet spot
- **D. Identity arc** — tenure milestone, DNA shift over time, discovery diversity, cross-promo openness

Tier-by-data-dependency (= shipping order):
- **Tier 1** ships now (existing signals): hype accuracy, predicted-winner accuracy, org/weight/gender/card-position affinity, rating bias, tenure, follow breadth, hot take rate, sweet spot, cross-promo openness.
- **Tier 2** unlocks with AI enrichment Phase 1 cron: style affinity, stakes affinity, calibration-by-stakes.
- **Tier 3** needs post-fight scrape: back-and-forth affinity, pace affinity, finish quality affinity, round-arc preference, surprise factor.
- **Tier 4** needs longitudinal time (~6mo of Tiers 1-3 running): DNA shift, year-over-year arcs, Hype Wrapped fuel.

Surfacing rules (locked 2026-05-16):
- **Tone: softer / observational**, not declarative. *"You tend to love striking matchups"* > *"You're a striker purist"*. Editorial vibe, not gym-bro labels.
- **Humor variant is first-class AND heavy.** Every trait has a soft-tone copy pool *and* a humor copy pool. Engine surfaces humor variant on a meaningful fraction of impressions (start ~40%, tunable, never twice in a row). Humor is a defining feature of Fan DNA, not a sprinkle. Mike's tonal reference: **Worms (the video game)** — dry, absurd, affectionate, theatrical understatement. The narrator finds the user amusing the way a witty butler finds you amusing, not the way a sarcastic friend roasts you.

  **Worms-tone rules (load-bearing — copy review checks against these):**
  - Affectionate, not diminishing. The user is delightful; the *data* is the joke.
  - Absurd metaphors > insults. *"The bar is somewhere above the moon"* > *"the community thinks you're broken."*
  - Specific imagery > judgment. *"Sunday mornings, with coffee and quiet conviction"* > *"hangover or hate-watching."*
  - Banned words (land as moral/clinical verdicts on the user): *sicko, broken, cooked, joyless, obsessed, addict, problem, weird, twisted, embarrassing.*
  - Never punching down at fighters or promotions. *"The PFL is starting to wonder if you exist"* (affectionate absurdity) is fine; *"filing a restraining order"* (implies stalker-creep on the user) is not.
  - Two-beat structure: setup (the fact) + punchline (the wry observation). Specific numbers in the setup are the comedic engine — *"312 UFC, 4 PFL"* sets up the joke before any wordplay arrives.
  - "We" narrator voice is welcome and has personality. *"We salute the commitment"*, *"Splendid stamina"*, *"We've been counting."*

  Sample lines that pass the rules (in chat transcript 2026-05-16) — promote ~20-30 of these into a seed humor pool when the trait registry is implemented.

### Fan DNA surfaces in the post-hype + post-rate reveal modals (added 2026-05-16)

The reveal modals that shipped 2026-05-15 (Hype submitted! / Rating submitted!) get a third beat: a Fan DNA observation tied to the action just taken. Reveal sequence becomes: (1) community chart + comparison [existing] → (2) one personal DNA line [new] → (3) close.

The DNA line is **contextual to the just-completed action**:
- Hyped a striker fight 9 → *"Another striker matchup hyped. You and your tastes."*
- Rated a war 10 → *"Your tenth 10 of the year went to a back-and-forth. Of course it did."*
- Gave a 5 to a community-7 fight → *"An unpopular 5. Bold."*
- 25th rating ever → *"That makes 25. Your style affinity just unlocked."*
- Followed-then-hyped → *"From follow to hype in 14 seconds. Decisive."*

Architectural implication: **the trait registry must support two query modes**:
1. **Batch mode** (already in the design) — nightly compute, fill all trait values for the Fan DNA full-screen.
2. **Event mode** (NEW) — given `{ user, action, fightId, value }`, return the single most relevant trait/fact line for surfacing right now. Each trait declares which actions it can comment on (e.g. `respondsTo: ['rate', 'hype', 'follow', 'unlock']`); a relevance scorer picks one when multiple fire. Event-mode is what makes the reveal-modal integration possible.

Why this is strategically important:
- **Onboarding stickiness.** Even thin-data users get a DNA line every time they rate ("First rating! Welcome to the spreadsheet."). They learn the Fan DNA mechanic by being shown it 25× before they ever tap the profile section.
- **Trait discovery loop.** *"Your style affinity just unlocked"* is a far stronger entry point to the profile feature than a static section. Users discover Fan DNA *through* using the app.
- **Humor delivery cadence.** Heavy humor (~40%) feels natural in the post-action moment. Five to fifty DNA beats per fight night during a card = the right volume for the tone to land without fatigue.
- **Closes the dopamine loop.** Wave 1 reveal modals were about community. Adding the DNA beat makes them about *the user* — the most rewarding type of comparison.

Implementation order when this workstream opens:
1. Lock the trait registry interface with both `batchCompute` and `eventEvaluate` modes from day one — retrofitting event-mode later is painful.
2. Ship 5-8 Tier 1 traits with event-mode handlers + a fun-facts engine before any Fan DNA full-screen UI work.
3. Wire reveal modals to call `eventEvaluate({ action: 'hype'|'rate'|..., user, fightId, value })`, pick top-scoring response, render below the comparison line.
4. Only then build the Fan DNA full-screen, by which point the registry has been battle-tested on the reveal surface.

### Toggle-storm / response-harvest contingency (added 2026-05-16)

Power users will sometimes try to harvest the DNA engine by rapidly toggling a rating or hype on a single fight to see all possible responses. This must be handled gracefully — the user is engaged with the voice, which is good, but the system must not visibly run out of material.

Detection signal — `(userId, fightId, actionType)` tuples, NOT raw action velocity. The dividing line:
- **Toggle storm** (fires meta response): same user × same fight × same action type, 5+ value changes within 10 minutes. Unambiguous harvest behavior.
- **Card sweep** (normal DNA fires): different fights, fast pace. Even 12 ratings in 5 minutes across a live card is engaged-fan behavior, not harvest.

Response tiers in `eventEvaluate`:
1. **5+ toggles** on the same (user, fight, action) → return a META line from a dedicated ~15-line pool acknowledging the indecision in Worms voice (*"You've changed your mind six times. We're enjoying watching this."*, *"Four toggles deep. Whatever you land on, we believe in you."*). Bypasses normal trait scoring.
2. **10+ toggles** on the same (user, fight, action) → return an EXIT meta line (*"Alright. You've found our best material. We're going to sit this one out."*) and mark that (user, fight) **quiet for 1 hour** or until next session. The user gets a wink instead of a stutter; the system never visibly runs dry. Reset is per-fight, not global — other fights still get normal DNA.

Bonus: persistent toggle-prone users earn a real trait (*"You revise your scores more than the average. Considered. We respect it."*). Failure mode folded into the fandom — every pattern, including this one, is its own coherent fandom per the emotional design principles.

Implementation note: cheap to wire — runs on data already in the `DNALineImpression` table (or a small recent-action cache). The check is a single SQL count + a small lookup pool. No new tables required.

### Freshness / anti-repetition rules for the DNA line engine (added 2026-05-16)

A three-layer freshness strategy. Detailed write-up in chat transcript 2026-05-16; key rules to bake in:
- **Layer 1 — canned pool (~60%):** combinatorial templates with variable slots, sample-without-replacement, **30-day cooldown per exact line per user**.
- **Layer 2 — LLM-generated on demand (~30%):** Haiku 4.5 generates 3 candidates per surfacing, tone-filter picks one, fall back to Layer 1 on quality failure. ~$1/mo at expected volume. Always fresh.
- **Layer 3 — fun-fact scanner (~10%):** nightly job scans for surprising patterns (streaks, anniversaries, contradictions, milestones), hand-curated copy per pattern. Priority-bumps when a moment fires.
- **Same-trait pacing (corrected 2026-05-16):** repeats within a session ARE fine and realistic (5 KO ratings → multiple finish-affinity mentions is honest). Rules: no back-to-back fires of the same trait, soft cap of ~40% of session impressions for any single trait. Goal is to avoid sounding like the system has only one observation — not to forbid honest repetition.
- **Best LLM-generated lines get promoted into Layer 1** after manual review, growing the canned pool over time.
- **User-side controls:** long-press a DNA line → "Less of this trait" + a pure-stats toggle in profile for users who prefer voice-off.

See `docs/operations/maintenance.md` for the recurring maintenance tasks this engine creates.

### Trait authoring workflow (added 2026-05-16)

File-per-trait, auto-discovered registry. Adding the 100th trait is mechanically identical to the 5th. Each trait lives in:
```
packages/backend/src/services/fanDNA/traits/{trait-id}/
  trait.ts           — compute() function + metadata + respondsTo[]
  copy.json          — soft + humor copy variants with template variables
  fixtures.test.ts   — synthetic-user assertions (3+ required)
```
Registry auto-discovers everything in `traits/` at boot — no central registration, no router edits when a new event type is needed. Listening = each trait declares `respondsTo: ['rate', 'hype', 'follow', 'unfollow', 'comment', 'unlock']`.

Quality defenses against degradation as trait count grows:
- Pre-commit lint on `copy.json` (banned-word filter, length cap, structure check)
- Test fixtures required — can't merge without 3+ passing synthetic-user assertions
- Health dashboard at `/admin/fan-dna` — firings/week, dwell, complaint rate, last-computed per trait
- Quarterly humor refresh on the maintenance schedule
- Layer 2 LLM acts as the freshness flywheel even when canned pools wear out

### App-wide humorous tone audit (added 2026-05-16) — a separate workstream from Fan DNA

The witty butler voice is a **brand voice**, not a Fan DNA feature. Create `docs/brand/voice.md` as the single source of truth for tonal rules (Worms reference, banned words, two-beat structure, example lines). Then walk the app screen-by-screen and decide per static string: *humor / stay neutral / leave alone*.

High-value humor surfaces: onboarding suggested-fighters modal, empty states (*"No fights this week. The fight gods are resting."*), error states (*"We dropped that. Trying again."*), loading states, login/register, permission requests, push notifications (with restraint), email subject lines.

Surfaces to leave neutral: payment/billing, failed-rating errors (user is frustrated), legal/privacy copy.

Effort estimate: 5-10 hours total (audit + per-screen copy work). Lower-risk than Fan DNA — static strings, no backend changes. Can run as a slot-in side workstream between Fan DNA phases.

### Fan DNA — phased build plan (added 2026-05-16)

This is a 2-3 month feature. Shipping it in 4 weeks produces a fragile version that breaks under its own weight. Sequence in 5 phases, each independently shippable:

- **Phase 1 (~15-20 hr):** Schema + migrations + impression telemetry + registry (auto-discovery) + 3 Tier 1 traits + reveal modal integration. **Layer 1 (canned) only, no LLM yet.** End state: real working feature in production.
- **Phase 2 (~15 hr):** Layer 2 LLM integration + system prompt + tone filter + fallback + 3 more traits + toggle-storm contingency.
- **Phase 3 (~20 hr):** Profile section (`Fan DNA` SectionContainer replaces standalone `Hype vs Outcome`) + full-screen Fan DNA page + Layer 3 fun-fact scanner + 5 more traits.
- **Phase 4 (~20 hr):** Recommendation engine ("Fights you might love" / "Fighters you might love" + cross-promo lanes) + Tier 2 traits (depends on AI enrichment cron being live).
- **Phase 5 (ongoing):** Quarterly trait additions per `docs/operations/maintenance.md` schedule. Tier 3 traits unlock once post-fight scrape ships.

Safety posture: every Fan DNA piece is **additive** — new tables, new endpoints, new UI. Existing rating/hype/follow flows are untouched. Reveal-modal DNA beat is **non-blocking** (API failure → reveal renders without the beat, no user-facing breakage). Trait engine runs as its own isolated service. Worst-case failure surface: reveal modal degrades to current 2026-05-15 behavior. Nothing else breaks.

Scope honesty: the *plan* is sized correctly for the ambition; the *execution pace* is the risk. Mitigation is dedicating focused weeks to single workstreams instead of juggling 6 simultaneously. A "Fan DNA Phase 1 week" where everything else pauses (except marketing cadence) is far more productive than 6 weeks of context-switching across all active workstreams.

- **Confidence floor per trait** before surfacing (e.g. 5 fights for style affinity, 10 for sweet spot). Mirrors community-floor-5 from hype accuracy.
- **Self-excluded community math** for any "vs community" trait (same gaming-resistance rule as hype accuracy).

Recommendation surfaces tied to traits:
- **Fights you might love — UPCOMING is the primary view** (with implicit "rate it after to close the loop" hook). Past unrated fights = secondary tab. Each rec cites the driving trait inline: *"Because you tend to love striking matchups"*.
- **Fighters you might love** — same pattern.
- **Cross-promo lanes** as covered above — *"Fighters you'd like from PFL"*, etc.

### Resilience architecture (mandatory — system must hold up at trait breadth)

The goal is *endlessly insightful and entertaining*. That requires adding/changing/sunsetting traits frequently. Design constraints:

1. **Trait registry pattern, not hand-wired screens.** Each trait is a single registered object: `{ id, family, tier, dataDeps[], minDataThreshold, compute(user) → { value, confidence } | null, copyVariants: { soft[], humor[] }, surfaces[] }`. Adding a new trait = adding one file. Fan DNA screen, recommendation engine, profile card, and exports all iterate the registry — no per-trait edits across the codebase.
2. **Copy as data, not code.** Soft and humor copy variants live in a registry file (or DB table for late-stage iteration) so copy can be tuned without code deploys. Mike will want to iterate humor pools heavily after launch.
3. **Trait independence.** One trait throwing must not break the Fan DNA screen. Compute each trait in isolation, render whatever succeeded, log failures to telemetry.
4. **Versioning per trait.** Computed values stored with `{ traitId, version, computedAt, value, confidence }`. Bumping a trait's version triggers backfill for eligible users without touching other traits.
5. **Backfill cron, not manual reruns.** Nightly job: find users with stale-or-missing trait values whose underlying data has changed since `computedAt`, recompute. Adding a new trait or bumping a version slots into this loop automatically.
6. **Surface independence.** A trait renders the same value regardless of surface — profile card, full screen, recommendation reason, share image, weekly email. Surfaces request `{ traitId, surface, variant: 'soft' | 'humor' }` and get back rendered copy. No surface re-implements trait logic.
7. **Health endpoint / dashboard.** Internal admin view: every registered trait + how many users it has fired for + last-computation time + confidence distribution. Dead traits (no recent fires) get sunsetted; over-firing traits get threshold review.
8. **Sunset path.** Marking a trait `deprecated: true` stops new computation and surfacing without deleting historical values (preserves a user's prior Wrapped/recap data integrity).
9. **Fun-facts engine sits alongside.** Beyond the trait taxonomy, a lightweight "moment generator" surfaces one-off personal facts from user data (*"Your most-rated fighter is X"*, *"You followed Topuria 11 days before he was champ"*, *"You've never given a 10"*). Same registry pattern, lower bar (no confidence math — just a truth check). Keeps the Fan DNA screen feeling alive even for users whose trait coverage is thin.
10. **Test harness.** Each trait gets a synthetic-user fixture set so a copy change or logic change is regression-checked. Tone drift on humor variants is the most likely regression — fixtures should include sanity-check assertions on length, voice, and no-fighter-punch-down.

The architecture above is the load-bearing piece that lets the system grow indefinitely without becoming unmaintainable. Skipping any of items 1-7 will produce a system that calcifies at the first ~5 traits and resists expansion.
