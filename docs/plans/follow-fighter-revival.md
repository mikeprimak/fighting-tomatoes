# Follow-Fighter Revival — Cohesive Plan

**Status:** Planning, not started
**Drafted:** 2026-05-01
**Last revised:** 2026-05-01 (clarified scope after device check)
**Owner:** mike
**Depends on:** none — backend exists
**Unblocks:** notification system v2 (lanes 1, 3, 4 in `memory/project_notification_system_v2.md`)

---

## TL;DR

Follow-fighter UI is mostly gone but the backend is intact. There are four `false &&` sites in active files. **One of them is a follow-fighter button to keep and un-gate** (fighter detail page). **The other three are dead per-fight notification bells** from a feature replaced by the hype-modal Done-button approach — they're invisible to users and can be ignored or deleted later in a hygiene PR.

The work is:
1. **Un-gate** the fighter-detail follow button (one site).
2. **Add follow buttons** on the hype modal AND the rating modal, below each fighter's image.
3. **Add a "Followed Fighters" entry point** on the Profile screen that opens the existing `followed-fighters.tsx` screen, enhanced with a top-most-followed discovery list.
4. **Add one missing backend query** for top-most-followed fighters.
5. **Plumb booking/scratched notifications** off scraper diffs (separate, later).

After this ships, users have three natural places to follow a fighter (hype modal, rating modal, fighter detail) plus the dedicated `followed-fighters.tsx` screen for management and discovery.

---

## Current state — what exists

### Backend (all live, no work needed)
| Piece | File | Lines |
|---|---|---|
| `UserFighterFollow` Prisma model | `packages/backend/prisma/schema.prisma` | 687-705 |
| `POST /api/fighters/:id/follow` | `packages/backend/src/routes/index.ts` | 1395-1497 |
| `DELETE /api/fighters/:id/unfollow` | `packages/backend/src/routes/index.ts` | 1500-1564 |
| `GET /api/fighters/followed` | `packages/backend/src/routes/index.ts` | 1568-1646 |
| `PATCH /api/fighters/:id/notification-preferences` | `packages/backend/src/routes/index.ts` | 1648-1730 |
| `manageFighterNotificationRule()` | `packages/backend/src/services/notificationRuleHelpers.ts` | ~100+ |

The follow endpoint already creates a `UserNotificationRule` for the fighter; unfollow deactivates it. As soon as the new hype-modal follow button is wired to `apiService.followFighter()`, lane 1 (walkout warning) is live for any org that has a working live tracker.

### Mobile UI — `false &&` sites and what to do with each

| File | Line | Lives on | Type | Action |
|---|---|---|---|---|
| `packages/mobile/app/fighter/[id].tsx` | 319 | Fighter detail screen | Follow-fighter button | **Un-gate** (Phase 1) |
| `packages/mobile/app/fight/[id].tsx` | 247 | Fight detail screen | Old per-fight bell | Ignore (dead, harmless) |
| `packages/mobile/components/FightDetailsMenu.tsx` | 124 | Used by `CompletedFightDetailScreen` + `UpcomingFightDetailScreen` | Old per-fight bell | Ignore (dead, harmless) |
| `packages/mobile/components/fight-cards/LiveFightCard.tsx` | 603 | Live fight card | Old per-fight bell | Ignore (dead, harmless) |

The three "old per-fight bell" sites belong to a feature that was replaced by the hype-modal Done-button per-fight notification. They don't render to users. Optional cleanup PR someday — not blocking.

### Mobile UI — currently active and stays
- **Hype modal per-fight notification button** — lives on the pre-fight modal next to the "Done" button. This is the working manual per-fight notification entry point. Untouched by this plan.
- `packages/mobile/app/followed-fighters.tsx` — full screen with toggle switches per fighter. Reachable by URL but no navigation entry point exists yet. Will get one in Phase 3.

### What does NOT exist
- Follow buttons on the hype modal or rating modal.
- Top-most-followed fighters backend query.
- "Followed Fighters" entry point on Profile.

