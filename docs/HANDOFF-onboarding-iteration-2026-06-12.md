# HANDOFF — Onboarding iteration + verification soft-cap (2026-06-12 evening)

**Branch:** `claude/user-focused-pivot-l8l6mg` (Phase 1 integration branch —
**NO main merges in either direction; no OTA; no prod publish; no migrations**).
All work is branch work. Read `docs/playbooks/onboarding-iteration.md` and the
2026-06-12 daily doc before starting.

## State: what is BUILT and VERIFIED on the branch (3 commits today)

**`2ba8d80a` — the onboarding flow itself** (per
`docs/HANDOFF-onboarding-build-2026-06-12.md`, now complete):
- Backend: `GET /api/fan-dna/taste-profile` (ISO-week salt, 10-min input
  cache, max default 8 / cap 25); `GET /api/onboarding/rate-stack` +
  `GET /api/onboarding/follow-suggestions` (both with SystemConfig admin
  overrides `onboarding_rate_stack` / `onboarding_fighters`, spoiler-safe
  payloads); follow-source attribution: `POST /api/fighters/:id/follow`
  accepts `{source}` → `fighter_followed` AnalyticsEvent (interim until the
  real `FollowSource` column ships in the release migration).
- Mobile: `app/(onboarding)/` group — `welcome` → `rate-classics` (1-10 chip
  rows, "Haven't seen it") → `your-profile` (insight cards; "profile is
  forming" empty state) → `follow-fighters` (grid + search, submits
  `followFighter(id, 'onboarding')`). `services/onboarding.ts` AsyncStorage
  flag. Entry wiring: `AuthContext.register()` sets pending; both
  verify-email screens route pending users to `/(onboarding)/welcome`.
- Verified read-only vs prod: avocadomike taste-profile output == pilot
  runner exactly; test acct (23 ratings) → 8 insights.

**`4c41167d` — Mike's review fixes:**
- Email-verification gate REMOVED from: POST `/fights/:id/rate`,
  POST `/fights/:id/reveal-outcome`, DELETE `/fights/:id/rating`,
  POST `/fighters/:id/follow`, DELETE `/fighters/:id/unfollow`.
  (Gate stays on reviews/comments/crews.) Verified live with a fresh
  UNVERIFIED account: 201/200/200/200.
- `isNewUser` added to `/auth/google` + `/auth/apple` responses (set only on
  the user-create branch; **added to the Fastify response schemas** — don't
  forget that detail if touching them, Fastify strips undeclared fields).
  Mobile `loginWithGoogle`/`loginWithApple` route isNewUser →
  `/(onboarding)/welcome`.

**`70036dd0` — iteration harness** (Mike will walk the flow hundreds of times):
- Profile tab bottom: `__DEV__`-only "Replay Onboarding (dev)" row.
- `packages/backend/src/scripts/reset-onboarding-tester.ts` — unwinds a test
  account's ratings/follows THROUGH the real API endpoints (aggregates
  decrement correctly). Hard allowlist `testdev+*@goodfights.app` (verified:
  refuses avocadomike). Needs the local backend running.
- Playbook: `docs/playbooks/onboarding-iteration.md` (3 loops + session
  setup + the port-3008 orphan gotcha).
- Existing tester account: `testdev+onb0612@goodfights.app` / `Testpass1!`
  (unverified — intentionally), currently reset to 0 ratings / 0 follows.

## NEXT TASK (approved, not started): verification soft-cap at 50

Mike's decision (2026-06-12): unverified accounts may make up to **50
ratings and 50 hype predictions**, then verification is forced. Rationale:
capture behavior before the obstacle; cap must exceed the 30-fight
onboarding stack. Design agreed:

1. **Backend middleware** (new, in `src/middleware/auth.ts` or sibling):
   `requireVerifiedOrUnderCap(kind: 'rating' | 'hype')` —
   - verified user → pass (zero queries);
   - unverified → if the user already has a row for THIS fight
     (`fightRating`/`fightPrediction` findUnique on (userId, fightId)) →
     pass (updates never blocked);
   - else `count()` their rows; `count >= CAP` → 403 with code
     **`VERIFICATION_CAP_REACHED`** + details `{cap, count}` (distinct from
     EMAIL_NOT_VERIFIED so mobile can show the friendly prompt).
   - `const CAP = Number(process.env.UNVERIFIED_ACTION_CAP ?? 50)` — env
     override exists so a live test can use cap=3 instead of writing 50
     prod ratings.
2. **Apply to:** POST `/fights/:id/rate` (add after `authenticateUser` —
   the gate-removal comment there should be updated to mention the cap);
   the hype/prediction create-or-update endpoint(s) — **find them first**:
   grep `fightPrediction.upsert|createFightPrediction|predictedRating` in
   `src/routes/fights.ts`; they currently carry `requireEmailVerification`,
   REPLACE that with the cap middleware (this is what "ungates hype" means).
   Check for separate create vs update routes; mobile calls
   `apiService.createFightPrediction` (`services/api.ts`).
3. **Mobile handling:** `makeRequest` error path — check how error codes
   surface (it throws Error from response body; may need the code attached).
   On `VERIFICATION_CAP_REACHED` in the rate modal + hype modal, show a
   friendly CustomAlert: "You've rated 50 fights — verify your email to keep
   going" + mention the resend option on the Profile/verify screen. Keep
   onboarding rate-classics fire-and-forget silent (a brand-new account is
   ~45 ratings away from the cap anyway).
4. **Test live** (local backend vs prod DB, per playbook): register fresh
   `testdev+capN@goodfights.app`, set `UNVERIFIED_ACTION_CAP=3` in the env
   for the LOCAL run only (don't commit), rate 3 → 4th returns the new code;
   same for hype; update of an existing rating at-cap still 200. Reset with
   the tester script after.
5. **Gates:** backend `npx tsc --project tsconfig.production.json --noEmit`
   = 0; mobile `npx tsc --noEmit` = 0 NEW (baseline ~82, none in touched
   files). Docs: daily + identity-platform changelog. Commit + push to the
   branch ONLY. The daily doc's "Open design question" paragraph should be
   updated to "decided: 50/50, shipped".

## After that: the iteration sessions themselves

Mike drives Loop 1 (replay) on device; Claude edits screens against feedback
(Fast Refresh). Reference screens by route name. Backend must run locally
(`PORT=3008 pnpm dev` from packages/backend; mobile dev builds call
`10.0.0.51:3008`). **Port-orphan gotcha:** if a change "didn't take",
`npx --yes kill-port 3008`, confirm `/health` dead, restart — see memory
`windows-dev-server-orphan-port`.

## Release-checklist items parked on this branch (do NOT do now)

- Real `FollowSource` column + backfill from `fighter_followed` analytics
  events (migration — release time).
- `featuredInOnboarding` column if still wanted over SystemConfig.
- Existing-user one-time onboarding walkthrough (launch surface — Mike
  confirmed every existing user gets it at launch).
- Sweep accumulated `testdev+*` accounts.

## Standing guardrails

- NO `prisma migrate dev`/`db push`/`diff`/`reset` — ever. No migrations on
  this branch at all.
- NO `new PrismaClient()` in app code — `fastify.prisma` / `lib/prisma`
  singleton (one-off exit-immediately scripts are the only tolerated
  exception, and the tester script already imports the singleton).
- No leaderboards/gamification; silence > filler (don't relax engine
  floors); spoiler-safe everywhere; never derive `followedAt`.
- `GOOD FIGHTS - APP*.txt` in repo root = plaintext credentials, untracked —
  never commit.
