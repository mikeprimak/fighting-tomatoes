# Event Lifecycle System - Comprehensive Proposal

## Executive Summary

Based on analysis of your current system, I've identified several critical issues and designed a robust, self-healing event lifecycle system that keeps your app accurate before, during, and after events—even when individual components fail.

---

## Current System Analysis

### What Exists Today

1. **Daily UFC Scraper** (`scrapeAllUFCData.js`)
   - ✅ Scrapes UFC.com for upcoming events and fights
   - ❌ **NOT scheduled** - no cron job currently runs it
   - ❌ Can create duplicate events (mentioned issue)
   - Location: `packages/backend/src/services/scrapeAllUFCData.js`

2. **Live Event Scheduler** (`liveEventScheduler.ts`)
   - ✅ Checks every 5 minutes for events to track
   - ✅ Starts tracker 15 minutes before event
   - ⚠️ Inefficient - polls continuously instead of scheduling precisely
   - ⚠️ Can miss events if server restarts at wrong time

3. **Live Event Tracker** (`liveEventTracker.ts`)
   - ✅ Scrapes UFC.com every 30 seconds during live events
   - ✅ Updates fight statuses (hasStarted, isComplete)
   - ⚠️ Relies on scraper detecting completion
   - ❌ No failsafe if scraper fails or event page doesn't update

4. **Event Completion Checker** (`eventCompletionChecker.ts`)
   - ⚠️ **DISABLED** due to memory constraints on Render
   - Was designed to mark events complete, but not running

### Critical Problems Identified

1. **Stuck "Live" Events** - Events/fights marked `hasStarted=true` but `isComplete=false` from past weeks
2. **No Automatic Daily Scraping** - Scraper exists but isn't scheduled
3. **No Duplicate Prevention** - Scraper can create duplicate events
4. **Single Point of Failure** - If live tracker fails, events stuck forever
5. **Inefficient Polling** - Checks every 5 minutes instead of scheduling at exact times
6. **No Time-Based Failsafes** - Nothing marks fights complete if scraper misses them

---

## Recommended Solution: 3-Tier Event Lifecycle System

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  TIER 1: Pre-Event Management                   │
│  Daily scraper syncs UFC.com → Detects changes, prevents dupes │
│                    Runs daily at 12pm EST                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   TIER 2: Live Event Tracking                   │
│    Direct scheduler (no polling) + Real-time scraper @ 30s      │
│              Starts at earliest prelim start time               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                TIER 3: Post-Event & Failsafe System             │
│  Time-based cleanup runs every hour to catch stuck events/fights│
│        Auto-completes based on elapsed time since start         │
└─────────────────────────────────────────────────────────────────┘
```

---

## TIER 1: Pre-Event Management (Daily Scraper)

### Purpose
Keep event/fight data accurate in the days/weeks leading up to events. Handle cancellations, additions, and changes.

### Implementation

**Schedule**: Daily at 12pm EST (5pm UTC)

**Cron Expression**: `0 17 * * *` (12pm EST = 5pm UTC, accounting for EDT)

**Key Features**:
1. **Duplicate Prevention**
   - Use `ufcUrl` as primary unique identifier (already has `@@unique` constraint)
   - Upsert logic: `where: { ufcUrl }` for events
   - For fights: Match by `eventId + fighter1Id + fighter2Id`

2. **Change Detection**
   - Compare scraped data with DB
   - Log changes: cancellations, new fights, updated times
   - Update existing records rather than create duplicates

3. **Fight Sync Logic**
   ```typescript
   // For each scraped fight:
   1. Find existing fight by fighters + event
   2. If exists → Update orderOnCard, weightClass, etc.
   3. If new → Create fight
   4. If DB fight not in scraped data → Mark as cancelled (add `isCancelled` field)
   ```

**Code Location**: `packages/backend/src/services/backgroundJobs.ts`

**New Cron Job**:
```typescript
// Add to startBackgroundJobs():
const dailyScraperJob = cron.schedule('0 17 * * *', async () => {
  console.log('[Background Jobs] Running daily UFC scraper...');
  try {
    await runDailyUFCScraper();
  } catch (error) {
    console.error('[Background Jobs] Daily scraper failed:', error);
  }
});
```

---

## TIER 2: Live Event Tracking (Improved Scheduler)

### Current Problem
Every 5 minutes, scheduler queries DB for events starting soon. Wasteful and can miss events if server restarts.

### Recommended Solution: Direct Scheduling

**How It Works**:
1. On server startup, query upcoming events
2. For each event with `earlyPrelimStartTime`/`prelimStartTime`/`mainStartTime`:
   - Calculate exact start time minus 15-minute buffer
   - Schedule `setTimeout()` to start tracker at that exact moment
3. Store scheduled jobs in memory with event IDs
4. On new event creation (via scraper), schedule its tracker

**Benefits**:
- ✅ No polling overhead
- ✅ Precise timing (starts exactly 15min before)
- ✅ Scales to hundreds of events without performance hit
- ✅ Can reschedule if event time changes

**Implementation**:
```typescript
// New file: packages/backend/src/services/liveEventDirectScheduler.ts

