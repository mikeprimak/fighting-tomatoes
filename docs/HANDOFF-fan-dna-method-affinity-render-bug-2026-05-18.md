# Handoff — Fan DNA method-affinity cards not rendering on mobile (2026-05-18)

End-of-session pickup. Three pieces of work landed cleanly today; one stubborn bug remains and needs fresh eyes.

## TL;DR

**Open bug**: For `avocadomike@hotmail.com`, the Fan DNA full-screen page (`/activity/fan-dna`) does NOT render the two `method-affinity` cards ("Knockout fan" + "Decision sceptic"), even though the API at `/api/fan-dna/profile` is **verified to return them** in the response. Other new traits from the same ship (`weight-class-affinity` Middleweight watcher, `main-event-watcher` Full-card watcher) DO render. Two OTAs and a backend deploy later, still missing.

Mike's words: *"my feeling is this is not a cache issue, those are actually very rare with me — its likely something else"*.

## What shipped this session (2026-05-18, afternoon)

| Commit | What |
|---|---|
| `5ceaa86` | Three new Fan DNA traits: `weight-class-affinity`, `main-event-watcher`, `method-affinity` |
| `488096a` | Docs |
| `d2ca499` | Stakes bullets in `UpcomingFightModal` (later reverted in `ee8d7e8`) |
| `ac7c331` | Docs |
| `9472e5b` | Unique React keys (`${traitId}-${i}`) on both fan-dna full-screen + profile section; stakes block added to `UpcomingFightDetailScreen` |
| `30a1441` | `alignSelf:'stretch'` on modal stakes container (fixed empty-bullets bug); `RefreshControl` on fan-dna page |
| `ee8d7e8` | Reverted: removed stakes from `UpcomingFightModal` per Mike's call. Detail screen retains them. |

All committed to `main`. Render auto-deployed `9472e5b` at 16:07 UTC (verified via GH deployments API). Latest mobile OTAs:

- iOS 2.0.1 / Android 1.0.0: `6a23a76c-...` / `019e3c01-...` (commit `ee8d7e8`, modal revert)

## Verified working

- **Three new traits compute correctly.** Probe (`packages/backend/scripts/probe-new-affinity-traits.ts`) confirms hasFloor + correct values for avocadomike on all three new traits. TraitValue rows exist in the Render DB.
- **Stakes on `UpcomingFightDetailScreen`** — Mike confirmed seeing "WBC world championship" bullet on the detail screen.
- **Stakes on modal width fix** — Mike confirmed bullets render with text after `alignSelf:'stretch'` fix. Then asked to remove the modal block entirely — done.
- **Live API for avocadomike returns all 10 cards** including Knockout fan + Decision sceptic. Verified by minting a JWT with prod `JWT_SECRET` and hitting Render three times in a row — same response each time.

## Unverified / open bug

- Mike's mobile app shows Middleweight watcher and Full-card watcher (new traits) but NOT Knockout fan or Decision sceptic.
- Mike says he has waited for the OTA + Render deploy to propagate, and pull-to-refresh on the page didn't fix it. He's confident it's **not a cache issue**.
- Bug is reproducible-from-his-end but I never had eyes on his rendered screen, and I couldn't reach his JWT to verify the response his app actually receives.

## Key files / code paths

### Trait code (backend)

```
packages/backend/src/services/fanDNA/traits/
  weight-class-affinity/{trait.ts, copy.ts}   ✓ visible to Mike
  main-event-watcher/{trait.ts, copy.ts}       ✓ visible to Mike
  method-affinity/{trait.ts, copy.ts}          ✗ NOT visible to Mike (the bug)
```

`method-affinity` emits **two** TraitProfileSummary cards from one `profileSummary` call: favorite (Knockout) and disliked (Decision). Both `traitId: "method-affinity"`, different `headline`, `body`, `primaryStat`. The endpoint flattens the array into the cards response.

### Endpoint

