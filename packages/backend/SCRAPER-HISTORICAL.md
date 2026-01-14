# Historical Fight Data Scraper System

This document explains the Wikipedia-based historical fight data scraping system used to backfill fight outcomes (winner, method, round, time) for past events.

## Next Step: Run Merge Script

Scraping is complete. Run the merge to update the database:

```bash
cd packages/backend
npx ts-node src/services/historical/mergeHistoricalData.ts --dry-run --verbose
```

See [Merging with Database](#merging-with-database) section for full instructions.

---

## Overview

The FightCrewApp database has thousands of historical fights that were imported without outcome data. This scraper system collects fight results from Wikipedia and saves them to JSON files for later merging with the production database.

## Latest Scrape Results (January 2026)

| Promotion | Events | Fights | File Size | Status |
|-----------|--------|--------|-----------|--------|
| UFC | 321 | 3,469 | 1.0 MB | ✅ Complete |
| Bellator | 105 | 10,803 | 2.7 MB | ✅ Complete |
| BKFC | 138 | 1,417 | ~300 KB | ✅ Complete |
| ONE | 78 | 959 | 268 KB | ✅ Complete |
| Pride FC | 23 | 1,290 | 313 KB | ✅ Complete |
| WEC | 53 | 827 | 212 KB | ✅ Complete |
| PFL | 71 | 722 | 196 KB | ✅ Complete |
| **Total** | **789** | **19,487** | **~5.5 MB** | |

### Scrapers Needing Fixes

| Promotion | Issue | Fix Needed |
|-----------|-------|-----------|
| Strikeforce | Link pattern not matching | Update `linkPattern` regex |
| Invicta FC | No events found | Update `listUrl` and patterns |

### BKFC Note

BKFC uses a different Wikipedia structure - year-based pages instead of individual event pages:
- `2024_in_Bare_Knuckle_Fighting_Championship` contains all 2024 events
- The scraper iterates through years 2018-2025

### Estimated Scope (Original)

## Directory Structure

```
packages/backend/src/services/historical/
├── scrapeWikipediaUFC.js      # UFC-specific scraper
├── scrapeWikipediaMMA.js      # Multi-promotion MMA scraper
├── scrapeWikipediaBKFC.js     # BKFC-specific scraper
├── runAllHistoricalScrapers.js # Master orchestrator
├── test-ufc-scraper.js        # Test script for UFC
└── debug-wiki-structure.js    # Debug helper

packages/backend/scraped-data/historical/
├── ufc-historical-latest.json      # UFC results
├── bellator-historical-latest.json # Bellator results
├── one-historical-latest.json      # ONE Championship results
├── pride-historical-latest.json    # Pride FC results
├── wec-historical-latest.json      # WEC results
├── bkfc-historical-latest.json     # BKFC results
├── pfl-historical-latest.json      # PFL results
├── strikeforce-historical-latest.json # Strikeforce results
├── invicta-historical-latest.json  # Invicta results
└── historical-scrape-summary.json  # Overall summary
```

## How It Works

### 1. Wikipedia Table Structure

Wikipedia MMA event pages use a consistent table structure with class `toccolours`:

```
| Weight class | Winner | def. | Loser | Method | Round | Time | Notes |
|--------------|--------|------|-------|--------|-------|------|-------|
| Lightweight  | Fighter A | def. | Fighter B | TKO | 2 | 4:37 | |
```

The scraper:
1. Finds tables with class `toccolours`
2. Identifies the "def." cell to locate winner/loser columns
3. Extracts method, round, and time from subsequent columns
4. Normalizes method names (e.g., "Technical Knockout" → "TKO")

### 2. Data Collection Process

```
Wikipedia Event Page
        ↓
   Puppeteer fetches page
        ↓
   Parse toccolours table
        ↓
   Extract: winner, loser, method, round, time
        ↓
   Normalize method names
        ↓
   Save to JSON
```

### 3. Output JSON Format

```json
{
  "scrapeDate": "2026-01-10T03:09:41.101Z",
  "promotion": "UFC",
  "totalEvents": 321,
  "totalFights": 3469,
  "events": [
    {
      "eventName": "UFC 300",
      "eventDate": "April 13, 2024",
      "venue": "T-Mobile Arena",
      "location": "Las Vegas, Nevada",
      "fights": [
        {
          "cardType": "Main Card",
          "weightClass": "Light Heavyweight",
          "winner": "Alex Pereira",
          "loser": "Jamahal Hill",
          "method": "KO",
          "round": 1,
          "time": "3:14"
        }
      ]
    }
  ]
}
```

## Usage

### Run All Scrapers

```bash
cd packages/backend
node src/services/historical/runAllHistoricalScrapers.js
```

This runs all promotions sequentially. Estimated time: 3-4 hours.

### Run Single Promotion

```bash
# UFC only
node src/services/historical/scrapeWikipediaUFC.js

# Other MMA promotions
node src/services/historical/scrapeWikipediaMMA.js bellator
node src/services/historical/scrapeWikipediaMMA.js one
node src/services/historical/scrapeWikipediaMMA.js pride
node src/services/historical/scrapeWikipediaMMA.js wec
node src/services/historical/scrapeWikipediaMMA.js pfl
node src/services/historical/scrapeWikipediaMMA.js strikeforce
node src/services/historical/scrapeWikipediaMMA.js invicta

# BKFC
node src/services/historical/scrapeWikipediaBKFC.js
```

### Run with Orchestrator (Single Promotion)

```bash
node src/services/historical/runAllHistoricalScrapers.js --promotion ufc
node src/services/historical/runAllHistoricalScrapers.js --promotion bellator
```

## Method Normalization

The scraper normalizes fight methods to standard values:

| Wikipedia Text | Normalized Value |
|---------------|------------------|
| Knockout, KO | `KO` |
| Technical knockout, TKO | `TKO` |
| Submission (rear-naked choke) | `Submission` |
| Decision (unanimous) | `Decision (Unanimous)` |
| Decision (split) | `Decision (Split)` |
| Decision (majority) | `Decision (Majority)` |
| Draw | `Draw` |
| No contest, NC | `No Contest` |

## Progress Tracking

The orchestrator saves progress files:

- `ufc-progress-50.json` - After every 50 UFC events
- `bellator-progress-25.json` - After every 25 Bellator events
- `scraping-progress.json` - Overall progress across promotions

## Merging with Database

The merge script updates existing database fights with outcome data from the scraped JSON files.

### Merge Script Location

```
packages/backend/src/services/historical/
├── mergeHistoricalData.ts   # Main merge script
├── matchingUtils.ts         # Event/fight matching helpers
└── mergeTypes.ts            # TypeScript interfaces
```

### Usage

```bash
cd packages/backend

# Dry run (preview changes, no database updates)
npx ts-node src/services/historical/mergeHistoricalData.ts --dry-run

# Dry run with verbose output
npx ts-node src/services/historical/mergeHistoricalData.ts --dry-run --verbose

# Apply changes to database
npx ts-node src/services/historical/mergeHistoricalData.ts --apply

# Single promotion only
npx ts-node src/services/historical/mergeHistoricalData.ts --promotion ufc --apply
```

### How It Works

1. **Event Matching**: Matches scraped event names to database events
   - Exact name match (case-insensitive)
   - Event number extraction (e.g., "UFC 300" matches "UFC 300: Pereira vs Hill")
   - Fuzzy name matching (80%+ similarity)

2. **Fight Matching**: For each matched event, finds corresponding DB fights
   - Matches winner/loser names to fighter1/fighter2 (either direction)
   - Uses `fighterMatcher.ts` for name normalization and fuzzy matching
   - Handles name variations (e.g., "Alex" vs "Alexander")

3. **Confidence Levels**:
   - **HIGH**: Exact name match for both fighters
   - **MEDIUM**: Fuzzy match (85%+ similarity)
   - **LOW**: Partial match (skipped by default)

4. **Updates Applied**:
   - `winner`: fighter1Id, fighter2Id, "draw", or "nc"
   - `method`: Normalized (KO, TKO, Submission, Decision, etc.)
   - `round`: Round number (1-5)
   - `time`: Time string (e.g., "4:37")

### Output

The merge script generates a JSON report:

```
scraped-data/historical/merge-report-<timestamp>.json
```

Report includes:
- Per-promotion statistics
- Unmatched events and fights
- Low-confidence matches for manual review
- Any errors encountered

### Workflow

1. Run `scripts/count-fights-needing-outcomes.js` to see current state
2. Run merge with `--dry-run --verbose` to preview
3. Review the generated report
4. Run merge with `--apply` to update database
5. Run count script again to verify results

## Troubleshooting

### No Fights Found

Some Wikipedia pages may not have results tables:
- Cancelled events (e.g., UFC 176)
- Future events
- Events with different table structures

### Rate Limiting

The scraper uses a 1.5 second delay between pages to be respectful to Wikipedia. If you get blocked:
- Increase `DELAY_BETWEEN_PAGES` in the scraper files
- Wait and try again later

### Name Mismatches

Wikipedia may use different name formats:
- "Jon Jones" vs "Jonathan Jones"
- "José Aldo" vs "Jose Aldo"
- Fighter nicknames in parentheses

The merge script uses `fighterMatcher.ts` for fuzzy matching, which handles:
- Name normalization (removes accents, punctuation)
- 30+ first name variations (Alex/Alexander, Mike/Michael, etc.)
- Levenshtein distance similarity scoring

## Files Created

After a full run, you'll have:

```
scraped-data/historical/
├── ufc-historical-latest.json         (~1 MB)
├── bellator-historical-latest.json    (~500 KB)
├── one-historical-latest.json         (~300 KB)
├── pride-historical-latest.json       (~100 KB)
├── wec-historical-latest.json         (~100 KB)
├── bkfc-historical-latest.json        (~80 KB)
├── pfl-historical-latest.json         (~50 KB)
├── strikeforce-historical-latest.json (~80 KB)
├── invicta-historical-latest.json     (~50 KB)
└── historical-scrape-summary.json     (~2 KB)
```

## Related Files

- `scripts/count-fights-needing-outcomes.js` - Counts fights in DB missing outcome data
- `src/services/historical/mergeHistoricalData.ts` - Merge script for applying outcomes
- `src/utils/fighterMatcher.ts` - Fighter name fuzzy matching utilities
- Database schema: `prisma/schema.prisma` - Fight model with winner, method, round, time fields
