# Fight Discussion — "The Digital Fight-Bar"

**Status:** Vision / ideation. Not started. No code, no schema changes.
**Drafted:** 2026-06-10
**Owner:** mike
**Type:** Strategy + creative idea catalog (the *what could this be*, not the *how to build it*)
**Branch context:** `claude/fight-discussion-comments-n9ddq1`

> **⚠️ READ THIS FIRST — major framing update (2026-06-10, late session):**
> The single most important decision from this session is the **pivot away from winner predictions to an ALLEGIANCE model** ("whose side are you on / who are you rooting for"). This **supersedes** the prediction- and "receipts/being-right"-flavored ideas in Parts 1–3 below — wherever you see "prediction," "called it," or accuracy-based validation, re-read it through the allegiance lens in **Part 5** at the bottom, which is now the core unit of the product. Parts 4 (Social Validation) and 6 (Live-Chat Design) were also added this session.

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

## Part 4 — Social validation (without importing Reddit's poison)

Reddit's stickiness is partly the upvote dopamine — but that's the *shallow* flavor: it rewards being **fast, funny, or agreeable**, not being **right** or **loyal**. We can serve the deeper flavors Reddit structurally can't. (Note: with the Part 5 allegiance pivot, the strongest validation shifts from "being right" to "shared joy + loyalty" — see there.)

**The full spectrum of validation** (Reddit only does 2 & 3):
1. Being **seen** · 2. Being **agreed with** (upvotes ✅ Reddit's whole game) · 3. Being **replied to** ✅ · 4. Being **right** / on the winning side ⭐ *fights only* · 5. Being **distinctive** (the brave believer) · 6. Being **remembered** (durable record of good calls) · 7. Being **chosen** (followed).

**Mechanics:**
- **Validation that ripens (receipts).** An upvote is a sugar high; vindication *matures*. Post-fight moment: "**You called it**" / (allegiance version) "**Your guy delivered.**" We already store the pre-fight take + result on the same object. Resurface a take that aged well and auto-pin it.
- **Richer than a number.** Show *who* and *how* — faces + Fan-DNA tags ("12 grappling nerds agreed with you"), not a faceless `+47`. Being validated by people you respect > an integer (the Letterboxd "likes show faces" effect).
- **Per-object distinction, not a global score.** Not "4,200 karma" — instead "**Your verdict is the #1 take on Gaethje–Poirier.**" Specific, durable, pinned to the permanent fight page. Dopamine of Reddit *without* the karma race the doctrine forbids.
- **Replies are the deepest everyday hit.** "Your take started a conversation" (spawned an 8-reply thread) = "I moved the room." Notify replies *bigger* than likes.
- **Curated > mob.** "Take of the Night" spotlight on the most *prescient/insightful* (not highest-upvoted) — sidesteps the karma race, feels rarer. Validation from above: a **verified media** member (`isMedia`) or a **fighter** reacting = legendary, screenshot-shared forever.
- **Validate the contrarian Reddit buries.** "You're the brave 6%" — frame a well-argued minority take as a badge, not a burial. A reason for thoughtful people to leave Reddit.
- **Live dopamine loop.** "Your take is heating up — 40 reactions in 10 min." (Live, accelerating version of the existing 1/5/10/25/50/100 milestone like-notifications.)

**Guardrail / tightrope:** validation-seeking is what breeds ragebait, pile-ons, conformity. Hold the line: no global leaderboard/karma total, no downvote burials, reward *right & insightful & loyal* over *loud & early*, keep it identity + memory + closure.

> Synthesis: **Reddit rewards the take that's fast. We reward the take that was right — and remember it forever.**

---

## Part 5 — ⭐ THE PIVOT: allegiance over predictions ("whose side are you on?")

**Decision (2026-06-10):** drop winner predictions entirely. Core unit becomes **picking a side / who you're rooting for** (Team Jones vs Team DC). This re-colors every feature above. (Anticipation/hype rating can stay — that's emotion, not a prediction.)

**Why it's the stronger spine:**
- **Prediction is a *head* act; allegiance is a *heart* act.** Predicting = cognitive, about being *right* (fantasy-football brain). Rooting = tribal, about *belonging* (the guy in the bar in a jersey). Trading "smart" for "feels," and feels retains.
- **Resolves to joy or heartbreak, not correct/incorrect.** "You were wrong" is a shrug; "your guy got *robbed*" is a wound carried to the next event. **Heartbreak is a retention mechanic predictions can't touch.**
- **Underserved vs commoditized.** Everyone does winner picks (apps, betting, Reddit). Almost nobody owns *allegiance* as the core unit — defining an empty category, not entering a crowded one.
- **Cleaner brand.** Predictions drag toward odds/gambling adjacency; rooting is pure fandom — no regulatory smell.
- **Lower friction, fixes cold-start.** A prediction needs knowledge; picking a side is **one emotional tap** anyone (even a casual) can do instantly.

**The structural consequence — the room becomes two locker rooms.** A prediction room is neutral analysts; an allegiance room is **us-vs-them**, and conflict is the engine of all sports talk. This may be the single best decision for "becoming the place people talk about fights."