interface ScheduledEvent {
  eventId: string;
  eventName: string;
  timeoutId: NodeJS.Timeout;
  scheduledFor: Date;
}

const scheduledEvents = new Map<string, ScheduledEvent>();

export async function scheduleUpcomingEvents() {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Next 30 days

  const events = await prisma.event.findMany({
    where: {
      promotion: 'UFC',
      isComplete: false,
      date: { gte: now, lte: cutoff }
    },
    select: { id: true, name: true, ufcUrl: true, earlyPrelimStartTime: true,
              prelimStartTime: true, mainStartTime: true }
  });

  for (const event of events) {
    scheduleEvent(event);
  }
}

function scheduleEvent(event) {
  const earliestStartTime = [
    event.earlyPrelimStartTime,
    event.prelimStartTime,
    event.mainStartTime
  ].filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0];

  if (!earliestStartTime) return;

  const bufferTime = new Date(earliestStartTime.getTime() - 15 * 60 * 1000);
  const msUntilStart = bufferTime.getTime() - Date.now();

  if (msUntilStart < 0) return; // Already started

  const timeoutId = setTimeout(async () => {
    await startLiveTracking({
      eventId: event.id,
      eventUrl: event.ufcUrl,
      eventName: event.name,
      intervalSeconds: 30
    });
    scheduledEvents.delete(event.id);
  }, msUntilStart);

  scheduledEvents.set(event.id, {
    eventId: event.id,
    eventName: event.name,
    timeoutId,
    scheduledFor: bufferTime
  });

  console.log(`[Direct Scheduler] Scheduled ${event.name} for ${bufferTime.toISOString()}`);
}
```

**Migration Strategy**:
1. Keep current 5-minute scheduler as backup for 2 weeks
2. Run both systems simultaneously
3. Once validated, disable old scheduler
4. Delete old `liveEventScheduler.ts` after validation period

---

## TIER 3: Failsafe System (Time-Based Cleanup)

### Purpose
Ensure events/fights eventually complete even if live tracker fails, server crashes, or UFC.com doesn't update properly.

### Rules

**For Fights**:
1. If `hasStarted=true` and `isComplete=false`
2. AND current time > fight event start time + 6 hours
3. → Mark `isComplete=true`, `completionMethod='failsafe-timeout'`, `winner=null`

**For Events**:
1. If all fights are `isComplete=true`
2. → Mark event `isComplete=true`, `completionMethod='all-fights-complete'`
3. If `hasStarted=true` and current time > event date + 8 hours
4. → Force complete event and all remaining fights, `completionMethod='failsafe-timeout'`

**Schedule**: Every hour (safer than every 10 minutes)

**Cron Expression**: `0 * * * *`

**Implementation**:
```typescript
// New file: packages/backend/src/services/failsafeCleanup.ts

