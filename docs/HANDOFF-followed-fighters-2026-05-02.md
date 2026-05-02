# Handoff: Followed Fighters screen — known issues 2026-05-02

The Followed Fighters screen (`packages/mobile/app/followed-fighters.tsx`) has been reworked over several iterations today. Multiple bug reports remain open. **The user's stated bar is "basic modern app behavior" — tap +, fighter appears in My list; tap toggle off, fighter goes away. No fades, no top-of-list pop.**

This doc is the current state, what's known broken, what's known fragile, and the suspect code paths. Read it cold before changing anything.

---

## What the screen does

Two sections in one ScrollView:
1. **Most Followed on Good Fights** — horizontal carousel of top-followed fighters (server endpoint `/api/community/top-followed-fighters`). Each card has a circular **+** badge.
2. **My Followed Fighters** — vertical list of fighters the user follows (server endpoint `/api/fighters/followed`). Each row has a Switch toggle to unfollow.

Subline above the My list: *"You will receive a notification before they fight."*

---

## The state machinery (today's version)

```ts
const [localUnfollows, setLocalUnfollows] = useState<Set<string>>(new Set());
const [justFollowed,   setJustFollowed]   = useState<Map<string, TopFollowedFighter>>(new Map());
```

- **`localUnfollows`** — fighter IDs the user has just toggled OFF in the My list. Used to control the Switch's visual state without waiting for a refetch. Cleared on `useFocusEffect`.
- **`justFollowed`** — fighter IDs the user just tapped + on in the carousel, mapped to the carousel item data so we can synthesize a My-list entry without waiting for the network round-trip. Cleared by a `useEffect` once the server's followed list contains the ID. **Not cleared on focus** (intentional — would wipe in-flight optimistic adds).

### How `fighters` (the rendered My list) is built
```
serverFighters = data?.fighters || []
optimisticEntries = justFollowed.values().map(synthesize FollowedFighter shape)
fighters = [...optimisticEntries, ...serverFighters minus optimistic IDs]
```

### How `topFollowed` (the rendered carousel) is built
```
followedIdSet = ids in `fighters` minus localUnfollows
topFollowed = topFollowedData filtered by !item.isFollowing && !followedIdSet.has(id)
```

So a tapped-+ carousel card vanishes on the same render because its ID lands in `followedIdSet` via the optimistic `justFollowed` entry.

### Mutations (declared in screen, used by Switch + carousel +)
- `followMutation` — `apiService.followFighter`. `onSuccess` calls `refetch()` + `refetchTopFollowed()`.
- `unfollowMutation` — `apiService.unfollowFighter`. `onSuccess` now also calls `refetch()` + `refetchTopFollowed()` (added today).

The carousel **+** is a plain `TouchableOpacity` — **not** the shared `FollowFighterButton` component. It calls `handleCarouselFollow(item)` which seeds `justFollowed` and fires `followMutation`. We bypassed `FollowFighterButton` because the user reported the My list staying empty after tapping its + (suspected: that component invalidates the query but the screen's `useQuery` wasn't refetching for reasons we never confirmed).

---

## Today's commit train (newest first)

| SHA | What |
|---|---|
| `5ad88c4` | `handleCarouselFollow` now clears the fighter's ID from `localUnfollows` before seeding `justFollowed`. Fixes the "+ → toggle off → + again leaves toggle stuck OFF and fighter showing in both lists" bug. Verified by user. |
| `6a6ac8e` | Removed `disabled` from Switch (was blocking unfollow taps while followMutation was in-flight). Unfollow now also drops from `justFollowed`. `unfollowMutation.onSuccess` refetches followedFighters. |
| `5e08c0f` | Replaced FollowFighterButton on carousel with inline + button. Added `justFollowed` Map for instant My-list insertion. |
| `00b8283` | Reverted optimistic / fade-out / top-of-list machinery (pre-`5e08c0f`). |
| `cafd71a` | (in the reverted version) Loading/error states only when myFollowsList empty; useFocusEffect no longer wipes optimistic state. |
| `34c9f38` | (in the reverted version) Animated.View fade-out on carousel + top-of-list pop. |
| `401a602` | Added `suppressToast` prop to FollowFighterButton; carousel uses it. |
| `40182eb` | Backend `/api/fighters/followed` returns `followerCount` per fighter; carousel filter excludes already-followed. |

All shipped via EAS Update to `production` (Android runtime 1.0.0, iOS runtime 2.0.1). **Two app restarts to apply.**

---

## What we KNOW works

- Carousel hides fighters the user already follows (server `isFollowing` flag + local `followedIdSet`).
- My list shows follower count under each name (backend was extended to return it).
- "Following" toast no longer appears on the carousel (suppressToast on the FollowFighterButton — though the button is no longer used here, the prop also covers the hype/rating modals path if we ever go back to it).
- Tap + in carousel → fighter appears in My list on the same render (verified by user 2026-05-02).
- Subline reads *"You will receive a notification before they fight."* (no "15 minutes").
- **+ → toggle off → + again** for the same fighter: My list shows toggle ON immediately, carousel removes the fighter, no double-display. Verified by user 2026-05-02 after `5ad88c4`.

---

## What is BROKEN or UNVERIFIED

User reports "still issues" after `6a6ac8e` (no specifics given). Likely candidates:

