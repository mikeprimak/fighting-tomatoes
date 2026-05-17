# Follow-Fighter Data

A first-class workstream: make the follow-fighter feature more used, more rewarding, and more measurable — because the dataset it generates is the **single most valuable asset on the path to acquisition**.

## North Star

Good Fights becomes the only place in combat sports where you can answer the question: *"How many fans, by name, have opted in to watch a specific fighter — regardless of which org that fighter signs with next?"*

UFC, PFL, DAZN, ESPN+, every broadcaster, every agency, every sportsbook — none of them have this. We can.

## Why this is *the* acquisition workstream

Most "fan data" the industry has today is one of these:

| Source | What it tells you | Problem |
|--------|-------------------|---------|
| PPV buy data | Who paid | Post-fact, expensive, no fighter attribution, locked to one org |
| Social followers | Who clicked Follow on IG/X | Vanity. Following Conor ≠ watching Conor's fight |
| Nielsen ratings | Aggregate demo | No individual identity, no fighter attribution |
| Ticket sales | Who showed up locally | ~20K data points per card, geographically distorted |

What a **weighted, time-stamped, cross-promotional follow** gives that none of these do:

1. **Forward-looking** — you know the audience for a fight *before it's booked*.
2. **Cross-promotional** — when a fighter changes orgs, the audience travels with them in our DB. UFC has zero data on whether their fighters retain fans when they leave. We will.
3. **Per-fighter granularity** — the marginal viewer count for any specific fighter on a card.
4. **Free-agent valuation** — turns "what fanbase does he bring?" from a guess into a number with a confidence interval.
5. **Historical timeline** — knowing 12,000 people followed Topuria *before* his Volk fight is worth way more than knowing 50,000 follow him today. That's the difference between predictive and lagging data.

The right analogy is **Spotify's "monthly listeners per artist"** — the music industry uses that single number to book tours, price residencies, and sign deals. Combat sports has no equivalent. We're building it.

## Design principles

1. **Quality > volume.** A weighted follow (followed + engaged with notifications + rated the fight after) is worth 100x a raw follow. Every new follow surface must include engagement tracking.
2. **High intent to take, easy to discover.** Don't make follow frictionless to the point that users follow 200 fighters in one session — that destroys the signal. But surface follow prompts wherever a user has just demonstrated interest in a fighter (rated their fight, hyped them, viewed their profile, commented on them).
3. **The timestamp is sacred.** `followedAt` is load-bearing for buyer demos. Never derive it; always store. Never overwrite it on re-follow; record both events. The history is the product.
4. **No gamification.** No streaks, no follower-of-the-week, no badges for following N fighters. Match the [[rewarding-users]] philosophy — private stats, no public pressure, no contests.
5. **Notify with restraint.** A burned-out user who disables pushes is a permanently dead data point. Every new notification lane needs measured engagement floors before broad rollout. Default opt-in granularity at the fighter level if engagement data shows it's needed.
6. **Cross-promotional integrity is the moat.** When a fighter changes orgs, their follower base MUST carry over with zero user action required. This is the killer demo and must never regress.
7. **Build the buyer screen alongside the feature.** Every shipped follow-feature should make the internal admin/buyer-facing report richer. If a feature ships and the buyer report didn't improve, we shipped the wrong thing.

## Architectural pattern

```
[user signal] → [follow row created with timestamp + source] → [notification lanes consume follow] →
[every notification fires engagement event] → [weighted follow score updated] →
[buyer-facing report aggregates by fighter, by promotion, by time window]
```

Key invariants:
- One row per (user, fighter, follow-event). Unfollow does not delete history; it ends the active window.
- Every notification dispatch logs a row in `FollowNotificationEvent` with: dispatched, opened, click-through, post-fight-rated.
- Aggregate `FollowerStats(fighterId)` snapshotted weekly so we have a frozen historical curve, not just current state.

## Current state (2026-05-14)