export async function runFailsafeCleanup() {
  const now = new Date();
  const results = { fightsCompleted: 0, eventsCompleted: 0 };

  // 1. Complete stuck fights (6+ hours old)
  const stuckFightCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const stuckFights = await prisma.fight.findMany({
    where: {
      hasStarted: true,
      isComplete: false,
      event: {
        date: { lt: stuckFightCutoff }
      }
    },
    include: {
      event: { select: { name: true, date: true } },
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } }
    }
  });

  for (const fight of stuckFights) {
    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        isComplete: true,
        completionMethod: 'failsafe-timeout',
        completedAt: now
      }
    });

    console.log(`[Failsafe] Completed stuck fight: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName} from ${fight.event.name}`);
    results.fightsCompleted++;
  }

  // 2. Complete events where all fights are done
  const eventsWithAllFightsComplete = await prisma.event.findMany({
    where: {
      isComplete: false,
      hasStarted: true
    },
    include: {
      fights: { select: { isComplete: true } }
    }
  });

  for (const event of eventsWithAllFightsComplete) {
    if (event.fights.every(f => f.isComplete)) {
      await prisma.event.update({
        where: { id: event.id },
        data: {
          isComplete: true,
          completionMethod: 'all-fights-complete'
        }
      });

      console.log(`[Failsafe] Completed event (all fights done): ${event.name}`);
      results.eventsCompleted++;
    }
  }

  // 3. Force complete events 8+ hours after start
  const stuckEventCutoff = new Date(now.getTime() - 8 * 60 * 60 * 1000);

  const forceCompleteEvents = await prisma.event.findMany({
    where: {
      hasStarted: true,
      isComplete: false,
      date: { lt: stuckEventCutoff }
    }
  });

  for (const event of forceCompleteEvents) {
    // Complete event
    await prisma.event.update({
      where: { id: event.id },
      data: {
        isComplete: true,
        completionMethod: 'failsafe-force-timeout'
      }
    });

    // Complete any remaining fights
    await prisma.fight.updateMany({
      where: {
        eventId: event.id,
        isComplete: false
      },
      data: {
        isComplete: true,
        completionMethod: 'failsafe-force-timeout',
        completedAt: now
      }
    });

    console.log(`[Failsafe] Force completed event and remaining fights: ${event.name}`);
    results.eventsCompleted++;
  }

  return results;
}
```

**Add to backgroundJobs.ts**:
```typescript
const failsafeJob = cron.schedule('0 * * * *', async () => {
  console.log('[Background Jobs] Running failsafe cleanup...');
  try {
    const results = await runFailsafeCleanup();
    if (results.fightsCompleted > 0 || results.eventsCompleted > 0) {
      console.log(`[Failsafe] Completed ${results.fightsCompleted} fights, ${results.eventsCompleted} events`);
    }
  } catch (error) {
    console.error('[Background Jobs] Failsafe cleanup failed:', error);
  }
});
```

---

## Database Schema Changes

### Add Fields to Track Completion Method

**Event Model**:
```prisma
model Event {
  // ... existing fields ...

  completionMethod  String?  // 'scraper' | 'all-fights-complete' | 'failsafe-timeout' | 'failsafe-force-timeout'

  // ... rest of model ...
}
```

**Fight Model**:
```prisma
model Fight {
  // ... existing fields ...

  completionMethod  String?  // 'scraper' | 'failsafe-timeout' | 'failsafe-force-timeout'
  completedAt       DateTime?  // Timestamp when marked complete
  isCancelled       Boolean @default(false)  // NEW: Detect fight cancellations

  // ... rest of model ...
}
```

**Migration Command**:
```bash
cd packages/backend
npx prisma migrate dev --name add_completion_tracking
```

---

## Implementation Roadmap

### Phase 1: Immediate Fixes (Week 1)

1. **Add Daily Scraper Cron Job**
   - ✅ Code exists, just needs scheduling
   - Add duplicate prevention logic
   - Test on staging for 3 days
   - **Estimated Time**: 4 hours

2. **Implement Failsafe Cleanup**
   - Create `failsafeCleanup.ts`
   - Add database fields
   - Schedule hourly cron
   - **Estimated Time**: 6 hours

3. **Clean Existing Stuck Events** (ONE-TIME)
   - Write migration script to mark old events complete
   - Run on production after testing
   - **Estimated Time**: 2 hours

### Phase 2: Optimization (Week 2-3)

4. **Implement Direct Scheduler**
   - Create `liveEventDirectScheduler.ts`
   - Run in parallel with old scheduler
   - Monitor for 1 week
   - **Estimated Time**: 8 hours

5. **Enhanced Duplicate Prevention**
   - Add `ufcUrl` matching logic to scraper
   - Add logging for all upserts
   - Test with known duplicate scenarios
   - **Estimated Time**: 4 hours

### Phase 3: Validation & Cleanup (Week 3-4)

6. **Remove Old Scheduler**
   - Disable 5-minute polling
   - Delete `liveEventScheduler.ts`
   - **Estimated Time**: 1 hour

7. **Monitoring Dashboard** (Optional)
   - Add admin endpoint: `GET /api/admin/event-health`
   - Show stuck events, completion rates, failsafe triggers
   - **Estimated Time**: 6 hours

---

## Testing Strategy

### Unit Tests
```typescript
// Test failsafe logic
describe('Failsafe Cleanup', () => {
  it('should complete fights >6 hours old', async () => {
    // Create stuck fight from 7 hours ago
    // Run failsafe
    // Verify marked complete
  });

  it('should complete event when all fights done', async () => {
    // Create event with 3 fights, all complete
    // Run failsafe
    // Verify event marked complete
  });
});
```

### Integration Tests
- Daily scraper with duplicate events (same ufcUrl)
- Live tracker starting at exact scheduled time
- Failsafe running after simulated tracker failure

### Manual QA Checklist
- [ ] Daily scraper runs at 12pm EST for 3 consecutive days
- [ ] Duplicate event not created when scraper re-runs
- [ ] Fight cancellation detected and marked
- [ ] Live tracker starts 15min before event
- [ ] Event auto-completes when all fights done
- [ ] Stuck fight from yesterday marked complete by failsafe
- [ ] Admin health endpoint shows accurate data

---

## Monitoring & Alerting

### Recommended Logs
```typescript
// Track all completion methods
console.log(`[Event Complete] ${eventName} - Method: ${completionMethod}`);

