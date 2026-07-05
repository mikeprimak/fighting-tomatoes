# HANDOFF — Home mirror: built, device-tested, mid-design-iteration (2026-07-03)

> **2026-07-04 update:** voice-guide pass + Fan DNA revamp shipped on this
> branch (see `docs/daily/2026-07-04-pivot.md`): taste copy pools rewritten in
> the `Good_Fights_Voice_Guide.docx` voice, mobile + web Fan DNA screens
> rebuilt on taste-profile insights + identity noun (personalityType removed
> from all consumer surfaces), sidebar/onboarding/rec-reason kill-list sweep.
> NOT device-walked. Next-steps list below still stands otherwise (un-hype
> gate bug, prelim-position insight, coverage). Mike's round-1 design verdict
> STILL pending — ask first.

**Branch:** `claude/user-focused-pivot-l8l6mg`, worktree `C:/Users/avoca/fight-mobile-app-pivot`
(Phase 1 integration branch — **NO merges to main, no OTA, no prod publish, no migrations**).
Branch was synced with main earlier today (merge `1b1c5b2f`) — **0 behind** as of this handoff;
re-sync main → branch ~weekly. Read `docs/daily/2026-07-03.md` for the full day
(pivot evaluation → main sync → mirror build → device iteration).

## State: BUILT + ON-DEVICE VERIFIED

**Home mirror (Phase 1 objective #1)** shipped in `7dd666fb` + an uncommitted-at-the-time
iteration pass (committed with this handoff):

- **Backend `GET /api/home/mirror`** (`src/routes/homeMirror.ts`, prefix `/api/home`):
  urgency rail — liveEvents / todayEvents (events with a hyped fight or followed
  fighter) + pinnedFights (next ~8 days, cap 10 server-side, followed-first per day).
  Spoiler-safe. Gotchas already fixed: Prisma to-one filters need `is:` wrapping;
  Event's field is **`eventStatus`**, not `status`.
- **Backend `identityLabel`** on `GET /api/fan-dna/taste-profile`
  (`services/fanDNA/tasteProfile/identityLabel.ts`): rotating noun for the greeting
  pill ("KO Lover", "Tension Watcher", "Cardio Junkie"). ~30 curated nouns +
  "{Phrase} Lover" fallback for plain-positive kinds; null = hide (silence > filler).
  **Respects the locked signature decision** (rotating, never frozen) — Mike asked for
  noun-form on 2026-07-03 and it fit the locked model without re-scoping.
- **Mobile `components/HomeMirror.tsx`** rendered at the top of Home (signed-in only):
  greeting + gold identity pill → "This Week" section (LIVE NOW card, TONIGHT card,
  **max 2 pinned fight rows** with overlapping headshots + 🔥hype / ★Following badges,
  "+N more" overflow line) → "MORE ABOUT YOU" rail (3 daily-salted insight cards,
  gold left accent) → hairline rule before the old content feed. Logged-out unchanged.

**Verified on Mike's device (Expo Go)** with his real account: real insights render;
his pinned UFC 329 fights show. Taste engine status confirmed live: **12 ranked
insights** for avocadomike (1,589 rated / 1,006 character-tagged = 63% coverage).
Runner: `npx tsx src/scripts/taste-profile-run.ts --email avocadomike@hotmail.com --max 25`.

## Mike's design verdict so far

"Pretty lame / raw — needs a lot of design iterations." Round 1 shipped (pill, 2-pin
cap, section titles, headshots, rail heading, divider) — **he had not yet given his
read on round 1 when the session ended.** Start the next session by asking.

## The dev loop that WORKS (hard-won today — don't rediscover)

1. Backend: `cd packages/backend` (pivot worktree) then
   `set -a && source <(tr -d '\r' < .env) && set +a && PORT=3008 pnpm dev`
   — the server loads NO dotenv itself; plain `pnpm dev` crashes with
   "DATABASE_URL not found". The worktree's `.env` was copied from the main
   worktree 2026-07-03 (gitignored, stays local).
2. Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`. Mike uses
   **Expo Go** on the phone (not a dev build). exp://10.0.0.51:8083.
3. **🔥 Firewall gotcha (the "endless spinner"):** Windows had reclassified the
   Wi-Fi ("Primak 2") as a **Public** network → the "Node.js JavaScript Runtime"
   inbound rule is **Block on Public / Allow on Private** → phone can't reach
   Metro or the backend, zero log activity. Fix:
   `powershell Set-NetConnectionProfile -Name 'Primak 2' -NetworkCategory Private`.
   Check first with `Get-NetConnectionProfile`. If spinner + silent Metro log → this.
4. Don't `curl http://localhost:8083` — it triggers a WEB bundle that wedges Metro.
   Health-check Metro via `http://10.0.0.51:8083/status` only.
5. Port orphans still apply: `npx --yes kill-port 3008 8083` before starting.
6. **Login:** Google sign-in doesn't work in Expo Go. A **temp password was set on
   avocadomike (2026-07-03, Mike-approved; he knows it)** — Google stays linked.
   Tester acct `testdev+onb0612@goodfights.app` / `***REMOVED***` (unverified, 34 ratings).

## Next steps (in rough priority)

1. **Design iteration on the mirror with Mike on-device** (Fast Refresh loop). His
   specific asks so far are all shipped; get the round-1 verdict and keep going.
2. **Un-hype gate bug (found 2026-07-03):** DELETE `/fights/:id/prediction` still
   carries the hard email-verification gate while create is soft-capped — an
   unverified user can hype but can't un-hype. Align it with the 50-cap middleware.
3. **"You like prelims" card-position taste** — needs NO AI tags (derive from
   `orderOnCard`/`cardType` on rated fights). Cheap new insight dimension; Mike
   explicitly wants wider insight variety.
4. Insight coverage: ~580 of avocadomike's rated fights still untagged (source data
   thin) — more coverage → more than 12 insights. Also more identity nouns as new
   tokens surface (curated map in `identityLabel.ts`).
5. Earlier parked items: onboarding round-3 device-verify; existing-user one-time
   walkthrough at launch; release checklist in
   `docs/HANDOFF-onboarding-iteration-2026-06-12.md`.

## Standing guardrails

- NO `prisma migrate dev`/`db push`/`diff`/`reset`; no migrations on this branch.
- NO `new PrismaClient()` — `fastify.prisma` / `lib/prisma` singleton, scripts too.
- Silence > filler (engine floors AND UI: no label → no pill). Spoiler-safe on every
  identity surface. No leaderboards/gamification. Never derive `followedAt`.
- Commit to the branch ONLY; state branch + contents before each commit.
