# UFC 320 Live Event Testing

## Objective
Test multiple data sources during UFC 320 (October 4, 2025) to determine which provides the best real-time round-by-round fight data.

## What We're Testing

### 1. SerpAPI (Google Results)
- **What:** Google's UFC search knowledge panel via SerpAPI
- **Looking for:** Live round numbers, time remaining, fight status
- **Cost:** Free tier = 100 searches/month, Paid ~$50/month for 5K searches
- **Setup required:** Sign up at https://serpapi.com and get API key

### 2. api-sports.io
- **What:** MMA API with status codes (EOR, WO, R1, R2, etc.)
- **Looking for:** Real-time status changes with timestamps
- **Cost:** Free tier = 100 req/day (already have API key)
- **Limitation:** Free tier has limited date access

### 3. ESPN (Fallback)
- **What:** ESPN MMA live tracker page scraping
- **Looking for:** Structured HTML with round/time data
- **Cost:** Free (scraping)
- **Risk:** Against ToS, could be blocked

## Setup Instructions

### Step 1: Install Dependencies
```bash
cd packages/backend
pnpm install axios
```

### Step 2: Set Environment Variables
Create `.env` file in `packages/backend/`:
```env
SERPAPI_KEY=your_serpapi_key_here
```

**Get SerpAPI key:**
1. Sign up at https://serpapi.com
2. Free tier gives 100 searches/month
3. Copy your API key

### Step 3: Test the Script (Before Live Event)
```bash
# Test that everything works
cd packages/backend
npx ts-node src/services/liveEventTester.ts
```

Press Ctrl+C after a few snapshots to verify it's working.

Check `packages/backend/test-results/` for output files.

## Running During Live Event

### UFC 320 Event Details
- **Event:** UFC 320: Ankalaev vs. Pereira 2
- **Date:** Saturday, October 4, 2025
- **Time:** TBD (check UFC.com for exact time)
- **Main Card:** Typically starts around 10 PM ET / 7 PM PT

### When to Start
Start polling **30 minutes before the main card** starts.

### Run Command
```bash
cd packages/backend
npx ts-node src/services/liveEventTester.ts
```

### What You'll See
```
🚀 Starting live event tester...
📊 Polling every 30 seconds
📁 Results will be saved to: /path/to/test-results

UFC 320: Ankalaev vs. Pereira 2
Date: Saturday, October 4, 2025

[2025-10-04T22:30:00.000Z] Capturing data snapshot...
SerpAPI: ✅ Success
api-sports.io: ✅ 13 fights
ESPN: ✅ Accessible
💾 Saved 10 snapshots to ufc-320-test-1728073800000.json

💡 Press Ctrl+C to stop and save results
```

### How Long to Run
Run for **at least one complete fight** (15-25 minutes).

Ideally, run for **2-3 fights** to see round changes.

### Stop the Test
Press **Ctrl+C** when done. It will automatically save all results.

## Analyzing Results

### Files Created
- `ufc-320-test-[timestamp].json` - All captured data
- `summary.json` - Quick overview of test

### What to Look For

**In the JSON files, search for:**

1. **SerpAPI data:**
   ```json
   {
     "sports_results": {
       "current_round": 2,        // ← Does this exist?
       "time_remaining": "3:45",  // ← Does this exist?
       "status": "Round 2"        // ← What does this show?
     }
   }
   ```

2. **api-sports.io data:**
   ```json
   {
     "status": {
       "short": "R2",   // ← Does it change? (NS → WO → R1 → EOR → R2)
       "long": "Round 2"
     },
     "timestamp": "..."  // ← When did status change?
   }
   ```

3. **Status changes over time:**
   - Compare consecutive snapshots
   - Did status codes change between rounds?
   - Are there timestamps for changes?

## Decision Criteria

After the test, we'll decide based on:

| Criteria | Weight | Questions |
|----------|--------|-----------|
| **Round-level timing** | 10/10 | Does it show individual round start/end? |
| **Latency** | 8/10 | How quickly does data update? |
| **Reliability** | 9/10 | Were there any failures/gaps? |
| **Cost** | 7/10 | Monthly cost for production use? |
| **Data quality** | 8/10 | Is data accurate and complete? |

## Next Steps After Test

### If SerpAPI has round data:
→ Use SerpAPI for live updates ($50/month acceptable)

### If api-sports.io has round data:
→ Use api-sports.io (cheaper, but verify free tier works)

### If neither has round data:
→ Build ESPN scraper with Puppeteer (more work, legal risk)

### If no one has round data:
→ Accept fight-level timing only + estimate rounds algorithmically

## Questions to Answer

- [ ] Does any source show "Round 1", "Round 2", "Round 3" labels?
- [ ] Does any source show time remaining in round?
- [ ] How quickly does data update when rounds change?
- [ ] Are there timestamps for round start/end?
- [ ] Which source has the most reliable/complete data?

## Troubleshooting

**"SERPAPI_KEY not found"**
- Make sure `.env` file exists in `packages/backend/`
- Run: `echo $SERPAPI_KEY` (Mac/Linux) or `echo %SERPAPI_KEY%` (Windows)

**"Network timeout"**
- Check your internet connection
- APIs might be slow during high traffic (fight night)

**"No fights found in api-sports.io"**
- Free tier has limited date access
- Might need paid plan for current events

**Script crashes**
- Check `packages/backend/test-results/` for partial results
- Restart script and let it continue

## Contact

If you need help during the live test, have the error logs ready!