### Shipped
- ✅ Follow/unfollow API + DB model
- ✅ Followed Fighters screen (`packages/mobile/app/followed-fighters.tsx`) with My list + top-followed carousel
- ✅ "+" follow affordance on hype modal, rating modal, completed-fight modal
- ✅ Profile → FOLLOWING entry
- ✅ Top-followed discovery endpoint (`/api/community/top-followed-fighters`)
- ✅ Scrape-time match sync (commit, 2026-05-01) — when a new fight is booked, all existing follow rules for either fighter get a notification rule attached automatically
- ✅ Non-tracker card-start fallback (2026-05-02)
- ✅ Walkout-warning notification (~10 min pre-fight) — currently the **only** notification a follow triggers

### Known gaps (the immediate work)
- Only one notification lane wired up (walkout). No day-before, no morning-of, no booked/scratched, no signed-with-new-org, no in-progress, no results recap.
- No engagement tracking on the existing notification — we can't tell who opened it, who clicked through, who rated after.
- Top-followed carousel exists but discovery of the feature itself is weak — many active users have never tapped a "+".
- No suggested-follows / recommendation engine.
- No buyer-facing aggregate report exists yet. The dataset is there; the demo screen is not.
- Follow timeline is preserved on creation but unfollow currently deletes (need to confirm). If it deletes, that's a data-loss bug masquerading as a feature.
- No onboarding step prompts new users to follow anyone.
- Profile screen doesn't show "your relationship with this fighter" (rating history + follow history) on fighter detail pages.

## Goals

### Short-term (next 90 days)
- Multi-stage notification system live: day-before + morning-of + walkout + booked + scratched.
- Engagement tracking on every notification (dispatched / opened / CTR / post-fight-rated).
- Weighted follow score column in DB, updated per-event.
- Suggested-follow surface on at least 2 contexts (post-rating, fighter detail page).
- Buyer-facing report v1: top fighters by raw follows, weighted follows, 90-day follow growth curve.
- **Metric target**: avg follows per active user moves from current baseline (measure first) to ≥ 3.

### Medium-term (6–12 months)
- Cross-promotional follow demo polished: enter a fighter, get follower count + 12-month growth + watch-through rate + cross-org composition.
- Suggested-follow recommendation engine using AI tags from [[ai-enrichment]] (style match, division match, narrative match).
- "Fighter you follow signed with [new org]" notification lane — the cross-promotional moment is the single most valuable notification we can fire.
- Annual "Your Year in Follows" recap (Spotify Wrapped pattern, cross-pollinates with [[rewarding-users]]).
- **Metric target**: 10K active users with ≥ 5 follows each = ~50K weighted data points, signal-grade for top 200 fighters.

### Long-term (acquisition trigger)
- **100K active users × 5+ avg follows = 500K weighted data points.** Signal-grade across the top 1,000 fighters globally.
- Buyer-facing data product is a packaged, repeatable demo that closes meetings in 20 minutes.
- The follow dataset is independently licensable to multiple buyers (promotions, broadcasters, sportsbooks, agencies) — even if the app itself is never sold, the data is the asset.

## Idea inventory

### Notifications (the immediate gap)
- [ ] **Day-before notification** — *"Tomorrow: 3 fighters you follow are on UFC 329."*
- [ ] **Morning-of notification** — *"Today: Pereira fights at 10pm ET. Tap to set a reminder."*
- [ ] **Walkout warning** — currently shipped. Add engagement tracking.
- [ ] **Booked notification** — *"Pereira just got booked: vs Ankalaev, Jan 18 2027."* (Phase 4 of follow revival — partially specced, send-side not built)
- [ ] **Scratched notification** — *"Pereira off UFC 329 — replaced by Hill."*
- [ ] **Signed-with-new-org notification** — *"Cejudo signed with PFL. You'll still get notified for his fights."* This is the **single highest-value notification** for the cross-promotional narrative — every user who sees it understands what makes us different.
- ~~In-progress notification~~ — **DROPPED** (no walkout-cue granularity available from any data source; the 10-min walkout warning is the closest cue). See Decisions §2.
- [ ] **Spoiler-safe post-fight notification** — *"A fighter you follow fought last night. Open Good Fights to decide if you want to watch it back."* No outcome, no method, no round. Drives next-day ratings AND respects spoiler-conscious users who use the app as a watch-back decision tool. In-app destination must honor `spoilerFreeMode`.
- [ ] **Per-fighter notification tier preferences** — high-priority follows get all lanes; casual follows get only walkout warnings. Lets us preserve signal even as users follow more fighters.