### 1. Toggle on a just-followed (optimistic) entry — UNVERIFIED after `6a6ac8e`
User's last concrete report: *"if I tap the toggle in my list to remove a fighter nothing happens. the toggle doesn't move."*

Diagnosed cause: `disabled={unfollowMutation.isPending || followMutation.isPending}` was blocking the tap because `followMutation` was still in flight from the carousel +. **Fix shipped in `6a6ac8e`** but the user has not confirmed.

If still broken, suspect:
- React Native `Switch` not re-rendering with new `value` prop. Try `key={fighter.id + (isFollowing ? '-on' : '-off')}` to force remount.
- `handleToggleFollow` may not be called at all — wire a `console.log` and ship a debug build.
- The fighter row showing the toggle is the *optimistic* one (synthesized in `optimisticEntries`); maybe React Native's Switch behaves oddly when the component identity is unstable across renders. Investigate by checking whether the row's `key` is stable.

### 2. Race: tap + then immediately tap toggle off
Sequence:
1. `handleCarouselFollow` — `setJustFollowed.set(id)`, `followMutation.mutate`
2. `handleToggleFollow(id, true)` — `setLocalUnfollows.add(id)`, `setJustFollowed.delete(id)`, `unfollowMutation.mutate`
3. `followMutation.onSuccess` lands first → `refetch` → server returns the fighter (because the follow was committed before the unfollow)
4. `unfollowMutation.onSuccess` lands → `refetch` → server returns empty
5. Visual state should converge but there may be a moment where the row appears with the toggle OFF before disappearing.

Acceptable per existing toggle-off-keeps-row-visible behavior, but worth checking.

### 3. Multiple rapid carousel + taps
Each tap fires its own `followMutation.mutate(id)`. `useMutation` in TanStack Query only tracks the **latest** call's lifecycle on `isPending` — earlier in-flight calls still run, but you can't cleanly track per-fighter pending state. We're not blocking rapid taps anymore (`disabled` removed), so this should work, but if the server is slow some `refetch` ordering may surprise.

### 4. The QueryClient defaults are aggressive
`packages/mobile/app/_layout.tsx`:
```ts
staleTime: 5 * 60 * 1000,
gcTime: 10 * 60 * 1000,
refetchOnWindowFocus: false,
refetchOnMount: false,
refetchOnReconnect: false,
```

Stale data lingers. `invalidateQueries` should still trigger refetch on active queries, but if anything is silently swallowing the refetch, this is a place to add a console log.

### 5. We are bypassing `FollowFighterButton` here
The shared component (`packages/mobile/components/FollowFighterButton.tsx`) is still used on hype/rating modals, completed fight modal, etc. If a future change updates that component's behavior (e.g., adds a toast, changes optimistic logic), the followed-fighters carousel will not pick it up. Document this divergence clearly to whoever touches either side.

---

## Files

| File | What |
|---|---|
| `packages/mobile/app/followed-fighters.tsx` | The screen — all state machinery, mutations, both render sections. |
| `packages/mobile/components/FollowFighterButton.tsx` | Shared follow/unfollow button (used on hype/rating modals, completed fight modal, fighter detail). Has a `suppressToast` prop we never ended up needing here. |
| `packages/backend/src/routes/index.ts` | `/api/fighters/followed` — extended today to attach `followerCount` per fighter. |
| `packages/backend/src/routes/community.ts` | `/api/community/top-followed-fighters` — already returned `followerCount` and `isFollowing`. |
| `packages/mobile/services/api.ts` | `followFighter`, `unfollowFighter`, `getFollowedFighters`, `getTopFollowedFighters`. |
| `packages/mobile/app/_layout.tsx` | QueryClient setup with the aggressive defaults noted above. |

---

## Test accounts to repro

- `babyessentialsco1@gmail.com` — used by user to repro empty-list-stuck-after-tap on 2026-05-02. Should have zero followed fighters or close to it.
- `avocadomike@hotmail.com` — has hundreds of follows; useful for the inverse case (My list never empty).

---

## Suggested next steps

1. **Get a concrete repro from the user.** "Still issues" is too vague to diagnose remotely. Ask for: device, account, exact tap sequence, what they expected vs. saw, whether they did two restarts after the latest OTA.
2. If toggle-off-after-carousel-+ is still the bug, add a `console.log` in `handleToggleFollow` and a `key` change to the Switch, ship a debug update, ask user to repro.
3. **Consider a much simpler design:** drop `justFollowed` entirely; tap + → fire mutation → wait for refetch → My list updates. Add a tiny in-line spinner on the + badge during the in-flight window. This eliminates an entire class of optimistic-state bugs at the cost of ~500ms visible delay. The user has already explicitly approved removing animation/top-of-list — they may approve dropping optimistic too if it kills bugs.
4. If keeping optimistic: write a unit test for `fighters`/`topFollowed`/`followedIdSet` derivation given various combinations of `serverFighters`, `justFollowed`, `localUnfollows`. The state space is small but easy to mis-reason about.

---

## What NOT to do

- **Don't reinstate the fade-out animation or top-of-list-pop** — user explicitly said "doesn't need any of our fancy fade ins/outs or top of list placement or anything". They want plain functional behavior.
- **Don't assume the OTA has been applied.** Two app restarts. Ask the user to confirm before chasing a phantom regression.
- **Don't add more state without first removing what's there.** This file already has too many moving parts for what it does.
