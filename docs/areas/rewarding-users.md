# Rewarding Users

A first-class workstream: make every interaction in the app feel like it pays off — immediately, over time, or both. Build a layered reward system that grows with the user without becoming gamified or cheap.

## North Star

Users keep coming back not because we nag them, but because the app **remembers them, reflects them back, and pays off their effort**. Every tap should feel like depositing something, not casting into a void.

## Design principles

1. **Craft, not game.** References: Letterboxd, Strava, Last.fm. Anti-references: Duolingo, Snapchat trophies, mobile-game confetti.
2. **Private stats over public leaderboards.** Removes gaming incentive entirely. A user can't profit from sock puppets or padding their own ratings.
3. **No prizes.** The reward is the data and the recognition. Adding cash/coins/items flips the calculus and incentivizes cheating.
4. **Show, don't announce.** Numbers appear in context. No popups, no "YOU WERE RIGHT" stamps.
5. **Closure on past actions.** Things you did weeks ago come back as insight. The app builds a track record *of you*.
6. **Match the dark, editorial vibe** the rest of the app has. Reward UI shouldn't look like a different app.

## Anti-patterns (don't do)

- Public leaderboards with prizes → invites sock puppeting, ranking obsession.
- Streak shame ("you broke your 12-day streak!") → Duolingo guilt-trip.
- Confetti animations, trophies, sparkles → cheapens the whole app.
- Badges for arbitrary milestones with no meaning ("First 5-star review!").
- "Pro tier" gating of basic personal stats → users will resent it.

## Idea inventory

### Closure & payoff (the core moat)

- [ ] **Hype accuracy / closing the loop** — *every hype tap becomes a bet that pays off when the fight ends.* Personal stat: "Hype accuracy 78%". Hot takes list on profile. Compute against community average **excluding the user's own rating** so padding doesn't help.
- [ ] **Post-fight closure card** — when the rated fight completes, the card grows a quiet line: *"Hype 8 · Community 7.4"*. No badge, no celebration.
- [ ] **Closure-loop enrichment (AI tags)** — *"This was a 'tactical chess match' — community usually rates these 6.4, this one landed at 8.1."* Pulls from [[project-ai-enrichment-workstream]].
- [ ] **Anniversary surfacing** — *"1 year ago today you rated UFC 297."* Quiet, optional, opt-out.

### Immediate gratification (the dopamine hit)

- [x] **#4 Hype community modal** — when user taps hype, show community distribution histogram with their tick lit, "you're 2 above the room", 1 top comment from same-hype users. **SHIPPED 2026-05-15** as a post-Done "Hype submitted!" reveal modal with a glowing bar for the user's tick + plain-English comparison line. See `HypeRevealModal.tsx`.
- [x] **Rating community modal** — same pattern for completed-fight ratings. **SHIPPED 2026-05-15** as the "Rating submitted!" reveal modal. See `RatingRevealModal.tsx`.
- [ ] **Haptic + sound polish** — satisfying micro-feedback on rating tap.
- [ ] **One-tap rating from notification** — push lets you rate without opening app.

### Identity / self-understanding

- [ ] **Fan DNA personality engine** — "You over-hype rematches by 1.4. Most accurate on PFL cards. Love bantamweight wars." Built on metadata + AI tags. Gated behind N ratings (~25). Hype accuracy folds in as one trait inside Fan DNA, not a separate engine. See [[project-ai-enrichment-workstream]].
- [ ] **Predicted favorite fighter** — *"Based on your ratings, your favorite is X."* Inferred from rating patterns, hype scores, follows.
- [ ] **Style match recommendations** — *"If you loved fight X, you'll probably love fight Y."*
- [ ] **Fan resume page** — Strava-style athlete profile but for fight fans: total fights rated, average rating given, hottest take, etc.

### Discovery / utility (rewards through usefulness)

- [ ] **"Your card" sort order** — day-of-card, surface fights sorted by user's own hype. Reminders aligned to walkouts.
- [ ] **"Your kind of fight" filter** — discover upcoming cards filtered to user's Fan DNA.
- [ ] **Recommendations feed** — "fights you'll probably love this week" based on past ratings + AI tags.
- [ ] **Skip-if-hype-under-X filter** — prelim-skipping for users who only want main cards.

