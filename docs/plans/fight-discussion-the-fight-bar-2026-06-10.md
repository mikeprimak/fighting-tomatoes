# Fight Discussion — "The Digital Fight-Bar"

**Status:** Vision / ideation. Not started. No code, no schema changes.
**Drafted:** 2026-06-10
**Owner:** mike
**Type:** Strategy + creative idea catalog (the *what could this be*, not the *how to build it*)
**Branch context:** `claude/fight-discussion-comments-n9ddq1`

---

## TL;DR

Goal: build out fight discussion so Good Fights becomes **the place people come to talk about fights**, competing against r/MMA. This doc captures (1) the grand strategy for *how you compete with Reddit without fighting its network effect head-on*, and (2) a broad creative catalog of fight-native chat ideas (reactions, GIFs, live round scoring, controversy votes, lifecycle-aware threads).

**North star for everything below:**
> We're not building a comment section. We're recreating the feeling of watching a fight in a packed bar full of people who actually know fighting.

The roar when someone gets dropped, the collective "OHHH" on an eye poke, the guy who called the head kick, the scorecard argument that spills into the parking lot. That communal, sensory, in-the-moment thing is what a wall of Reddit text can never reproduce. **Every feature should ladder up to "digital fight-bar."**

This is a captured brainstorm, not a committed roadmap. Nothing here is decided.

---

## Current state (the starting point)

The "comment section" today **is the review system.** Relevant primitives already in the schema:

