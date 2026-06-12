# HANDOFF — Onboarding build (identity pivot, Phase 1 objective #3)

**Date:** 2026-06-12 · **Branch:** `claude/user-focused-pivot-l8l6mg` (the Phase 1
integration branch — **NO main merges in either direction until Mike explicitly
directs; no OTA; no prod publish**). All work below is branch work.

## What this is

Build the new-user onboarding flow: the Letterboxd-style
**explain → rate a fast stack of classics → instant first-insight payoff →
follow picker** sequence. The "rate → instant insight" moment is the point of the
whole feature — a new user leaves onboarding with the app *already knowing them*.

Spec sources (read in this order):
- `docs/areas/identity-platform.md` — pillar 2 + "Phase 1 strategic objectives" §3
  (onboarding = persona seeding). Copy principles + irreversibility decisions live
  here too (private-by-default, rotating insights only, human headline / number in
  subline, spoiler-safety binds every identity surface).
- `docs/areas/follow-fighter.md` — Decisions §6 (one picker, used twice) + §7
  (~80 curated fighters, UFC-heavy, `FollowSource = onboarding`).
- `docs/daily/2026-06-12.md` — state of the data substrate (both taste axes LIVE:
  4,200 character-tagged fights + 939 archetype-tagged fighters; engine verified
  end-to-end same day).

## State when this handoff was written

**Nothing built yet.** All exploration/verification done; the design below is
ready to implement. The session that wrote this had created 4 task-list items
matching the build order below, then stopped before writing code.

## The design (settled, with verified integration facts)

### Backend (packages/backend)

