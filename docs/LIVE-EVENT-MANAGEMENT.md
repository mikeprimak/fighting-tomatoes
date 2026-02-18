# Live Event Management Guide

How to manage fight events in the Good Fights admin panel during live events.

## Quick Start

1. Go to `https://<backend-host>/admin.html`
2. Log in with your admin email
3. Select the event
4. Use the **Upcoming / Live / Completed** buttons on each fight as the event progresses

That's it for manual mode. Everything below explains the full system.

---

## Tracker Modes

Every event has a **tracker mode** that controls how fight statuses get updated. The default for all promotions is **manual**.

| Mode | Behavior | Use when... |
|------|----------|-------------|
| `manual` | Nothing automatic. You click buttons in the admin panel. | Default. Use for all events until you trust a tracker. |
| `time-based` | Fights auto-flip to "live" at their scheduled start time. You still mark them completed. | You want fights to appear as "live" on a timer while you enter results manually. |
| `live` | Tracker scrapes results and publishes them directly to users. | You fully trust the scraper for this promotion. |
| `ufc` | UFC-specific live scraper (auto-publishes). | UFC events when you trust the UFC tracker. |
| `matchroom` | Matchroom-specific live scraper (auto-publishes). | Matchroom events when you trust the Matchroom tracker. |
| `oktagon` | OKTAGON-specific live scraper (auto-publishes). | OKTAGON events when you trust the OKTAGON tracker. |

### How to Set Tracker Mode

**Per-event (recommended):** In the admin panel, edit the event and change the Tracker Mode dropdown. This only affects that one event.

**Per-promotion (global):** Edit `packages/backend/src/config/liveTrackerConfig.ts` and change the promotion's value in `PROMOTION_TRACKER_CONFIG`. This affects all future events for that promotion.

---

## Manual Mode Workflow (Default)

This is what you use for every event right now.

### Before the Event

1. Open admin panel, select the event
2. Verify all fights are listed and in the correct order
3. All fights should show as **Upcoming**

### During the Event

For each fight as it happens:

1. **Fight starts** → Click the **Live** button on that fight
   - This sets `hasStarted: true` so users see it as the current fight
2. **Fight ends** → Click the **Completed** button
   - Optionally enter: winner, method (KO, TKO, Decision, etc.), round, time
   - If you don't enter details immediately, you can edit them later

### After the Event

1. Verify all fights are marked completed with correct results
2. The event will auto-mark as complete when all fights are done

### Tips

- You don't need to update fights in real-time to the second. Users will see the status change on their next app refresh.
- If you make a mistake, click the fight and change it back (e.g., Completed → Live, or Live → Upcoming).
- The event status (Upcoming/Live/Complete) updates automatically based on fight statuses.

---

## Time-Based Mode Workflow

Use this when you want fights to automatically appear as "live" at estimated times, but you still manually enter results.

### Setup

1. Set the event's tracker mode to `time-based` in the admin panel
2. For each fight, enter a **Scheduled Start Time** (the time picker next to each fight)
   - Example: If you're watching and the next fight is expected around 11:20 PM, set that time

### During the Event

- Fights auto-flip to **Live** when their scheduled time arrives (checked every 60 seconds)
- You still manually click **Completed** and enter results when each fight ends
- You can adjust scheduled times as the event progresses (fights running ahead or behind schedule)

### Section-Based Auto-Complete (Legacy)

Events with section start times (earlyPrelimStartTime, prelimStartTime, mainStartTime) can auto-mark entire sections as complete when the section time arrives. This is the older approach — per-fight scheduling is preferred.

---

## Shadow Fields & Publish Workflow

This is for when live trackers are running but you want to verify results before users see them.

### How It Works

All live trackers (UFC, Matchroom, OKTAGON, ONE FC, Tapology) write to **shadow fields** on every fight:

```
Published fields (what users see):
  hasStarted, isComplete, winner, method, round, time

Shadow fields (what trackers write):
  trackerHasStarted, trackerIsComplete, trackerWinner, trackerMethod, trackerRound, trackerTime
```

**In manual/time-based mode:** Trackers ONLY write to shadow fields. Users see nothing until you publish.

**In live/ufc/matchroom/oktagon mode:** Trackers write to BOTH shadow and published fields (auto-publish).

### Using the Publish Buttons

When a tracker has written shadow data, you'll see it in the admin panel next to each fight:

```
Published: —              | TRACKER: KO R2 4:37  [Publish]
```

- **Publish** (per fight): Copies that fight's tracker data to published fields
- **Publish All** (event header): Bulk-publishes all fights with tracker data

### Recommended Workflow for Testing Trackers

1. Set the event to `manual` mode
2. Let the tracker run — it writes to shadow fields only
3. Watch the admin panel to compare tracker output vs what you see on TV
4. If correct: click **Publish** on individual fights (or **Publish All**)
5. If wrong: manually enter the correct result instead

This lets you test trackers safely without affecting users.

---

## Enabling a Live Tracker for a Promotion

When you're confident a tracker works reliably:

### Option A: Per-Event (Safe)

1. In the admin panel, edit the specific event
2. Set Tracker Mode to the appropriate value (`live`, `ufc`, `matchroom`, `oktagon`)
3. The tracker will auto-publish results for that event only
4. Other events for the same promotion remain manual

### Option B: Per-Promotion (Global)

Edit `packages/backend/src/config/liveTrackerConfig.ts`:

```typescript
// Before (manual, the default):
'UFC': 'manual',

// After (tracker auto-publishes for all UFC events):
'UFC': 'ufc',
```

Commit, push, and Render will redeploy with the new default.

### Available Trackers

| Promotion | Tracker Key | Scraper |
|-----------|-------------|---------|
| UFC | `ufc` | `ufcLiveParser.ts` (runs via GitHub Actions) |
| Matchroom | `matchroom` | `matchroomLiveParser.ts` |
| OKTAGON | `oktagon` | `oktagonLiveParser.ts` |
| ONE FC | (use `live`) | `oneFCLiveParser.ts` |
| Any (via Tapology) | (use `live`) | `tapologyLiveParser.ts` |

---

## Admin Panel Reference

### Fight Status Buttons

| Button | Sets | Meaning |
|--------|------|---------|
| **Upcoming** | `hasStarted: false, isComplete: false` | Fight hasn't started yet |
| **Live** | `hasStarted: true, isComplete: false` | Fight is currently happening |
| **Completed** | `hasStarted: true, isComplete: true` | Fight is over |

### Key Files

| File | What it does |
|------|-------------|
| `src/config/liveTrackerConfig.ts` | Promotion defaults + `buildTrackerUpdateData()` helper |
| `src/services/timeBasedFightStatusUpdater.ts` | Section-based + per-fight scheduled time auto-flip |
| `src/services/eventBasedScheduler.ts` | Starts/stops live trackers for events |
| `src/routes/admin.ts` | Admin API: set-status, publish, publish-all endpoints |
| `src/routes/fights.ts` | Strips tracker fields from public API responses |
| `public/admin.html` | Admin panel UI |

### Admin API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/fights/:id/set-status` | Set fight to upcoming/live/completed |
| `POST /api/admin/fights/:id/publish` | Copy tracker → published for one fight |
| `POST /api/admin/events/:id/publish-all` | Bulk publish all tracker data for event |
| `PUT /api/admin/fights/:id` | Full fight update (winner, method, round, time, etc.) |
| `PUT /api/admin/events/:id` | Update event (including trackerMode) |