---

## The plan — four phases

### Phase 1 — Un-gate fighter-detail follow button
**Time:** 5 min. **Risk:** very low.

`packages/mobile/app/fighter/[id].tsx:319` — change `{false && isAuthenticated && (` to `{isAuthenticated && (`. Delete the stale comment on lines 317-318. The supporting code (`followMutation`, `handleFollowPress`, `bellRotation`, `showToast`) all stay — they make the button work.

The other three `false &&` sites (per-fight bells) are not touched in this phase. They're dead code, but they don't render and don't conflict with anything we're adding. Optional cleanup someday.

**Verify on device:** open a fighter, tap "Notify Me", confirm bell ring + toast, confirm fighter shows up at `/followed-fighters`. Tap again to unfollow.

### Phase 2 — Add follow buttons to hype modal AND rating modal
**Time:** 3-4 hours. **Risk:** low — pure additive UI.

**Where:**
- `packages/mobile/components/UpcomingFightModal.tsx` (the hype/pre-fight modal)
- `packages/mobile/components/RateFightModal.tsx` (the post-fight rating modal)

Add a small follow button beneath each fighter's image (one per fighter — fighter1 and fighter2) on both modals. Coexists with the existing per-fight notification button on the hype modal — they are different concepts (per-fight reminder vs follow-this-fighter).

**UI:**
```
[Fighter 1 image]              [Fighter 2 image]
  ☆ Follow                       ☆ Follow
```
When already following: filled bell + "Following". One tap toggles. No confirmation dialog.

**Implementation:**
- Reuse `apiService.followFighter()` / `apiService.unfollowFighter()`.
- Initial `isFollowing` from the fighter object — extend `getFight` response to include `fighter1.isFollowing` / `fighter2.isFollowing` for authenticated users (mirror pattern at `routes/index.ts:1382-1384`).
- `useMutation` with optimistic update — flip local state immediately, rollback on error.
- After success, invalidate `['fighter', id]`, `['fight', id]`, and `['followedFighters']`.
- Toast on first follow: *"You'll be notified before {fighter.lastName} fights."*
- Build a small reusable `<FollowFighterButton fighterId={...} isFollowing={...} />` component since it's now used in three places (hype modal, rating modal, fighter detail) — same shape, same behavior. Easier to keep consistent later.

**Coverage check:** with all three entry points live, a user has natural follow moments at every key interaction — pre-fight (hype), during/around the card (fighter detail), and post-fight (rating modal). No friction tax to follow someone.

### Phase 3 — Profile "Followed Fighters" entry point + discovery
**Time:** 4-6 hours. **Risk:** medium — new backend endpoint.

#### 3a. New backend endpoint
**File:** `packages/backend/src/routes/community.ts` (alongside `hot-fighters`).

```
GET /api/community/top-followed-fighters?limit=20
```

Group `UserFighterFollow` by `fighterId`, count, order desc, join Fighter, return `{ fighter, followerCount }[]`. Include `isFollowing` per row for the requesting user.

**Cache:** match the existing pattern in `community.ts` for `hot-fighters` (in-memory, ~1 hour).

**Cold-start fallback:** if the result has fewer than `limit` rows (because few users follow anyone yet), append champion + top-ranked fighters by recent fight activity, marked clearly so the "follower count" isn't misleading. Keeps the discovery list from looking empty in the early days.

#### 3b. Profile screen entry point
**File:** `packages/mobile/app/(tabs)/profile.tsx`. Insert a new `SectionContainer` matching the existing pattern at line 826 ("My Ratings"). Slot into the MY ACTIVITY section.

```
<SectionContainer
  title="Followed Fighters"
  icon="bell"
  headerRight={<SeeAll onPress={() => router.push('/followed-fighters')} />}
>
  {/* If user has follows: horizontal scroll of avatars + names, ~5 visible, tap → fighter detail */}
  {/* If user has zero follows: empty-state copy + horizontal scroll of TOP MOST-FOLLOWED with one-tap follow buttons */}
</SectionContainer>
```