**Re-coloring every pillar:**
- **Reactions go factional.** Jones lands → Team Jones erupts, Team DC groans. The momentum meter becomes a **tug-of-war between two fanbases.** A digital home/away crowd.
- **Live scoring gets gloriously biased.** "Team Jones had R2 10-9 Jones; Team DC had it 10-9 DC." Allegiance bias becomes visible and funny instead of hidden.
- **Controversy votes split down team lines.** "Robbery?" → 91% of Team Gaethje yes, 4% of Team Justin. The truest representation of real fan behavior.
- **Pre-fight = trash talk with a frame.** Two sides talking smack *from a position*, not neutral analysis. Banter needs sides.
- **The arc resolves to two locker rooms** post-fight: winners' room (elation, "WE DID IT") + losers' room (commiseration, "we'll be back"). Both sticky; wounded fans want to talk.

**Validation, rebuilt around loyalty (replaces accuracy from Part 4):**
- **Shared joy, not smug correctness:** "You and 4,000 others rode for Jones — and he *delivered.*"
- **Loyalty as identity:** "You've ridden with Gaethje **7 fights straight.**" Allegiance streak = badge with a soul.
- **The believer's payoff** replaces the contrarian's: "Only **8%** were Team underdog — and he pulled it off. *You believed.*"
- **Heartbreak honored:** "Your heart was broken tonight" = an ownable closure moment. Letterboxd has no stakes like this.

**Identity goldmine — and it FUSES with follow-fighter:**
- New, juicier Fan DNA traits: **Frontrunner · Ride-or-die · Underdog-lover · Hater (always anti-champ) · Bandwagoner vs Day-one.** People will argue about which they are.
- **Picking a side per fight and following a fighter are the same emotional system** (tonight's team vs lifelong team). This unifies the engagement product with the acquisition workstream. Allegiance history becomes load-bearing identity data (sibling to the "never derive `followedAt`" rule).
- **Rivalries as a persistent social structure:** "You and @mike have been on opposite sides **5 times.**" Recurring tension = recurring reason to return and talk smack. Reddit has no memory of your feuds; we would.

**The one problem to solve — "I don't care about either guy":** predictions worked on cold fights (a puzzle); allegiance needs caring.
- **Give reasons to pick** via AI previews: "Root for him: underdog on a 3-fight skid trying to save his career." Makes AI enrichment do *emotional* work, not just inform. Casual gets a side in 5 seconds.
- **Pick for a reason → feed Fan DNA** ("Team Gaethje because I love a brawler").
- Allow **"just here to watch"** but make picking the fun default; let the room convert a neutral live ("the room turned you Team Jones in R2").

**Honest trade-off:** we **lose** the "I called it" accountability loop, but **gain** stakes, tribe, rivalry, heartbreak, and a cleaner brand — stronger, stickier, and on-doctrine (emotion + identity + closure over being right). Not close. Receipts don't vanish, they change flavor: *loyalty* receipts + the joy/heartbreak resolution.

> Synthesis: **Reddit lets you analyze the fight. We let people *care* — pick a side, ride or die, win together or break together, and remember who you feuded with.**

---

## Part 6 — Live-chat design: taming the firehose (& killing spam)

Most live comment feeds (YouTube/Twitch/IG Live) are unreadable, spam-ridden firehoses. That's a **design choice** — show every message chronologically, equal airtime, no identity gate — not a law. Fix the architecture and both diseases (velocity + spam) die at once.

- **Reactions are NOT messages (the big one).** On Twitch every "LMAOOO" is a full message — that's 90% of the velocity. Make reactions a separate, non-textual **crowd-noise layer** (drives the momentum meter / floats emoji / roars) so the **signal layer** (text takes) can breathe. Drains volume *and* removes the emoji-spam vector by design.
- **Show the best, not the latest.** Chronological = tyranny of the newest; a great take vanishes in 2s. Live-rank by reactions; **hold rising takes on screen** long enough to read; auto-pin the take of the moment; offer a "highlights only" default lane.
- **Self-curating feed.** Post → visible to a small slice → only rises to the main feed if it earns reactions. Spam never earns reactions, never gets airtime. **Dedupe/cluster** identical sentiment ("ROBBERY ×200" → the meter, not 200 messages).
- **Spam defense baked in:** identity gate to post text live (account history / has rated / follows a fighter on the card); no arbitrary links/images live (curated sticker pack only — kills bot/scam vector); low-trust messages start ambient, surface only if they earn reactions. Reputation buys airtime *per-fight*, not as global karma.
- **Pace with the fight** (via live trackers): action = ambient roar + curated text; **finish = let it flood for 5s** (pop the room) then settle; between rounds = slows + shifts to scoring. Velocity becomes an *intentional emotional beat*, not the constant state.
- **Not ephemeral:** anchor live takes to their round → post-fight it's a **browsable, round-organized record** ("jump to the R2 head-kick reactions"). The live chat *becomes* the permanent fight page. Opposite of Twitch chat evaporating.
- **Go smaller when you can:** big room = ambient roar; **Crew room** (Crews already exist) = readable, warm, conversational. Offer both.

> Synthesis: **Don't show everything. Separate the roar from the signal, let the room curate which takes rise in real time, and gate the channel by identity. The firehose stops being a firehose — and spam never gets airtime.**

---

*Captured during a creative brainstorm session on 2026-06-10 (phone session — no laptop/local repo connected; pushed to branch `claude/fight-discussion-comments-n9ddq1` on GitHub for laptop retrieval). Grand strategy + broad ideas only — no build commitment. The allegiance pivot (Part 5) is the load-bearing decision. See also `docs/areas/rewarding-users.md` (aesthetic doctrine), `docs/areas/follow-fighter.md` (now fused with allegiance), and `docs/areas/sale-value.md` (why a richer discussion dataset matters to the acquisition thesis).*
