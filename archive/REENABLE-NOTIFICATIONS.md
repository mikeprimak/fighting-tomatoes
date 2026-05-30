# Re-Enable Notifications Plan

## Scope

Only **manual fight follow notifications** will be re-enabled. The user taps "Notify Me" on the hype modal for a specific upcoming fight, and receives a push notification when that fight starts.

All other notification types remain disabled:
- Hyped Fights auto-notifications (rule: minHype >= 8.5)
- Fighter Follow notifications
- Pre-Event Report notifications
- Any future rule-based notification types

---

## Current System Status

### Backend (all functional, no changes needed)

| Component | File | Status |
|-----------|------|--------|
| Push sender | `src/services/notificationService.ts` | Working — uses expo-server-sdk |
| Rule engine | `src/services/notificationRuleEngine.ts` | Working — evaluates conditions, creates matches |
| Rule helpers | `src/services/notificationRuleHelpers.ts` | Working — manages user rules |
| Notification routes | `src/routes/notifications.ts` | Working — register-token, preferences |
| Fight follow endpoints | `POST /api/fights/:id/follow`, `DELETE /api/fights/:id/unfollow` | Working |
| Fight start trigger | `notifyFightStartViaRules()` | Called from live scrapers when fight goes LIVE |

### Mobile (built but disabled)

| Component | File | Status |
|-----------|------|--------|
| Token registration | `services/notificationService.ts` | Built — `registerPushToken()` never called |
| Permission request | `services/notificationService.ts` | Built — not invoked |
| Notification handler | `components/NotificationHandler.tsx` | Built — deep links on tap |
| Settings UI | `app/settings.tsx` | Disabled (line 49-50) |
| Bell UI on cards | `components/fight-cards/*.tsx` | Removed from Upcoming/Completed, exists in Live |

### Database (ready)

- `User.pushToken` — stores Expo push token
- `User.notificationsEnabled` — master switch
- `UserNotificationRule` — stores per-user rules (manual fight follow creates one rule per fight)
- `FightNotificationMatch` — junction table linking rules to fights, tracks `notificationSent`

---

## How Fight Notifications Work (existing flow)

1. User taps "Notify Me" on hype modal → `POST /api/fights/:id/follow`
2. Backend creates a `UserNotificationRule` with `name: "Manual Fight Follow"` for that fight
3. Backend creates a `FightNotificationMatch` linking the rule to the fight
4. When the fight transitions UPCOMING → LIVE, the live scraper calls `notifyFightStartViaRules()`
5. Rule engine finds all active matches for that fight, sends push notifications via Expo
6. `FightNotificationMatch.notificationSent` is set to `true`

---

## Which Organizations Support Fight-Start Notifications

Notifications are only accurate when a live scraper detects the actual fight start. Determined by `event.scraperType`:

| scraperType | Organization | Real-time tracking? | Show "Notify Me"? |
|-------------|-------------|--------------------|--------------------|
| `ufc` | UFC | Yes | Yes |
| `oktagon` | Oktagon | Yes | Yes |
| `onefc` | ONE FC | Partial | TBD |
| `matchroom` | Matchroom | Partial | TBD |
| `null` | PFL, BKFC, etc. | No | No |

For events without a real-time scraper, the lifecycle job uses time-based estimation (section start times + 30 min per fight), which is too imprecise for "your fight is starting" notifications.

**Rule**: Only show "Notify Me" button in the hype modal when the fight's event has a `scraperType` in a whitelist of real-time scrapers.

---

## Steps to Re-Enable

### 1. Mobile: Register push token on login/startup
- Call `registerPushToken()` after successful login and on app launch (if already authenticated)
- Location: likely in `AuthContext.tsx` or `App.tsx` after auth state resolves

### 2. Mobile: Request notification permissions
- Un-disable the permission request in `services/notificationService.ts`
- Prompt once on first login, respect the user's OS-level decision after that

### 3. Mobile: Show "Notify Me" conditionally in hype modal
- Pass `event.scraperType` (or a derived `notificationsAvailable` boolean) through to `UpcomingFightModal`
- Only render the "Notify Me" button when the event's scraper supports real-time tracking
- Whitelist: `['ufc', 'oktagon']` (expand as scrapers prove reliable)

### 4. Mobile: Keep other notification UI disabled
- Do NOT re-enable bell icons on fight cards
- Do NOT re-enable notification settings toggles (Hyped Fights, Pre-Event Report, Fighter Follow)
- The only notification entry point is the "Notify Me" button in the hype modal

### 5. Backend: No changes expected
- All endpoints and services are already functional
- The manual fight follow rule type is already implemented
- `notifyFightStartViaRules()` is already called from live scrapers

### 6. Testing
- Use `POST /api/notifications/test` to verify push delivery
- Follow a fight on a UFC event, wait for it to go live, confirm notification received
- Verify notification tap deep-links to the fight detail screen
