# UFC 320 Live Event Tracking Plan
**Event**: UFC 320: Ankalaev vs. Pereira
**Date**: October 4, 2025 (Tonight!)
**Objective**: Build real-time fight tracking system

## System Overview

### Data Flow
```
UFC.com Event Page
  → Live Scraper (every 30s)
  → Live Parser (parse & detect changes)
  → Database Updates (hasStarted, currentRound, winner, etc.)
  → Mobile UI Updates (via existing API queries)
```

## Phase 1: Database Schema Updates ✅

### Add to Fight model:
```prisma
currentRound     Int?      // Current round in progress (1-5)
completedRounds  Int?      // Last completed round number
```

**Files to modify:**
- `packages/backend/prisma/schema.prisma`
- Run migration: `pnpm prisma migrate dev --name add_live_round_tracking`

## Phase 2: Live Scraper Enhancement

### Enhance `scrapeAllUFCData.js` to detect:
1. **Event Status**: "Upcoming" → "Live" → "Complete"
2. **Fight Status**: Per-fight status (upcoming/live/complete)
3. **Current Round**: Which round is happening (1-5)
4. **Fight Results**: Winner, method, round, time when fight ends

### UFC.com Data Indicators:
- Event is LIVE: Look for "LIVE" badge/text on event page
- Fight is LIVE: Fight card shows status indicator
- Current Round: "Round 1", "Round 2" text
- Between Rounds: "End of Round X" or similar
- Fight Complete: Result shown (Winner name, method, time)

### Scraper Output Format:
```json
{
  "eventName": "UFC 320",
  "status": "Live",
  "fights": [
    {
      "fightId": "...",
      "fighterA": { "name": "..." },
      "fighterB": { "name": "..." },
      "status": "live",           // NEW
      "currentRound": 2,          // NEW
      "isComplete": false,        // NEW
      "winner": null,             // NEW
      "method": null,             // NEW
      "winningRound": null,       // NEW
      "winningTime": null         // NEW
    }
  ]
}
```

**Files to create/modify:**
- `packages/backend/src/services/ufcLiveScraper.ts` (new - focused on live data)
- Or enhance existing `scrapeAllUFCData.js`

## Phase 3: Live Data Parser

### Create `ufcLiveParser.ts`:
- Read live scrape data
- Compare with database to detect changes
- Update events and fights with live data

### Update Logic:
```typescript
// Event status
if (scrapedEvent.status === "Live" && !dbEvent.hasStarted) {
  // First fight started! Move to Live tab
  await prisma.event.update({
    where: { id },
    data: { hasStarted: true }
  });
}

// Fight status & rounds
for (fightData of scrapeData.fights) {
  const dbFight = await findFightInDB(fightData);

  // Fight started
  if (fightData.status === "live" && !dbFight.hasStarted) {
    await prisma.fight.update({
      data: { hasStarted: true }
    });
  }

  // Round update
  if (fightData.currentRound !== dbFight.currentRound) {
    await prisma.fight.update({
      data: {
        currentRound: fightData.currentRound,
        completedRounds: fightData.currentRound - 1
      }
    });
  }

  // Fight finished
  if (fightData.isComplete && !dbFight.isComplete) {
    await prisma.fight.update({
      data: {
        isComplete: true,
        winner: mapWinnerNameToId(fightData.winner),
        method: fightData.method,
        round: fightData.winningRound,
        time: fightData.winningTime
      }
    });
  }
}

// Event complete (all fights done)
if (allFightsComplete(event)) {
  await prisma.event.update({
    data: { isComplete: true }
  });
}
```

**Files to create:**
- `packages/backend/src/services/ufcLiveParser.ts`

## Phase 4: Scheduler Service

### Create live event orchestrator:
```typescript
class LiveEventTracker {
  private intervalId: NodeJS.Timeout | null = null;

  async startTracking(eventId: string) {
    console.log(`Starting live tracking for event ${eventId}`);

    // Immediate scrape
    await this.scrapeAndUpdate(eventId);

    // Schedule every 30 seconds
    this.intervalId = setInterval(async () => {
      await this.scrapeAndUpdate(eventId);
    }, 30000);
  }

  async scrapeAndUpdate(eventId: string) {
    try {
      // 1. Scrape UFC.com
      const liveData = await scrapeLiveEvent(eventId);

      // 2. Parse and update DB
      await parseLiveData(liveData);

      // 3. Check if event complete
      if (liveData.status === "Complete") {
        this.stopTracking();
      }
    } catch (error) {
      console.error('Live scrape error:', error);
    }
  }

  stopTracking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('Stopped live tracking');
    }
  }
}
```

**Files to create:**
- `packages/backend/src/services/liveEventTracker.ts`

## Phase 5: API Endpoints

### Add routes to `import.ts` or new `liveEvents.ts`:
```typescript
// POST /api/live-events/start
// Body: { eventId: "..." }
// Starts live tracking for event

// POST /api/live-events/stop
// Body: { eventId: "..." }
// Stops live tracking

// GET /api/live-events/status
// Returns: { isTracking: true, eventId: "...", lastUpdate: "..." }
```

**Files to modify:**
- `packages/backend/src/routes/import.ts` or create `liveEvents.ts`

## Phase 6: Mobile UI (Already Built!)

The mobile UI already supports live data through existing components:
- **Events page tabs**: Uses `hasStarted` and `isComplete` to categorize
- **FightDisplayCardMinimal**: Shows `currentRound`, `completedRounds`, live status
- **Event status bar** (crew chat): Shows current round

**No mobile changes needed** - UI updates automatically via React Query!

## Timeline for Tonight

### 1 Hour Before Event (Approx. 5:00 PM EDT)
- ✅ Complete database migration
- ✅ Deploy live scraper
- ✅ Deploy live parser
- ✅ Deploy scheduler service
- ✅ Test scraper on UFC 320 page
- ✅ Trigger pre-event scrape to catch any last-minute changes

### During Event (Approx. 6:00 PM - 12:00 AM EDT)
- **6:00 PM**: Start live tracking via API
- **Ongoing**: Monitor scraper logs every 5-10 minutes
- **Troubleshoot**: Fix any scraping issues in real-time
- **Observe**: Watch UI update as fights progress

### After Event
- Stop live tracking
- Review logs for issues
- Document learnings for future events

## Key Files Summary

**Create:**
- `packages/backend/src/services/ufcLiveScraper.ts`
- `packages/backend/src/services/ufcLiveParser.ts`
- `packages/backend/src/services/liveEventTracker.ts`
- `packages/backend/src/routes/liveEvents.ts`

**Modify:**
- `packages/backend/prisma/schema.prisma` (add fields)
- `packages/backend/src/services/scrapeAllUFCData.js` (enhance for live data)

## Testing Strategy

1. **Before event**: Test scraper on UFC 320 page (should show all fights as "upcoming")
2. **Simulate rounds**: Manually test parser with mock data
3. **Monitor logs**: Watch console during event for errors
4. **Fallback**: If scraper fails, manually update key fights in database

## Success Criteria

✅ Event moves to "Live" tab when first fight starts
✅ Current fight shows as "Live" in UI
✅ Round number updates in real-time on crew chat
✅ Fight results auto-populate (winner, method, round, time)
✅ Event moves to "Past" tab when final fight completes

---

**Next Steps**: Start with Phase 1 (database migration), then build scraper enhancements.