**1. `GET /api/fan-dna/taste-profile` — the insight endpoint** (serves onboarding
payoff screen AND the future home above-the-fold rail).
- Add to `src/routes/fanDNA.ts` (316 lines; registered with prefix `/api/fan-dna`
  in `src/routes/index.ts` ~line 2124; uses `fastify.prisma` + `preHandler:
  authenticateUser` from `../middleware/auth` — copy the `/profile` route's shape).
- Wiring is exactly `src/scripts/taste-profile-run.ts` (the pilot runner):
  `loadTasteInputs(fastify.prisma, userId)` from
  `services/fanDNA/tasteProfile/loadInputs` → `computeTasteProfile({ userId,
  fights, fighters, rotationSalt, maxInsights })` from
  `services/fanDNA/tasteProfile`. READ-ONLY, pure engine after load.
- Query params: `?max=` (default ~8), `salt` optional; default `rotationSalt` to
  the ISO week (e.g. `2026-W24`) so copy rotates weekly but is stable within one.
- Response: `{ insights: [{key, kind, dimension, token, headline, subline,
  score}], baseline: {count, avg, tensCount}, coverage: {withCharacter, total} }`.
  Don't ship the full signature.
- Add a small in-memory TTL cache (Map keyed by userId, ~10 min, cap ~500) —
  `loadTasteInputs` loads the user's full rating history each call; fine
  per-view, not per-remount.
- **Known floor risk:** engine tunables in `services/fanDNA/tasteProfile/types.ts`
  — `MIN_N = 8`, `SCORE_FLOOR = 0.25`. A brand-new user with ~10–20 onboarding
  ratings may get few/zero insights. Evidence it can work: test@goodfights.app
  (23 ratings) → 8 coherent insights. Mitigations: (a) the rate-stack is built
  from heavily character-tagged classics so common dims accumulate fast;
  (b) the payoff screen needs a graceful "profile is forming" empty state
  (show count + avg, never filler). Do NOT relax the engine floors for v1 —
  silence > filler is a locked principle.

**2. `src/routes/onboarding.ts` (new file, prefix `/api/onboarding`)**
- `GET /rate-stack?limit=30` (auth'd): the classics stack.
  - Admin override: SystemConfig key `onboarding_rate_stack` = array of fight IDs
    (SystemConfig model: `key String @id, value Json` — same pattern as
    `blog_highlights`, see `routes/adminBlog.ts` / `routes/editorial.ts`).
  - Auto-fallback: COMPLETED fights ordered by ratings count (use `_count` on the
    ratings relation), take ~top 200, filter in JS for
    `aiPostFightTags.character` presence, diversity-pick ~30 (mix orgs/eras/
    genders so insight dims vary). Exclude fights the user already rated.
  - Return per fight: fightId, fighter1/2 {name, profileImage}, event name,
    year, org, weightClass. **NO winner/method/result — spoiler-safe.** Rating
    submission reuses the existing `POST /fights/:fightId/rate` (mobile
    `apiService.rateFight(fightId, rating)` already exists, `services/api.ts:445`).
- `GET /follow-suggestions` (auth'd): the picker grid.
  - Admin override: SystemConfig key `onboarding_fighters` = array of
    `{fighterId, priority}` (the doc's `featuredInOnboarding` column needs a
    migration — frozen on this branch; SystemConfig gives Mike the same manual
    curation without one. Note the deviation when updating follow-fighter.md;
    column can come with the release migration if still wanted).
  - Auto-fallback until Mike curates: most-followed + `isActive` fighters with a
    `profileImage`, `isChampion`/`rank` boosted, ~40 returned. Fighter model has
    NO org/promotion column (verified) — v1 returns a flat list; promotion
    grouping arrives with manual curation. Search bar uses the existing search
    endpoint so anyone outside the curated set is findable.

**3. Follow-source attribution (no migration available).**
- `UserFighterFollow` has **no `source` column** (verified — schema.prisma:918).
  Adding one = migration = frozen until release.
- Interim: `POST /api/fighters/:id/follow` (lives in `src/routes/index.ts:1480`)
  accepts optional body `{ source?: string }` → server-side
  `prisma.analyticsEvent.create({ eventName: 'fighter_followed', userId,
  properties: { fighterId, source } })` (AnalyticsEvent model exists,
  schema.prisma:1146; table is currently unused/empty — that's fine, it's
  timestamped + attributable). Mobile passes `source: 'onboarding'` from the
  picker. At release: add the real column, backfill from these events.
  **Never derive `followedAt` — `createdAt` on the follow row is the sacred
  timestamp; the analytics row is supplementary.**

### Mobile (packages/mobile)

New route group `app/(onboarding)/` (register `<Stack.Screen name="(onboarding)"
options={{ headerShown: false }} />` in `app/_layout.tsx` next to `(auth)` at
~line 139).

1. **`welcome.tsx`** — the thesis in one screen: "Good Fights learns what kind of
   fight fan you are." 2–3 short beats (rate → taste profile; follow → never miss
   them; the app pays it back). CTA "Build my fan profile" → rate-classics.
   "Skip for now" → mark complete → `/(tabs)`.
2. **`rate-classics.tsx`** — fetch rate-stack; one fight at a time (headshots,
   names, event + year). Quick 1–10 rate (simple chip row — do NOT extract the
   animated wheel from `RateFightModal.tsx`, it's modal-embedded; a fast tap row
   suits stack-rating better) + a "Haven't seen it" skip. Progress count.
   "Continue" always available; encourage ~10+ rated ("the more you rate, the
   sharper your profile"). Fire `apiService.rateFight()` per rating
   (fire-and-forget, queue failures silently).
3. **`your-profile.tsx`** — THE payoff. Call the new taste-profile endpoint,
   render insights as cards: big human headline, small stat subline (locked copy
   rule). Empty state: "Your profile is forming — every rating sharpens it" +
   their count/avg. Never show filler insights.
4. **`follow-fighters.tsx`** — suggestion grid (headshot, name, record), tap to
   select, search field, "Follow N fighters" CTA + "Skip". Submits via
   `apiService.followFighter(id, 'onboarding')` (extend the method —
   `services/api.ts:661` — to pass the source body).
5. **`services/onboarding.ts`** — AsyncStorage helpers mirroring
   `services/spoilerOnboarding.ts`: `markOnboardingPending()` (set at successful
   registration), `isOnboardingPending()`, `markOnboardingComplete()`.

**Navigation wiring (verified entry points):**
- `app/(auth)/register.tsx` — on successful registration set the pending flag,
  then continue to verify-email-pending as today.
- `app/(auth)/verify-email-pending.tsx:67` (Skip → `/(tabs)`) and
  `app/(auth)/verify-email-success.tsx:47` (auto-redirect → `/(tabs)`): both
  check `isOnboardingPending()` → route to `/(onboarding)/welcome` instead.
- Existing-user one-time picker announcement (follow-fighter §6 context b) is
  **deferred to release** — it's a launch-moment surface; note it in the doc.
- Spoiler note: the spoiler-free onboarding modal (`SpoilerFreeContext.tsx`)
  fires on first `(tabs)` mount — it will appear after onboarding completes,
  which is acceptable ordering for v1 (or suppress until post-onboarding if it
  collides visually).

## Build order + verification

1. Backend endpoints (taste-profile → onboarding routes → follow-source).
2. **tsc gate:** `npx tsc --project tsconfig.production.json --noEmit` from
   packages/backend (0 NEW errors; baseline is 0 on this branch).
3. Verify endpoints read-only against prod DB: run backend locally
   (`PORT=3008 pnpm dev` from packages/backend; `.env` carries the Render DB
   URL — run from packages/backend so Prisma auto-loads it). Mint a JWT or use a
   dev test account (`test@goodfights.app` / `Testpass1!`). Check: rate-stack
   returns 30 spoiler-safe classics; taste-profile returns avocadomike's 33
   insights (matches `packages/backend/taste-profile-avocadomike-2026-06-12-fighteraxis.out`).
4. Mobile screens + wiring. Manual test via Expo
   (`npx expo start --port 8083 --lan`) — register a fresh account
   (e.g. testdev+date@goodfights.app) and walk the full flow. **Ratings written
   during the walk are real prod writes from a test account — fine, but use a
   test account, not avocadomike.**
5. Docs: update `docs/areas/identity-platform.md` (changelog + objective #3
   status), `docs/areas/follow-fighter.md` (SystemConfig-instead-of-column
   deviation, picker shipped-on-branch status), daily doc.
6. Commit + push to `claude/user-focused-pivot-l8l6mg` ONLY.

## Standing guardrails (do not regress)

- **NO `prisma migrate dev`/`db push`/`diff`/`reset` — ever** (prod DB).
  No migrations at all on this branch; anything needing one goes in the
  release-migration list.
- **NO `new PrismaClient()`** — `import { prisma } from '../lib/prisma'` /
  `fastify.prisma` in routes.
- No leaderboards/prizes/gamification; private by default; rotating insights
  only (no frozen "you are X" label); human headline + number-in-subline;
  never-denigrating comparisons; null > guess; spoiler-safe everywhere.
- `GOOD FIGHTS - APP*.txt` in repo root contain plaintext credentials —
  untracked; don't commit them.
