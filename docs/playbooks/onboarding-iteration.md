# Onboarding iteration playbook

How to walk the onboarding flow over and over (hundreds of times) during the
Phase 1 polish loop, without creating a new account per run. Built 2026-06-12;
branch `claude/user-focused-pivot-l8l6mg`.

## The three loops (pick the cheapest one that tests what changed)

### Loop 1 — UI/copy iteration (~5 seconds per run, use 95% of the time)

For screen layout, copy, flow-order feedback. No account churn at all.

1. On the device: **Profile → "Replay Onboarding (dev)"** (gold row at the
   bottom; only exists in dev builds). It re-enters
   `/(onboarding)/welcome` with your current account.
2. Walk the flow, give feedback.
3. Claude edits the screens — **Expo Fast Refresh applies JS changes live**,
   usually without even leaving the screen. Replay again.

Caveats of this loop (fine for UI work):
- The rate stack **excludes fights you already rated**, so repeated full
  walks see fewer/different fights each time (pool is ~200; exhausts after
  ~7 full 30-fight runs). Cosmetic only — use Loop 2 to refill.
- Your taste profile accumulates ratings across runs (payoff screen gets
  richer, not poorer — usually what you want for judging insight copy).
- To see the **empty/"profile is forming" state**, use a freshly reset
  account (Loop 2) and rate only 1-2 fights before Continue.

### Loop 2 — clean-slate data reset (~30 seconds)

When you need the stack full again or the payoff screen back to zero.

From `packages/backend/` (dev backend must be running — see setup below):

```
npx tsx src/scripts/reset-onboarding-tester.ts --email testdev+onb0612@goodfights.app
```

- Deletes that account's ratings + follows **through the real API
  endpoints**, so fight aggregates and notification rules unwind via the
  tested code paths (never raw row deletes).
- **Hard allowlist**: refuses any email that isn't
  `testdev+<x>@goodfights.app`. It cannot touch a real account.
- Account survives; you stay logged in on the device. Then Replay.

### Loop 3 — true new-user entry path (~2 minutes, occasional)

Only for testing the **entry wiring itself** (registration → verify-email
screens → onboarding; or Google/Apple `isNewUser` routing) — the things
Loops 1-2 skip past.

- Register `testdev+onbN@goodfights.app` / `Testpass1!` (bump N each time;
  plus-addressing means infinite unique emails, all `testdev+*` resettable
  by Loop 2). These accounts stay **unverified**, which is exactly the path
  to exercise (gates were removed 2026-06-12 — rate/follow work unverified).
- Verification emails go to the goodfights.app inbox; ignore them unless
  testing the verify-email-success branch.
- Old testers accumulate as prod User rows — harmless dev artifacts; sweep
  them at release if desired.

## One-time session setup

1. **Backend** (terminal 1, from `packages/backend/`): `PORT=3008 pnpm dev`
   - Mobile dev builds call `http://10.0.0.51:3008` — the LAN IP in
     `services/api.ts`. If the dev machine's IP changed, update it there
     (see `docs/playbooks/update-app-icon.md` IP-switching section).
   - **Orphan gotcha**: if a code change "didn't take", the previous server
     may still own port 3008 serving stale code. `npx --yes kill-port 3008`,
     confirm `curl --max-time 3 http://localhost:3008/health` fails, then
     restart. (See memory `windows-dev-server-orphan-port`.)
2. **Expo** (terminal 2, from `packages/mobile/`):
   `npx expo start --port 8083 --lan`
3. Device on the same LAN, logged in as a `testdev+*` account.

## Feedback conventions (so iterations stay fast)

- Reference screens by route name: `welcome`, `rate-classics`,
  `your-profile`, `follow-fighters`.
- Screenshots welcome but optional — "rate-classics: chips too small, move
  Haven't-seen-it above Continue" is enough to act on.
- Batch small nits; flag flow-order changes separately (those need a real
  walk to re-verify).
- JS-only changes = Fast Refresh, instant. Backend changes = nodemon
  auto-restarts on save (a few seconds). Neither needs a rebuild. Only
  native-module changes would need a new dev build (none expected here).
