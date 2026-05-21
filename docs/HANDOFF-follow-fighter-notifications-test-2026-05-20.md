# HANDOFF: Test follow-fighter notification lanes

**Created:** 2026-05-20 (post-ship)
**For:** Next session

The 4 follow-fighter notification lanes are shipped. Backend on Render auto-deployed (`897df82` + `3af9e05`); mobile users get the changes via EAS updates `a5615b61`/`bbe1fbf3` (lanes + settings) and `5ee7a8f9`/`1301df5f` (profile entry point) on next two app opens.

We have not exercised the end-to-end flow yet. This session's job: verify each lane fires correctly and the gating works.

## Quick smoke tests (do these first, in order)

### 1. Settings UI persistence
Open the app on Mike's phone:
- Profile → "Notification settings →" should appear under the master toggle row and navigate to `/settings`.
- `/settings` should show a new "Followed Fighters" section with 4 toggle rows (Booked / 3 days before / Morning of / Up next).
- Toggle each one off, then on, kill the app, reopen → state should persist.

If any toggle doesn't persist, suspect the preferences API. Check the backend log for the `PUT /api/notifications/preferences` payload.

### 2. Timezone capture
After opening the app at least once on the new build, run on Render:
```sql
SELECT id, email, timezone FROM users WHERE email = 'avocadomike@hotmail.com';
```
Expected: `timezone = 'America/New_York'` (or whatever IANA Mike's phone reports — could be `America/Toronto` if he's testing from Canada). Default is `America/New_York` so a fresh `users` row also satisfies the smoke test until the device sync runs.

If timezone is still default but the device should have synced: check `AsyncStorage` key `@gf/lastSyncedTimezone` on the device; the sync only PUTs once per session and skips if already cached. Clearing app storage forces a re-sync.

### 3. Walkout gating (lowest-risk reversible test)
Easiest lane to test because it doesn't require waiting on real cron windows.

- Pick a fight on avocadomike's followed-fighter list that has a `FightNotificationMatch` row.
- Toggle `notifyFollowedWalkout` OFF in `/settings`.
- Trigger the walkout from admin: `POST /admin/notify-fight-start` (or the existing equivalent endpoint — check `packages/backend/src/routes/admin.ts` near `notifyFightStartViaRules`).
- Expected: **no push received**, but `fight_notification_matches.notificationSent` flips to true.
- Re-enable the toggle, find another unsent match row, repeat → **push received**, and a row appears in `follow_notification_events` with `lane='WALKOUT'`.

If the suppressed run still fires a push: the rule-name discriminator (`Fighter Follow:` prefix) isn't matching. Inspect `userNotificationRule.name` for the rule on that match.

## Real-lane tests (each requires a tiny bit of setup)

### 4. Booked lane
**Trickiest invariant:** booked only fires when `Fight.createdAt > UserFighterFollow.createdAt`. To trigger:

Option A — easiest if a real scraper run is due:
- Wait for a daily scraper to insert a brand-new fight involving an avocadomike-followed fighter. Push should arrive within a minute.

Option B — manual:
- Create a small script in `packages/backend/src/scripts/` that:
  1. Finds a followed fighter for avocadomike
  2. Inserts a fake UPCOMING fight involving them with `createdAt: new Date()`
  3. Calls `syncFighterFollowMatchesForFight(newFight.id)`
- Expected: push "X just got booked: vs Y · DATE", row in `follow_notification_events` with `lane='BOOKED'`, `bookedSentAt` set on the match row.
- Cleanup: delete the fake fight (cascades to match + event rows).

Negative test: insert a fake fight with `createdAt` BEFORE the user's follow timestamp (i.e. simulate a retroactive follow). Confirm **no push**.

### 5. 3-day-warn and morning-of crons
Both run on `*/15 * * * *` and only dispatch when current UTC time falls within `[trigger, trigger + 30min]`. Two ways to test:

Option A — wait for the natural window:
- Pick an upcoming followed fight on a known date.
- Compute the trigger time using the same logic: `computeFightDay(event.date, user.timezone)` then 10am or 9am local on that day (or 3 days prior).
- Wait until that moment, observe.

Option B — bypass the window check (recommended for iteration):
- Add a temporary admin endpoint `POST /admin/test-follow-fighter-lane` that:
  - Accepts `{ matchId, lane: 'THREE_DAY' | 'MORNING_OF' }`
  - Looks up the user/fight, then calls the internal `sendLaneNotification` helper directly (exported for test use)
  - Skip the `trigger ∈ window` check
- Easier than mocking clock. Delete the endpoint after the lane is verified.

Either way, expected: push "X fights in 3 days" or "X fights today", row in `follow_notification_events`, `threeDaySentAt`/`morningOfSentAt` set.

### 6. Overnight-rollback edge case
The whole reason we built per-user timezone math. Verify with an early-morning (or overseas) followed fight:
- Pick or fake-insert a fight where `Event.date` resolves to a user-local time **before noon** (e.g. a ONE FC card at 3am ET, or a UFC PPV with daytime prelims).
- Confirm `computeFightDay` returns the previous calendar day in the user's TZ.
- The morning-of trigger should fire 9am on **that** previous local day (~18+ hours pre-fight, not 9am the day OF the fight which would be after the fight ended).

Quick way to assert: temporarily log `computeFightDay`'s output in `runFollowFighterCron` for one tick and inspect.

## What `working` looks like

For each successful dispatch:
- One Expo push sent to the user's device
- Match row's per-lane `*SentAt` set
- New `follow_notification_events` row with matching `(matchId, lane)`
- Backend log line `[Notifications] BOOKED|THREE_DAY|MORNING_OF|WALKOUT dispatched: ...`

## To re-test after a successful dispatch

Per-lane sent timestamps prevent re-firing. To retry:
```sql
UPDATE fight_notification_matches
SET booked_sent_at = NULL  -- or three_day_sent_at, morning_of_sent_at
WHERE id = '...';
DELETE FROM follow_notification_events WHERE match_id = '...' AND lane = 'BOOKED';
```
For walkout, clear `notification_sent = false`.

## Known follow-ups (defer past this test session)
- Scratched / signed-with-new-org / spoiler-safe-post-fight lanes (per `docs/areas/follow-fighter.md`).
- Open/click telemetry callback on the mobile side to populate `openedAt`/`clickedAt`.
- Refine booked-lane copy when `Fight.scheduledStartTime` is reliably populated (currently uses `Event.date`).
- Per-row `UserFighterFollow` lookup on booked check is O(matches) — batch at scale.

## Files to know
- Backend dispatch logic: `packages/backend/src/services/followFighterNotifications.ts`
- Walkout gating: `packages/backend/src/services/notificationService.ts` (`notifyFightStartViaRules`, `notifyEventSectionStart`)
- Scrape-time booked trigger: `packages/backend/src/services/notificationRuleEngine.ts` (`syncFighterFollowMatchesForFight`)
- Cron registration: `packages/backend/src/services/notificationScheduler.ts`
- Mobile settings: `packages/mobile/app/settings.tsx`
- Mobile timezone capture: `packages/mobile/services/notificationService.ts` (`syncDeviceTimezone`)
- Profile entry point: `packages/mobile/app/(tabs)/profile.tsx`
- Schema: see `20260520000000_follow_fighter_notification_lanes/migration.sql`