| Primitive | Model | Notes |
|---|---|---|
| Post-fight reviews (= today's comments) | `FightReview` | top-level + 1-level replies, up/downvotes, optional `rating`, media article links. **Top-level requires a rating.** |
| Pre-fight comments | `PreFightComment` | UPCOMING fights only, top-level + 1-level replies, upvotes. Separate silo from reviews. |
| Numeric ratings | `FightRating` | 1–10, `hasRevealedOutcome` spoiler flag |
| Predictions | `Prediction` | hype / winner / method, with reveal gates |
| Live status | `Fight.fightStatus`, `currentRound`, `completedRounds` | driven by live trackers (sub-5-min round/fight signal) |
| Identity | Fan DNA (16 traits), follow-fighter graph | no user-to-user follow today |
| Reach | push notifications + notification lanes | |

**Key structural facts that shape the design:**
- Discussion is **fragmented** across two disconnected surfaces (pre-fight comments + post-fight reviews) with no continuity for a user who does both.
- There is **no discussion during the fight** — exactly when energy peaks.
- Spoiler handling is **user-level only** (`hasRevealedOutcome`), not content-level.
- **To post a top-level "comment" you must score the fight** — a review is a *verdict* (monologue + score), not a *comment* (conversation). This rating gate is probably the single biggest thing standing between what exists and a place people just come to *talk*.

---

## Part 1 — Grand strategy: competing with r/MMA

r/MMA (~4M+ members) wins on pure network effect: people go because everyone's there. **You do not beat that head-on.** You win by owning the jobs Reddit does *badly* so completely that a smaller, better room wins for that specific job.

### Cede these (network-effect games you'll lose at small scale)
Breaking news, memes, fighter drama, AMAs, sheer volume. Building a generic forum and hoping people migrate is the fast way to die.

**Reframe:** Reddit is where people talk *around* fights (news, beef, gifs). Good Fights can be where people talk *about the fight itself* — anchored to it, safely, permanently. Different job, and Reddit is structurally bad at it.

### Reddit's structural weaknesses (not patchable — baked into what Reddit *is*)
1. **Spoilers are everywhere and unfixable.** Titles, sorting, all spoil. The single most common complaint. A large delayed-viewer population (DVR / replay / timezone) literally cannot use it safely after a card.
2. **It's a river, not a library.** The 20k-comment megathread peaks, archives, dies. No living, durable per-fight page. Reddit forgets.
3. **Anonymous karma, no taste.** A user is a username + a number. Can't follow someone for their fight reads. No provenance on a take.
4. **No receipts.** Hot takes evaporate; predictions are never scored against reality.
5. **Live threads are an unfollowable firehose.** No structure, late/contrarian takes invisible, brutal pile-ons on anyone "wrong."

### Our asymmetric advantages, mapped to those weaknesses
- **Spoiler-safe by construction** (reveal state already exists) → own the delayed-viewer segment Reddit can't serve.
- **Durable per-fight pages** → be the *library*. Discussion persists across years; subscribe to a fight or fighter.
- **Fan DNA on every take** → identity & taste instead of karma. A grappling nerd's read carries differently than a casual's.
- **Predictions → receipts.** "You said round-1 KO. Here's how it aged." Reddit can't; we store the pre-fight take and result on the same object.
- **Round-anchored live reactions** (live trackers) → structured live discussion vs a firehose.
- **Push + mobile + follow graph** → reach people *at the moment of the fight*. Reddit waits for them to show up.

### The wedge to start with
**"Spoiler-free fight discussion" + durable per-fight pages.** One job — *talk about a fight without getting spoiled, on a page that lives forever.* Defensible (structural, not feature-parity), marketable in one sentence, serves a motivated underserved segment rather than asking the whole MMA world to migrate.

### Funnel tactic — don't storm Reddit, use it
Make every take/verdict shareable as a **spoiler-safe link** ("I rated this fight — no result shown") droppable into the megathread or Twitter. Reddit becomes top-of-funnel; the click lands on a clean, spoiler-gated, persistent page that does what Reddit can't. Parasitize the network effect instead of fighting it.

### The honest version
At ~200 users we are NOT competing with r/MMA on volume and shouldn't pretend to. We compete on **a specific experience for delayed viewers and people who want their fight opinions to mean something over time.** On those two axes Reddit is permanently, structurally weak.

---

## Part 2 — The architectural reframe: a fight is a *timeline*

A fight is the rare content with a hard three-act structure — **anticipation → live → verdict.** That's the structural advantage over Twitter/Reddit (which can only do flat). Build one persistent discussion surface per fight whose *affordances change with `fightStatus`*, instead of two disconnected screens:

| Phase | Mode | Rewards |
|---|---|---|
| UPCOMING | predictions + "who you got" + trash talk | staking a claim |
| LIVE | round-by-round reactions, fast, low-friction | being there |
| COMPLETED | verdicts + ratings + replies | closure, being right |

The thread is one continuous artifact. Payoff = **receipts**: show what someone said *before* next to what they said *after*. Nobody else can do this — they don't have the pre-fight take and the result in the same object.

**Two frictions to fix on the existing review system:**
- **Drop the rating gate** — make `rating` optional on top-level posts so people can talk without scoring. (A review without a score is just a comment.)
- **Unify the lifecycle** — fold the `PreFightComment` silo into the same surface so discussion is live across the whole fight, not just after.

**Build order recommendation:** Option A first (loosen the rating gate + unify lifecycle + content-level spoiler gating — reuses existing models, reversible), then Option B later (split the *scored verdict* from the *open conversation* once volume justifies it, so each can be optimized — verdicts for the dataset, discussion for engagement).

---

## Part 3 — Creative catalog: fight-native chat ideas

Organized loosely. None committed; this is the riff to pull from.

### Reactions that speak fight
Generic 👍 is dead on arrival. Build a *vocabulary of fight verbs*:
- 🥊 WAR · 💤 snoozer · 🩸 blood · 🫨 that rocked ME · 👻 gassed · 🧱 wrestlefuck · 🎣 fishing (for a sub) · 🤖 robbery · 🧀 cheese (eye poke / fence grab / nut shot)
- 🫳 **TAP** — fires only on submissions, feels good to slam.
- **Scorecard stamps as reactions** — drop a `10-8` / `10-7` on a dominant round; a reaction that carries fight-literacy.
- **Reactions aggregate into live meters.** Enough 🤖 in 30s → a **Robbery Meter** lights the room. Enough 💤 → "crowd's checking their phones" vibe. *The reactions become the crowd noise.*

### A GIF/sticker library that's actually MMA canon
Not Giphy — a curated **culture pack**: canonical finishes, Rogan "OH HE'S HURT," the Khabib faceplant, DC tears, "you're gonna sleep tonight." Insiders recognize instantly; casuals learn the language.
- **Per-fighter sticker packs unlock when you follow them** → follow graph becomes collectible culture (and makes following *fun*, not just notifications).
- **Meme-template generator** with fighter faces for post-fight roast threads — UGC without broadcast-rights problems.

### The chat *behaves* like the fight (the real magic, driven by live trackers)
- **Auto round-dividers** — bell rings, `── ROUND 2 ──` slams into the feed. Scroll a fight like a *timeline*; jump to any round.
- **Between-rounds mode** — in the 60s after the bell, the UI flips: chat recedes, a **"Score Round 2"** prompt takes over. Cadence breathes like the broadcast.
- **Pop the room on a finish** — KO lands → screen shake, haptic thud, feed floods with TAP/WAR for a beat. Digitize the bar erupting.
- **Presence** — "1,204 watching live" + a momentum bar. Even small numbers *feel* alive when the room is visibly breathing.

### Live round scoring → the room's scorecard (strong instinct, crank it up)
- Everyone scores each round in the between-rounds window. Live aggregate: "The room has it 2–1 Jones."
- **Three-card reveal** after the decision: **Judges 48–47 Blue · The Room 49–46 Red · Your card 48–47 Red.** Judges diverge from the room → **Robbery Meter pegs itself.** *Emergent real-time drama, unmanufactured.* Reddit finds out an hour later in a text thread; our room *experiences* it the second cards are read.
- **Scoring becomes identity** — track agreement-with-crowd & agreement-with-judges over time → Fan DNA traits: "You score like a judge," "Finisher-biased scorer," "You had 3 robberies the judges didn't."
- Per-round **swing graph** = a shareable, spoiler-safe artifact.

### Live controversy votes (make them *spawnable*)
A **"Flag the moment"** button anyone can hit mid-fight → spawns a live poll the room votes on:
- "Eye poke — deduct a point?" · "Early stoppage?" · "Grounded? Was that knee legal?" · "Fence grab — change the takedown?"
- Live gauge result, then **crystallizes onto the fight's permanent page:** "73% of the room thought the stoppage was early." A durable, structured opinion artifact Reddit cannot produce.
- Roll up into a post-fight **Ref Report Card** the room grades.

### More vectors
- **Card Mode / the night's room** — one persistent room for the *whole event*, fights auto-dividing the feed. People show up at 6pm and stay to the main event; the room is the *evening*, not the fight. **Crews already exist** → let me watch the card *with my crew* in a shared room.
- **Live prediction survival** — lock winner/method/round pre-fight; live ticker of who's "still alive." Last one standing on a wild card = bragging rights, no leaderboard needed.
- **Casuals vs Nerds split** — let the room self-sort; show how casual vs hardcore fans scored/reacted differently. Endlessly fun, native to MMA's identity wars.
- **"You were there" badges** — for being live for the upset/robbery/Hail-Mary finish. Not points — *memory.* "You were in the room when Holm KO'd Ronda."
- **Tale-of-the-tape trivia drops** between fights to keep the room warm during walkouts.

---

## Guardrails (consistent with `docs/areas/rewarding-users.md`)
- **No leaderboards, no prizes.** Reward = closure + identity + memory, never a scoreboard/karma race.
- **No downvote pile-ons** — they punish minority opinions and contradict the closure aesthetic; hide/remove downvotes for discussion.
- **Keep threading shallow** — current 1-level is right. No "controversial" sort, no deep reply chains. Fight talk is wide and fast, not deep.
- **Spoiler-safe is a moat, not a toggle** — content-level gating tied to `fightStatus` + the viewer's reveal state.
- **Seed the empty room relentlessly** — at small scale a flat box looks dead. Use AI previews/tags as discussion prompts, pull in media reviews (`isMedia` + `articleUrl`) as seed takes, surface top takes from similar fights.

---

## Where to start (when action resumes — not tonight)
Two candidate first moves, both grounded in existing data:
1. **Foundation:** unify the two comment types into one `fightStatus`-aware surface + content-level spoiler gating + drop the rating gate. Everything else sits on this.
2. **Most viral / fight-native:** between-rounds live scoring + the three-card robbery reveal. Leans straight into data already collected.

Gut call from the brainstorm: foundation (#1) first, then the live scoring (#2) as the flagship feature on top of it. **Decide later.**

---

*Captured during a creative session on 2026-06-10. Grand strategy + broad ideas only — no build commitment. See also `docs/areas/rewarding-users.md` (aesthetic doctrine) and `docs/areas/sale-value.md` (why a richer discussion dataset matters to the acquisition thesis).*
