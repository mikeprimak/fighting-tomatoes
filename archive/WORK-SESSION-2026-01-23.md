# Work Session - January 23, 2026

## ONE FC Live Event Tracker Implementation

### Goal
Build a live event tracker for ONE Championship events that monitors fights in real-time, detects when fights start/end, captures results, and handles cancellations.

### Files Created

| File | Purpose |
|------|---------|
| `packages/backend/src/services/oneFCLiveScraper.ts` | Puppeteer-based scraper for ONE FC event pages |
| `packages/backend/src/services/oneFCLiveParser.ts` | Database updater with cancellation detection |
| `packages/backend/src/services/oneFCLiveTracker.ts` | 60-second polling orchestrator |
| `packages/backend/src/routes/liveEvents.ts` | Added ONE FC API endpoints |

### Features Implemented

**Fight Status Detection:**
- ✅ Complete - Has `.sticker.is-win` with winner/method/round
- 🔴 Live - Has `.is-live` indicator
- ⏳ Upcoming - No live/win indicators

**Result Parsing:**
- Winner detection via sticker position relative to fighter
- Method extraction (KO, TKO, UD, MD, SUB, etc.)
- Round number parsing from sticker text

**Cancellation Handling:**
- Fights missing from page → marked `isCancelled: true`
- Cancelled fights that reappear → marked `isCancelled: false`
- Changed fights (different fighter names) → old fight cancelled

**Notifications:**
- Sends notification when a fight goes LIVE
- Sends notification for the NEXT fight when one completes

### API Endpoints Added

```
POST /api/live-events/onefc/start
POST /api/live-events/onefc/stop
GET  /api/live-events/onefc/status
POST /api/live-events/onefc/auto-start
```

### Testing

**Local Testing (ONE Friday Fights 139):**
- Scraper found 14 fights (duplicates filtered)
- Winner detection working correctly
- Method/round parsing accurate

**Production Testing:**
1. Deployed to Render via git push
2. Ran ONE FC scraper to import event data
3. Imported ONE Friday Fights 139 with 15 fights
4. Started live tracker via API
5. Tracker ran 1 scrape, updated 4 fights with results
6. Event auto-marked as complete, tracker auto-stopped

### Results

Event `ONE Friday Fights 139` in production DB:
- `hasStarted: true`
- `isComplete: true`
- 4 fights updated with winners/methods/rounds

### Issues Encountered & Resolved

1. **Duplicate fights** - Fixed by adding `seenFights` Set to deduplicate
2. **Wrong winner detection** - Fixed by checking sticker parent containers
3. **`matchupIsLive` undefined error** - Removed stale variable reference
4. **Import not running** - Created separate import script

### Commits

```
3f7aa3f - Add ONE FC live event tracker
```

### Next Steps

- Test with live event (ONE Fight Night 39 on Jan 24)
- Monitor for any edge cases with different fight card layouts
- Consider adding GitHub Actions workflow for automated tracking