### Recognition (visible without being braggy)

- [ ] **Milestone moments** — quiet acknowledgement at 100/500/1000 ratings. Not a popup; a profile line that gains a quiet tier indicator.
- [ ] **Hot take recognition** — outlier-right calls get a small italic "hot take" tag near the fight. List on profile.
- [ ] **Early rater** — first to rate a fight gets a quiet marker (not a leaderboard).
- [ ] **First-100 club** — implicit recognition for users who joined before [date]. Profile-only.

### Social (without leaderboards)

- [ ] **Friend follow + side-by-side** — see friends' hype/ratings on the same fight. No ranking, just comparison.
- [ ] **Same-hype comments surfaced** — when you rate hype 8, see what other 8-raters said.
- [ ] **Comment kudos** — light upvote/agree signal on reviews. Not karma-farming, just acknowledgement.
- [ ] **Tribe identification** — *"You're in the 'War Crowd' — high-hype, high-payoff fans."* Soft cohort labels.

### Retrospection

- [ ] **Weekly recap** — *"This week you rated 4 fights, called 2 hot takes, your top match: X."* Email or in-app card.
- [ ] **Annual "Hype Wrapped"** — Spotify-style year-in-review. Shareable, screenshottable, organic Reddit growth.
- [ ] **Personal stats over time** — *"You've been more bullish this year"* / *"Your hype DNA shifted toward grappling."*

### Sharing (rewards through identity expression)

- [ ] **Shareable rating card** — generate an image of your rating + hot take, ready for IG/Twitter/Reddit. Light branding.
- [ ] **Share-your-Wrapped** — annual recap formatted for social sharing.
- [ ] **Profile share link** — public-but-quiet profile URL.

### Onboarding hooks

- [ ] **First-rating callback** — *"Welcome — your first rating just joined the data. Watch for it after fight night."* Sets expectation for closure-loop payoff.
- [ ] **Sample Fan DNA** — show what their DNA *will* look like after N ratings, to motivate the climb.

## Sequencing (current plan)

**Wave 1 — immediate dopamine (complete)**
- ✅ Plan drafted in this doc.
- ✅ #4 hype community modal — shipped 2026-05-15.
- ✅ Rating community modal — shipped 2026-05-15.

**Wave 2 — the moat (closure loop)**
- ✅ Hype accuracy backend — shipped 2026-05-15 (community-avg-excluding-self, floor 5 ratings, buckets `spot_on` / `close` / `off` / `way_off`, hot-take = extreme + small delta).
- ✅ Profile accuracy stat — shipped 2026-05-15 (`Hype vs Outcome` SectionContainer on profile).
- ✅ Full-screen hot takes list — shipped 2026-05-15 as part of `hype-accuracy` screen.
- 📋 Post-fight closure line on fight cards — **deferred**. Iterated through ~5 on-card variants; all violated the user's clarity rule (every on-card variant required parsing). Revisit only if a way emerges that doesn't compromise card clarity.
- 📋 AI-tag-aware row copy — depends on AI enrichment Phase 1.

**Wave 3 — identity**
- Fan DNA personality engine (needs AI tags from [[project-ai-enrichment-workstream]] Phase 1).
- Fan resume profile page.

**Wave 4 — retrospection & social**
- Weekly recap.
- Annual "Hype Wrapped".
- Friend compare.

## Gaming concerns & mitigations

(From the 2026-05-14 conversation that birthed this workstream.)

| Attack vector | Risk | Mitigation |
|---|---|---|
| User inflates own rating to match hype | Real, low effort | Compute hype accuracy against community avg **excluding self** |
| Sock puppet accounts to sway community avg | Low — math doesn't pencil out at 2K+ user scale | No prizes, no leaderboards. Email verification raises friction. |
| Padding ratings to inflate "great fight" counts on fighter pages | Mild | Cap user weight in aggregations; require N ratings before user counts toward "verified" averages |
| Streak gaming (rating without reading) | Low — no prize | Don't surface streaks too prominently; no streak-loss penalty |

