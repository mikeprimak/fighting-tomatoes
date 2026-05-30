# Playbook: Manually fire a missed fight notification

When a bug (wrong sort order, stalled live tracker, lifecycle skip) means a push that
*should* have gone out never fired, you can replay it by hand. The golden rule: **call the
real production dispatch function** rather than hand-rolling a push. The function targets the
right recipients, respects every per-user toggle, marks the row sent so the (later-fixed)
tracker won't double-fire, and writes the engagement log. Hand-rolled pushes skip all of that.

## The notification lanes and their dispatch functions

All in `packages/backend/src/services/`:

| Lane | What it is | Function | File |
|---|---|---|---|
| **Walkout / "Fight Up Next"** | fires when a fight starts | `notifyFightStartViaRules(fightId, f1Name, f2Name)` | `notificationService.ts` |
| **Section start** (no live tracker) | one push per (user, card section) | `notifyEventSectionStart(eventId, sectionFightIds, eventName, sectionLabel)` | `notificationService.ts` |
| **Booked** | "X just got booked" | `dispatchBookedNotification({matchId,userId,fightId,followedFighterId})` | `followFighterNotifications.ts` |
| **3-day / morning-of** | time-triggered fighter-follow | `runFollowFighterCron()` (scans, picks its own targets) | `followFighterNotifications.ts` |

Recipients live in the `fightNotificationMatch` table: rows with `isActive: true` and
`notificationSent: false` for the relevant `fightId`. Rule name prefixes classify them:
- `Manual Fight Follow: <fightId>` — user tapped follow/notify on that specific fight. Always dispatches (per-rule opt-out only).
- `Fighter Follow: <fighterId>` — user follows the fighter. **Gated by the user's `notifyFollowedWalkout` toggle** for the walkout lane.
- Hyped-fight rules — always dispatch.

## Procedure (worked example: BKFC 90 Darren Till walkout, 2026-05-30)

Run everything **from `packages/backend/`** so Prisma auto-loads `.env` (the Render External
URL — never local DB). Use `node_modules/.bin/tsx` for one-off TS scripts.

### 1. Investigate first — never fire blind

Write a **read-only** script that confirms: the event, the exact fight, the card ordering (to
confirm the bug), and the recipient count. Schema gotchas that bit me:
- `Event` status field is `eventStatus`, **not** `status`.
- `Fight` ordering fields are `cardType` (string) + `orderOnCard` (int, **1 = main event**, higher = earlier). There is **no** `sortOrder` or `cardSection` on `Fight`.

Compute "would dispatch now" the same way the real function does:
```ts
for (const m of activeMatches) {
  const u = userById.get(m.userId);
  if (!u || !u.notificationsEnabled || !u.pushToken) continue;
  if (m.rule.name.startsWith('Fighter Follow:') && !u.notifyFollowedWalkout) continue;
  if (!m.notificationSent) wouldDispatch++;
}
```

In the BKFC 90 case the card had **duplicate `orderOnCard` values** (two #2, two #5/#6, three
#10). The section-based lifecycle completed fights *below* Till while his co-main stayed
UPCOMING, so the walkout never fired. Investigation showed exactly **1 recipient** via a
`Manual Fight Follow` rule.

### 2. Fire via the real function

```ts
import { notifyFightStartViaRules } from '../services/notificationService';
await notifyFightStartViaRules(
  '61344d48-cd50-4d74-a9aa-96cb30e0a508', // fightId
  'Darren Till', 'Aaron Chalmers',
);
```
Run it: `node_modules/.bin/tsx src/scripts/_sendTillWalkout.ts`

Expected log: `Sent N notifications, 0 failed` + `Marked N notification matches as sent`.

### 3. Clean up

Delete the temp scripts (`rm -f src/scripts/_*.ts`). These are operational one-offs against
prod — **do not commit them**. Confirm `git status` is clean.

## Cautions

- **Verify recipients before firing.** Sending push to real users is outward-facing and
  irreversible. Count and sanity-check who gets it; if it's more than a handful, re-confirm
  the matchup/copy with Mike.
- **The dispatch marks rows `notificationSent=true`** — so a later tracker pass won't re-fire.
  That's the point. It also means you can't replay it again without manually flipping the row.
- This **replays the notification only**. The **root-cause data bug is separate** — e.g. the
  BKFC duplicate `orderOnCard` was still in the DB and the parser still produces it. Fixing the
  send does not fix the scraper. Flag/file the root cause separately.