// Alert on failsafe triggers
if (completionMethod.includes('failsafe')) {
  console.warn(`[ALERT] Failsafe triggered for ${eventName}`);
}

// Track scraper success rates
console.log(`[Scraper] Synced ${updated} events, ${new} new, ${duplicates} duplicates prevented`);
```

### Health Metrics to Track
1. **Scraper Health**: Daily success rate, duplicate prevention count
2. **Tracker Health**: Events tracked, average scrape time, failures
3. **Failsafe Health**: Triggers per week (should be low), events auto-completed
4. **Data Accuracy**: % of events completed by scraper vs failsafe (target: 95%+ scraper)

---

## Answers to Your Specific Questions

### Q: How to run daily scraper at 12pm EST?
**A**: Add cron job `'0 17 * * *'` to `backgroundJobs.ts` (see TIER 1 above)

### Q: Should we replace 5-minute checker with direct scheduling?
**A**: **YES**. Direct scheduling is more efficient, precise, and scalable. Implement per TIER 2 proposal. Keep old system running in parallel for 1-2 weeks as safety net.

### Q: How to mark events complete when all fights done?
**A**: This is already partially implemented in `ufcLiveParser.ts` (lines 343-355), but should be reinforced by TIER 3 failsafe running hourly.

### Q: How to ensure completion even if tracker fails?
**A**: TIER 3 time-based failsafe (runs hourly) catches everything the tracker misses. Conservative 6-8 hour timeouts ensure we don't prematurely complete live events.

### Q: Best system for staying accurate over time?
**A**: **All 3 tiers working together**:
- TIER 1 keeps pre-event data fresh
- TIER 2 handles live tracking optimally
- TIER 3 guarantees cleanup even with failures

This creates a self-healing system where no single component failure causes permanent bad state.

---

## Risk Assessment

### Low Risk
- Adding daily scraper (code exists, just scheduling)
- Failsafe cleanup (defensive, only touches old data)

### Medium Risk
- Direct scheduler (new architecture, test thoroughly)
- Database migrations (needs backup before running)

### High Risk
- Removing old 5-minute scheduler too quickly (run both systems in parallel first)

### Mitigation
- All changes behind feature flags
- Extensive logging for first 2 weeks
- Ability to quickly revert via environment variables

---

## Cost Analysis

### Development Time
- **Phase 1 (Immediate)**: ~12 hours
- **Phase 2 (Optimization)**: ~12 hours
- **Phase 3 (Cleanup)**: ~7 hours
- **Total**: ~31 hours (~4 days)

### Server Resources
- Daily scraper: ~30-60 seconds/day (negligible)
- Failsafe cleanup: ~5 seconds/hour (negligible)
- Direct scheduler: Less CPU than current 5-min polling (improvement)
- **Net Impact**: Reduced server load vs current system

### Maintenance
- Monthly scraper validation: ~30 minutes
- Quarterly system health review: ~1 hour
- Very low ongoing maintenance once stable

---

## Conclusion

This 3-tier system provides:
1. ✅ **Accuracy** - Daily syncs keep data fresh
2. ✅ **Reliability** - Failsafe ensures nothing stuck forever
3. ✅ **Efficiency** - Direct scheduling eliminates wasteful polling
4. ✅ **Observability** - Completion methods show what worked/failed
5. ✅ **Scalability** - Handles hundreds of events without performance issues

**Recommendation**: Implement Phase 1 immediately (failsafe + daily scraper) to fix stuck events. Then proceed with Phase 2-3 for optimization over next 2-3 weeks.

Let me know if you'd like me to start implementing any of these components!