**Core safety:** because there are no public leaderboards and no prizes, gaming gives the user nothing of value. They can pollute community data, but that's a separate problem that exists today without any reward system.

## Open questions

- How do we handle hype editing? Lock at walkouts? Allow until first round? (Lean: lock at walkouts — gives closure-loop a clean snapshot.)
- Should "hot take" require a confidence margin (≥3 points above/below community) or only require being right? (Lean: both — only count outliers that turned out right.)
- Do we show Fan DNA to other users (social) or keep it private? (Lean: private by default, optional share.)
- At what N ratings does Fan DNA unlock? (Lean: 25 for Tier 2 traits; Tier 1 traits surface from the first rating.)

## Decisions log

**1. No public leaderboards, no prizes (2026-05-14)**
Gaming-resistance principle. Recognition is private stats only. This is load-bearing — adding any prize/ranking changes the safety calculus.

**2. Hype accuracy computed against community-minus-self (2026-05-14)**
Removes the incentive to pad your own rating to match your hype.

**3. Fan DNA depends on AI tags, not fighter style records (2026-05-14)** *(feature renamed from "Hype DNA" 2026-05-16)*
See [[project-ai-enrichment-workstream]] decisions log §1.

## Status (2026-05-15, end of session 4)

- ✅ Workspace established (this doc + CLAUDE.md session protocol + memory entry).
- ✅ **#4 Hype community modal — SHIPPED 2026-05-15.** "Hype submitted!" reveal modal opens after Done, instant render via prefetched community stats + local vote delta.
- ✅ **Rating community modal — SHIPPED 2026-05-15.** "Rating submitted!" reveal modal, twin of the hype reveal, fires after Done on the completed-fight rating flow.
- ✅ **Hype vs Outcome (closure-loop, v1) — SHIPPED 2026-05-15.** Wave 2 opens.
  - Backend: `GET /api/auth/profile/hype-accuracy` (auth.fastify.ts). Per-user closure data: every fight the user hyped that the community has since rated (≥5 ratings excluding self). Returns headline `accuracyPct`, `totalHypedFights`, `accurateCount`, `hotTakeCount` + per-fight rows. Community avg excluding self computed by subtracting user's own rating from precomputed `Fight.averageRating × totalRatings`. Buckets: `spot_on` (<1), `close` (<2), `off` (<3), `way_off` (≥3). Hot take = userHype extreme (≥8 or ≤3) AND delta < 1.5.
  - Mobile screen: `app/activity/hype-accuracy.tsx`. Header `Hype vs Outcome`. Headline percentage + plain-English tagline. Per-fight rows labeled `You hyped 8 · Community rated 7.4` with a bucket chip (`Spot on` / `Close` / `Off` / `Way off`) and italic `hot take` tag on outlier-correct calls. Tap → fight detail.
  - Profile entry: new `Hype vs Outcome` SectionContainer on profile (`app/(tabs)/profile.tsx`) styled like `My Hype` (yellow header, flame icon). Summary card with the headline number is itself tappable, routes to the full screen.
  - Surface decision: card stays untouched. Iterated through 5+ on-card variants — all required parsing, which violated the user's clarity rule. Dedicated stats screen wins.
- 📋 Card-level closure line — deferred indefinitely unless a clarity-preserving design emerges.

### Pick up here next session

Wave 2 v1 is shipped. Three forward paths:
1. AI enrichment Phase 1 → unlocks tag-aware row copy on `Hype vs Outcome` (`Spot on a tactical chess match.`).
2. Wave 3 prep — Fan DNA personality engine (depends on AI tags from #1).
3. Stack one more lightweight Wave 1 win (haptic + sound on rating tap, one-tap rate from notification, first-rating callback for onboarding).

Live data check after shipping: confirm the endpoint returns non-empty data for `avocadomike@hotmail.com` (1234 ratings, 72 reviews — lots of historical hype to close).

## Session protocol

See `CLAUDE.md` → "Rewarding Users Sessions" for how to start a session on this workstream.
