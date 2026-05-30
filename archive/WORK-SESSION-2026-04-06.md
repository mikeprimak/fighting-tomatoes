# Work Session - April 6, 2026

## 1. Notification Deep Link Change

**File:** `packages/mobile/components/NotificationHandler.tsx`

Changed all notification taps to navigate to the **Live Events** screen instead of individual screens.

**Before:** Notifications routed to different screens based on payload type:
- `fightId` -> fight detail screen (`/fight/:id`)
- `screen: 'community'` -> community tab
- `crewId` -> crew screen (`/crew/:id`)

**After:** All non-preEventReport notifications navigate to `/(tabs)/live-events`. The `preEventReport` type was left as-is since it has special AsyncStorage/context logic (saves the message body), but its navigation was already going to the events tab — could be consolidated later if desired.

---

## 2. Live Events Screen Performance Optimizations

**File:** `packages/mobile/app/(tabs)/live-events.tsx`

**Problem:** The live events screen was slow on first load due to 3 issues:

### Fix A: Show content after first page loads (not all pages)
- **Before:** Loading spinner shown until all 4 pages were fetched (`isLoading || needsMorePages`)
- **After:** Spinner only shown for initial load (`isLoading`); remaining pages load in background while user already sees content

### Fix B: Don't invalidate cache on tab focus
- **Before:** `useFocusEffect` called `invalidateQueries` every time the tab was focused, throwing away cached data and showing a spinner
- **After:** Changed to `refetchQueries` which shows stale cached data instantly and updates in the background
- **Verified safe:** Hype/rating modals call their own `invalidateQueries(['upcomingEvents'])` in mutation `onSuccess` callbacks (UpcomingFightModal lines 209/238/241, RateFightModal line 506), so fight card updates after user input are unaffected by this change

### Fix C: Larger page size, fewer round-trips
- **Before:** `EVENTS_PER_PAGE = 2`, auto-fetching up to 4 pages = 4 sequential API calls (8 events)
- **After:** `EVENTS_PER_PAGE = 5`, auto-fetching up to 2 pages = 2 sequential API calls (10 events)

### Net result
First load: ~4 sequential API round-trips before anything renders -> **1 API call** shows content immediately. Tab switches show cached data instantly instead of a spinner.

### Backend note (not changed)
The backend notification reasons query (`index.ts` lines 489-493) has an N+1 problem — `getNotificationReasonsForFight` is called individually per fight. This could be batched in the future for further improvement.

---

## 3. iOS OTA Update (No Native Build Needed)

Checked whether the iOS App Store needed a new native build (currently live: 2.0.1 build 18). All ~30 commits since Feb 27 are JS-only — no changes to `app.json`, `package.json`, or native config. A new native build was **not needed**.

Reverted `app.json` from 2.0.2/build 19 back to 2.0.1/build 18 and pushed an OTA update:

- **iOS update ID:** `019d651b-3920-7566-942d-605050afc49f` (runtime 2.0.1)
- **Android update ID:** `019d651b-3920-7d73-82ba-a720c5682d76` (runtime 1.0.0)
- **Update group:** `32cb332d-0200-41c2-99e0-cca972bd2a89`
- **Changes included:** UI redesigns, spoiler-free mode, notifications, new orgs, live events improvements

Users receive the update after 2 app restarts (first downloads, second applies).