### Discoverability / making the feature more obvious
- [ ] **Universal follow button + branding pass** — single styled component reused everywhere (fight cards, search results, comment threads, fighter detail, modals, list rows). Users learn one affordance, see it 50x/day. The current "+" on the hype modal is undersized and only appears in one place — this is severely lacking. **High priority foundation work for Wave 2.**
- [ ] **Onboarding follow picker** — curated grid of ~60–80 fighters organized by promotion section (UFC champions + top contenders, PFL, ONE, BKFC, RIZIN, MVP / KC / DBX). Pick 3–5 minimum suggested, skippable. Search bar at top. Source-attributed as `onboarding`. **Used in two contexts**: (a) automatically after new-user registration, (b) **shown once to existing users as a feature-launch announcement** on next app open. **Wave 2 first ship.** See Decisions §6 + §7.
- [ ] **Re-onboarding email** — DROPPED in favor of the in-app feature-launch picker for existing users (Decisions §6). Email path may revisit later for users who haven't opened the app in 30+ days.
- [ ] **Post-rating "follow the winner?" prompt** — after a rating submits on a completed fight **with score ≥8**, modal offers follow on the winner (default) + option for both fighters. Source-attributed as `post-rating`. Suppression: 3 dismissals → 30-day quiet window. **Wave 2 second ship.** See Decisions §5.
- [ ] **Fighter detail page** — prominent follow button at top + social proof: *"4,217 fans follow Pereira."*
- [ ] **Upcoming Events screen — "Fighting this weekend you don't follow"** module at the top, horizontal carousel. Replaces the "home feed" idea (no 6th tab — embed in existing screen instead).
- [ ] **Profile screen — "Your fighters" card** with count *"Following 12 · 3 fight this week"*, sorted by **next fight date** (not alpha/recency), with reason-tagged suggested follows below: *"Because you rated Pereira 9"*, *"Trending in follows"*, *"Fighting this weekend"*.
- [ ] **Card / event screen "Who to follow on this card"** — pre-card module surfacing fighters on the card the user doesn't yet follow.
- [ ] **Empty-state hero** — Followed Fighters screen for a 0-follow user gets a real pitch + CTA, not the current empty list.
- [ ] **Search results follow CTA** — every fighter row in search has the universal follow button visible.
- [ ] **Push permission re-prompt** — if a user has follows but pushes disabled: *"Don't miss the [N] fighters you follow."*
- [ ] **"From your ratings" suggestion** — if user has rated 8+ fights and follows 0: *"Want to follow the fighters you've rated highest?"*
- [ ] **Re-onboarding email for ~2,000 legacy migrated users** — via Resend Broadcasts, prompts them to pick initial follows.
- [ ] **"Fighters who fought your fighters"** — natural rivalry recommendations on followed-fighter detail.
- [ ] **Post-hype "auto-follow the winner of this fight"** — locks in a future follow at fight resolution if user hyped 9+.

### Follow quality / engagement weighting
- [ ] **`FollowNotificationEvent` table** — log every dispatch + open + CTR + post-fight-rate.
- [ ] **`FollowerStats(fighterId)` weekly snapshot** — frozen historical curve, not just current state.
- [ ] **`weightedFollowScore` column** on `FighterFollow` rows — derived from engagement, refreshed per-event.
- [ ] **Decay function for inactive follows** — a follow from a user who hasn't opened the app in 90 days counts less, but isn't deleted.
- [ ] **Bulk-follow detection** — if a user follows 50 fighters in one session (e.g., a power-user discovery binge), flag those follows as low-weight until subsequent engagement validates them.

### Cross-promotional tracking (the killer demo)
- [ ] **Org-change event log** — when a fighter's `promotion` field changes, log the event with timestamp.
- [ ] **Follower-base portability report** — given a fighter who changed orgs, show what % of pre-change followers re-engaged with notifications about that fighter post-change.
- [ ] **Cross-org composition report** — for any fighter, show the cross-org follow profile of their followers ("82% of Cejudo followers also follow ≥3 UFC fighters, 14% also follow ≥1 PFL fighter").
- [ ] **"Signed with new org" notification** (also listed under Notifications) — the user-visible expression of this capability.