`packages/backend/src/routes/fanDNA.ts:194` — `GET /api/fan-dna/profile`. Walks traits with profileSummary, lazy-recomputes stale/missing rows, calls profileSummary, flattens arrays, sorts by weight desc. No filtering by traitId.

### Mobile rendering

```
packages/mobile/app/activity/fan-dna.tsx       ← full-screen page Mike's testing on
packages/mobile/app/(tabs)/profile.tsx:1215    ← profile section (top 2 cap)
packages/mobile/services/api.ts:1618           ← getFanDNAProfile typed wrapper
```

Both use `key={`${card.traitId}-${i}`}` after the 9472e5b fix. Both render every card in `cards.map`. No filter, no slice except the profile section's `slice(0, 2)`.

## What the live API actually returns for avocadomike

Verified by minting a JWT locally with prod `JWT_SECRET`:

```
count: 10
  w90  [trailblazer]           Trailblazer
  w80  [hype-accuracy]         Hype vs Outcome
  w78  [org-affinity]          UFC mainstay
  w76  [org-affinity]          UFC hype fan
  w74  [weight-class-affinity] Middleweight watcher
  w73  [method-affinity]       Knockout fan        ← Mike doesn't see
  w65  [main-event-watcher]    Full-card watcher
  w60  [hype-bias]             Hype runs hot
  w60  [method-affinity]       Decision sceptic    ← Mike doesn't see
  w35  [rating-bias]           Rating calibration
```

Response is stable across three back-to-back calls. No instance-flap.

## Hypotheses to test next

### H1 — Mobile is on an older bundle than I think

Mike confirmed seeing the detail-screen stakes (added in `9472e5b`), so the bundle includes that change. But the key fix is in the SAME commit. If detail screen works, key fix should too.

**Test**: Have Mike open dev menu and check EAS Update bundle SHA. Compare to `ee8d7e8`. If older, force-pull. (See `eas-cli` runtime info.)

### H2 — Response shape differs from what avocadomike's actual JWT returns

I minted a JWT with prod `JWT_SECRET` — but maybe his real session token returns a different response. Some preHandler middleware could filter cards by user/role.

**Test**: From Mike's device, add a temporary `console.log(JSON.stringify(data.cards.map(c => c.traitId + ':' + c.headline)))` after `apiService.getFanDNAProfile()` returns in `fan-dna.tsx`. Show him the log via React Native debugger. Confirms what his app actually receives.

### H3 — A specific value in the response crashes silently

The Knockout fan body contains "—" (em dash, U+2014). Full-card watcher also has em dash → renders fine. So em dash alone isn't the problem. But maybe the combination of `primaryStat: "+0.6"` (leading +) or `"-0.6"` (leading -) plus em-dash body triggers something.

**Test**: Temporarily strip + / − from primaryStat in `method-affinity/trait.ts` `profileSummary` and re-deploy. If cards appear → known render path is failing on the special chars.

### H4 — React Query is silently dropping array elements with duplicate `traitId`

We fixed the **render-time** key collision, but maybe there's an earlier de-dup somewhere — in a normalized cache, in `react-query`'s internal data structure, or in a custom interceptor. Worth grepping.

**Test**: `grep -r "traitId" packages/mobile/app packages/mobile/services packages/mobile/components` and look for any filter/uniq logic. The `getFanDNAProfile` wrapper is dead-simple passthrough — no transform — so this would have to be elsewhere.

### H5 — Stale TraitValue rows on Render with WRONG values

The probe wrote rows. The endpoint lazy-recomputes if stale or version-mismatch. Maybe Render's version check is wrong AND the stored value disagrees with code expectations.

**Test**: Manually delete avocadomike's method-affinity TraitValue row (force recompute on next request). See `packages/backend/scripts/check-method-value.ts` for the row inspection pattern. Then have Mike pull-to-refresh.

```ts
await prisma.traitValue.deleteMany({
  where: { userId: '3c4a099c-ef5d-4382-8d8e-09e3af704c13', traitId: 'method-affinity' },
});
```