The "See All" header link opens the dedicated `followed-fighters.tsx` screen.

#### 3c. Enhance `followed-fighters.tsx` with discovery
The dedicated screen at `packages/mobile/app/followed-fighters.tsx` currently lists user follows with toggle switches. Add a "Top Followed on Good Fights" section beneath the user's list, populated from `top-followed-fighters`, with one-tap follow buttons inline.

This makes the screen useful for both managing existing follows AND discovering new fighters to follow — single destination for everything follow-related.

### Phase 4 — Booked / scratched notification plumbing
**Time:** 4-6 hours. **Risk:** medium. **Ships separately, not blocking the UI work above.**

This unblocks lane 4 in `memory/project_notification_system_v2.md`. When a daily scraper inserts a new `Fight` row involving a fighter someone follows, enqueue a one-shot push notification through whatever push service powers walkout warnings. Same for scratched fights (Fight row deletion or status change to cancelled).

The condition type already exists — `fighterIds` in `NotificationRuleConditions` at `notificationRuleEngine.ts:13-35`. What's missing is the trigger pathway from scraper diffs.

---

## Live tracker coverage — affects lane 1 (walkout warning)

The "fighter is up next" notification depends on a working live tracker for the org running the card. Coverage is uneven, so lane 1 needs an org-aware fallback.

**Orgs with live trackers (lane 1 works as designed):**
- UFC — `ufcLiveParser.ts`
- BKFC, PFL, RIZIN, Zuffa Boxing, Karate Combat, Dirty Boxing — Tapology live tracker (VPS)

**Orgs without a live tracker (need fallback — verify matrix before ship; likely Matchroom, Oktagon, ONE FC):**

For followed fighters on a card with no live tracker, replace the precise "5-10 min before walkout" notification with a one-per-event **"card start" notification** fired off `event.startTime`:

> *"Tonight on [Org]: [Fighter you follow] is on the card. Prelims start in 1 hour."*

- Offset configurable per-user, default 1 hour before main card start.
- Fires once per event regardless of how many followed fighters are on it.
- Branch on `event.hasLiveTracking` (the field already exists — referenced at the deleted bell-icon sites).

When an org gains a live tracker later, it automatically upgrades from card-start fallback to walkout warnings — no per-user migration.

---

## Order of work + ship granularity

1. **Phase 1** (un-gate fighter detail follow button) — 5 min, ships fighter-detail entry point alone.
2. **Phase 2** (hype + rating modal follow buttons + reusable `FollowFighterButton` component) — biggest UX delta, ships follow at peak engagement moments.
3. **Phase 3a** (top-followed backend query) — before 3b/3c.
4. **Phase 3b/3c** (Profile section + followed-fighters discovery) — ship together.
5. **Phase 4** (booking notifications) — separate ship, later.

Phase 1 alone unlocks following from the fighter detail page. Phase 2 is where it becomes ambient — users can follow without leaving the rating flow.

---

## Risks + open questions

- **Phase 2 dependency:** the hype modal needs `isFollowing` per fighter in its `Fight` payload. The existing `getFight` response may not carry this — extending it is a minor backend change. Verify before starting Phase 2.
- **Phase 3 caching:** confirm `hot-fighters` has a caching layer worth copying. If not, the cold-start fallback strategy in 3a still helps but Postgres query cost matters more.
- **Discovery seeding:** very few real follows exist today (because the feature was hidden), so the cold-start fallback in 3a is load-bearing for the first few weeks.

---

## Cross-references

- `memory/project_notification_system_v2.md` — the four notification lanes that depend on this revival
- `memory/project_tapology_live_trackers.md` — confirms live-tracker org coverage matrix
- `memory/project_retroactive_results_phase2.md` — confirms all 5 production scrapers shipped 2026-04-28
- `archive/LIVE-EVENT-MANAGEMENT.md` — lifecycle context for when notifications fire