### Recommendation / suggested follows
- [ ] **"People who follow X also follow Y"** — collaborative filtering surface on fighter detail page.
- [ ] **Style-match recommendations** — using AI tags from [[ai-enrichment]] ("you follow 4 grapplers — try these 3").
- [ ] **Division-match recommendations** — *"You follow 6 BW fighters — here are the top BW fighters you don't follow yet."*
- [ ] **Rivalry recommendations** — *"You follow Pereira — follow Ankalaev so you're notified for the rematch."*
- [ ] **Up-and-coming recommendations** — surface fighters with rapid follow growth (this is its own social-proof loop).

### Profile / identity surfacing
- [ ] **Fighter relationship card on fighter detail screen** — *"You've followed Pereira since April 14. You've rated 6 of his fights since. Your hype average on him: 8.2 vs community 7.4."* Closure-loop pattern from [[project-rewarding-users-workstream]], scoped to a single fighter. **User-confirmed YES.**
- [ ] **Follow count on user profile** — quiet, no leaderboard.
- [ ] **"Your top followed fighters" on profile** — by date or by engagement.
- [ ] **Global "Your fights" filter** — surface only fights involving followed fighters across upcoming, past, ongoing. Available on Upcoming + Past + Top Rated tabs. **User-confirmed YES.**
- [ ] **Annual "Your Year in Follows" recap** — Spotify Wrapped pattern. *"You followed 12 fighters. Their combined record this year. Your most-watched. Your best hype call on them."* Shareable, screenshottable. Cross-pollinates with [[project-rewarding-users-workstream]] retrospection. **User-confirmed YES.**
- [ ] **Four-favorite fighters** — Letterboxd-style. Public-but-quiet, shown on user profile.

### Onboarding flows
- [ ] **First-launch follow picker** — curated top-200 grid, pick 3–5. (Also listed under Discoverability.)
- [ ] **Re-onboarding for legacy users** — 2,000+ migrated legacy users who never picked follows. Email + in-app prompt to seed initial follows.
- [ ] **"Import from rating history"** — for users with rating history but no follows: *"You've rated 47 fights — want to follow these 12 fighters you've rated highly?"*

### Buyer-facing reporting infrastructure (build in parallel with features)
- [ ] **Admin "Fighter Insight" page** — given a fighter, show: total follows, 90-day growth curve, weighted score, cross-org composition, notification engagement rate, average rating from followers vs non-followers.
- [ ] **Admin "Top Movers" page** — fighters gaining follows fastest this week / month.
- [ ] **Admin "Free Agent Watch" page** — fighters with high follower counts whose contract status flags as expiring/expired. The PFL pitch lives here.
- [ ] **Exportable buyer reports** — CSV / PDF for the demo deck.

### Bulk-follow flows (high-leverage discovery)
- [ ] **"Follow everyone on this card"** — high-intent users can opt in to all fighters on an upcoming card. Mark as bulk-follow for weighting.
- [ ] **"Follow all of [division] champions"** — curated lists.
- [ ] **"Follow your favorite camp/team"** — when AI enrichment surfaces camps, allow camp-level follow.

### Anti-fraud / signal hygiene
- [ ] **Rate-limit follows per user per day** — prevents bot-style follow spam.
- [ ] **Sock-puppet detection** — multiple accounts following identical fighters in identical order from same IP → low-weight.
- [ ] **Engagement minimum** — a follow with zero notification engagement after 6 months gets archived from active weighted score.

## Data schema (current — to be expanded)

### Existing
- `FighterFollow` — (userId, fighterId, createdAt, active)
- Notification rule rows generated at scrape-time match sync — see [[lesson-notification-rule-sync-race]]

### Planned / proposed
- `FollowNotificationEvent` — (followId, notificationType, dispatchedAt, openedAt?, clickedAt?, postFightRatedAt?)
- `FollowerStats` (snapshot) — (fighterId, snapshotDate, totalFollows, weightedFollows, cross-org composition JSON)
- `weightedFollowScore` column on `FighterFollow` — derived, refreshed per-event
- `FighterOrgChangeEvent` — (fighterId, fromPromotion, toPromotion, changedAt) for the cross-promotional report