### H6 — Bundle was built before method-affinity, never refreshed

The trait code is on the backend, not the mobile bundle. The mobile only renders what the API returns. So this hypothesis doesn't apply.

But! What if a CACHED earlier response is being served somehow? React Query has both `staleTime` (default 5min set in `app/_layout.tsx:57`) and a longer `gcTime`. The pull-to-refresh I added in `30a1441` should bypass both. Mike confirmed PTR didn't help.

## Code paths I've already ruled out

- ✗ Backend not deployed (verified Render serves `9472e5b` via GH deployment events API)
- ✗ TraitValue rows missing (DB shows row for avocadomike, hasFloor=true, value correct)
- ✗ profileSummary returning null (simulated locally via `simulate-fandna-profile` pattern — returns 2 cards)
- ✗ Endpoint filters method-affinity (no filter exists)
- ✗ React key collision (fix shipped in `9472e5b`)
- ✗ Card body em dash chars (Full-card watcher renders fine with same chars)
- ✗ Slice/limit on full-screen page (no slice)
- ✗ Modal stakes (Mike confirmed working, then removed per his call)

## Quickest verification path on pickup

1. Confirm Mike's bundle SHA matches `ee8d7e8` — if not, force OTA.
2. Have Mike add a temporary one-line log in `fan-dna.tsx` that dumps cards to a `<Text>` on screen (no debugger needed).
3. If the log shows 10 cards but only 8 render → it's a render bug, look at H3.
4. If the log shows 8 cards (no method-affinity) → it's a fetch/cache bug, look at H2 / H5.

## Files / scripts that may help

```
packages/backend/scripts/
  probe-new-affinity-traits.ts          ← runs batchCompute for all 3 new traits, dumps cards
                                          (committed in 5ceaa86)

  (deleted but easy to recreate from history:)
  check-method-value.ts                  ← dump TraitValue row for one user
  simulate-fandna-profile.ts             ← run the endpoint code path locally
  mint-and-check.ts                      ← mint JWT for user, call live API

JWT_SECRET is in packages/backend/.env (verified local matches prod).
```

To mint a JWT for any user:

```ts
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv'; dotenv.config();
const token = jwt.sign({ userId: '<uuid>' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
```

avocadomike user ID: `3c4a099c-ef5d-4382-8d8e-09e3af704c13`.

## Mike's testing context

- Test account: `avocadomike@hotmail.com` (1234 ratings, full data, all 3 new traits hit floors)
- Earlier accounts that hit floors per probe: `cry.hagen@mailbox.org`, `kevinsartori@gmail.com`, `dcookmeyer89@gmail.com`
- iOS runtime 2.0.1 + Android runtime 1.0.0 (per app.json + memory)
- 2 app restarts required to apply OTA (per `lesson_eas_update` style memory)

## What's known about Mike's preferences (from memory)

- Be terse, skip schedule offers and tangents
- Don't suggest stopping mid-session
- Always ship the full pipeline (commit + push + OTA on mobile changes)
- Ops decisions: one recommendation, no menus
- Marketing tasks need handholding, but coding tasks don't
- Two dataset fields lie (`lesson_dataset_aggregates_dishonest`)
- Weight class + method are recently-collected on fights (relevant for trait coverage; not the bug here since avocadomike's data is rich)

## Session task summary (from /tasks)

1-10 all completed; the open work tracked outside the task list is the method-affinity render bug captured above.

## What NOT to do

- Don't blame React Query cache without proof. Mike explicitly said it's not a cache issue and pull-to-refresh didn't help.
- Don't ship more OTAs without first confirming Mike's actual bundle SHA and on-screen cards.
- Don't add more traits or expand scope. Close this loop first.

## Pickup recommendation

Start with H2 — add a one-line on-screen debug dump of `data.cards.length` + traitIds so Mike can tell you what HIS app actually receives. Two OTAs and three "test this" requests in, this is the cheapest path to knowing whether it's fetch-side or render-side.