## Decisions log

### 1. Spoiler-safe is a hard rule for all post-fight notifications (2026-05-14)

Many Good Fights users watch fights *not* live and rely on the app as a watch-back decision tool. Any notification fired after a fight ends must not reveal the outcome, method, or round. The accepted pattern: *"A fighter you follow fought last night. Open Good Fights to decide if you want to watch it back."* In-app destination respects the existing `spoilerFreeMode` setting.

Implication: drop the "Pereira won by KO Round 2" variant entirely. The spoiler-safe version still serves the engagement-tracking and rating-driver goals — it just frames the value differently (decision tool, not score announcement).

### 2. No walkout-cue granularity — drop in-progress notifications (2026-05-14)

No data source we have provides actual ringside walkout cues. The closest signal is "next fight up on the card" within ~10 minutes, which the existing walkout-warning notification already covers. The proposed "in-progress / walking out now" lane is dropped — it would not add value over the current 10-min warning.

### 3. No 6th bottom tab — embed discovery in existing screens (2026-05-14)

The app's bottom nav is Live / Upcoming / Past / Top Rated / Profile and we're not adding a sixth. Follow-fighter discovery modules embed inside:
- **Upcoming Events** top: "Fighting this weekend you don't follow" carousel
- **Profile**: "Your fighters" card with count, sorted by next fight date, with reason-tagged suggested follows below

This preserves the existing nav while delivering the same discovery surface.

### 4. Wave 2 first-ship order locked (2026-05-14)

1. **Universal follow button + branding pass** — foundation. The current "+" affordance only lives on the hype modal and is undersized. Before any new surface goes live, the follow button needs to be a single styled component reusable everywhere.
2. **Onboarding follow picker** — biggest avg-follows-per-user lever; every new user starts with 3–5 follows.
3. **Post-rating "follow the winner?" prompt** — highest-intent moment in the app; captures engaged users at the exact moment they've demonstrated engagement.
4. **Engagement tracking shipped alongside all three** — `FollowSource` on `FighterFollow` (records origin: `onboarding`, `post-rating`, `hype-modal`, etc.) and `FollowNotificationEvent` table (dispatched / opened / clicked / post-fight-rated). No new follow surface or notification ships without engagement tracking — otherwise we lose the weighted-follow signal forever for that cohort.

### 5. Post-rating prompt only fires on highly-rated fights (≥8) (2026-05-14)

The "follow the winner?" prompt is **suppressed unless the user just rated the completed fight ≥8**. Rationale: a follow created after a 5-star/10 rating is a much higher-quality intent signal than one created after a 5/10 polite-rating. Aligns with the workstream's **quality > volume** principle — every follow that lands in the dataset reflects real enthusiasm, not casual engagement.

Suppression behavior: if the user dismisses the prompt 3 times in a row without following, suppress for 30 days. After the suppression window expires, re-eligible on the next ≥8 rating.

Draws / no-contests: at this threshold, edge-case. If a draw is rated ≥8 (rare but possible — exceptional fight that didn't get a definitive result), offer both fighters with no default selection.

### 6. One onboarding picker, used twice (2026-05-14)

The onboarding follow picker is a single component, deployed in two contexts:
- **New accounts**: shown automatically after registration / email verification, before first landing on the main app.
- **Existing accounts (~2,000 legacy users + current ~100 active)**: shown **once**, framed as a feature-launch announcement on next app open: *"New: follow fighters and we'll notify you when they fight. Pick a few to get started."*

Same component, same UX, same engagement tracking (`FollowSource = onboarding` regardless of whether the user is new or existing). Simpler than maintaining a separate re-onboarding email flow; also catches users who never enabled marketing email permissions.

### 7. Picker grid: ~80 fighters, manually curated, UFC-heavy (2026-05-14)

**Total: ~80 fighters**, **fully manually curated** by Mike via the admin panel, **updated as needed** (not on a fixed schedule).

Approximate per-promotion allocation:
- **UFC**: ~50 (heaviest weight — UFC is the gravitational center of mainstream fight fandom)
- **BKFC**: ~15
- **PFL**: ~3
- **ONE / MVP / Karate Combat / Dirty Boxing**: ~10 total across these (a few each)
- **RIZIN**: 0 (limited western recognition)

Cross-promotional fighters (e.g. Mike Perry — MVP + BKFC) belong in whichever section matches their **current primary promotion in the DB**. When a fighter changes orgs, their picker section reflects the change automatically.

Search bar at top so users who already know who they want can find anyone, even outside the curated 80.

**Mechanism**: a `featuredInOnboarding` boolean column on the `Fighter` model, settable from the admin panel. Optional `onboardingPriority` integer for sort order within a section. Mike controls which 80 fighters appear and can swap them in/out anytime (e.g. after a Mike Perry weekend, bump him; if a UFC fighter retires, drop them).

## Status

- **Wave 1 (Foundation)** — ✅ Shipped 2026-05-01 to 2026-05-02. Follow API, screen, "+" affordances, scrape-time sync, walkout-warning notification, non-tracker fallback.
- **Wave 2 (Discoverability foundation + first notifications + engagement tracking)** — 🔜 In progress. Locked first-ship order: (1) universal follow button + branding pass, (2) onboarding follow picker, (3) post-rating "follow the winner?" prompt, (4) engagement tracking schema (`FollowSource` + `FollowNotificationEvent`) shipped alongside. Notification depth (day-before, morning-of, booked, scratched, spoiler-safe post-fight) follows once tracking exists.
- **Wave 3 (Discoverability + Onboarding)** — Not started. Onboarding follow picker, post-rating prompt, fighter detail page social proof.
- **Wave 4 (Cross-promotional + Buyer reporting)** — Not started. Org-change event log, signed-with-new-org notification, admin Fighter Insight + Top Movers + Free Agent Watch pages.
- **Wave 5 (Recommendation engine + Wrapped)** — Not started. Collaborative filtering, AI-tag-based style match, annual recap.

## Open questions

- What's the current avg follows per active user? (Baseline measurement — answer before any other work.)
- Is unfollow currently deleting the row or marking inactive? If deleting, this is a data-loss bug to fix before scaling.
- Where should the engagement event log live — Postgres or a cheaper analytics store (PostHog)? PostHog is wired as of 2026-05-14 ([[infra-posthog]]) — could be the right home for the dispatched/opened/clicked events, with Postgres holding the aggregate weighted score.
- How aggressive should notification rate-limiting be? A power user following 50 fighters could get 5+ notifications per night during a card. What's the cap?
- Should follow be an explicit action only, or should we auto-suggest-follow after the 3rd rating of the same fighter? (Risk: degrades signal quality. Reward: massive volume boost.)

## Dependencies on other workstreams

- **[[ai-enrichment]]** — fighter style tags, division tags, narrative tags drive recommendation surfaces and "why care" notification copy.
- **[[rewarding-users]]** — annual Wrapped recap, profile follow surfacing, fighter detail relationship card all live at the intersection.
- **Marketing** ([[project-marketing-push]], [[project-ai-marketing-plan-2026]]) — the follow dataset is also the basis for the "Press Hooks" system. Top movers in follows = stories journalists want.
- **PostHog** ([[infra-posthog]]) — likely home for engagement events.

## Anti-patterns (don't do)

- Auto-follow-everything to inflate raw counts → destroys signal value.
- Public follower-count leaderboards → invites gaming.
- Shipping notification lanes without engagement tracking → we lose the quality signal forever for everyone who got the notification before tracking existed.
- Deleting unfollow events → we lose the historical timeline.
- Streaks, "follow goals", "follower of the week" → cheapens the whole feature and signals to users that follows are a game, not an intent declaration.
- Showing the buyer-facing reports to users → the demo screen is for sales meetings, not consumer UI.
- Notifying so aggressively that users disable pushes → a turned-off push is a permanently dead data point.
- **Spoiler-revealing notifications of any kind** → many Good Fights users watch later; spoiling them in a push notification is a one-way trip to disabled pushes and an uninstall. Always frame post-fight notifications as "your fighter fought — open the app to decide if you want to watch it back." See Decisions §1.
- **Adding a 6th bottom tab for follow-fighter discovery** → embed in Upcoming Events + Profile instead. See Decisions §3.
