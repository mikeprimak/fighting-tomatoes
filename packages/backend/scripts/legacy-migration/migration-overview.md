# Legacy Migration Overview

Single source of truth for migrating data from the legacy fightingtomatoes.com MySQL database to the new FightCrewApp PostgreSQL database.

---

## Quick Start

```bash
cd packages/backend

# Step 1: Wipe all existing data
node scripts/legacy-migration/wipe-legacy-data.js --confirm

# Step 2: Setup legacy tags (replaces all tags with legacy definitions)
node scripts/legacy-migration/setup-legacy-tags.js --confirm

# Step 3: Sync everything from live MySQL
node scripts/legacy-migration/mysql-export/sync-all-from-live.js

# Step 4: Update statistics
node update-rating-stats.js          # Fight stats
node scripts/legacy-migration/update-user-stats.js   # User stats

# Step 5: Verify
node scripts/legacy-migration/wipe-legacy-data.js --verify
```

---

## Legacy Database Structure

### Connection Details
- **Host:** `216.69.165.113`
- **Port:** `3306`
- **User:** `fotnadmin`

### Database Layout

| Database | Table/Naming Convention | Description |
|----------|------------------------|-------------|
| `fightdb` | `users` | User accounts (email, displayname, ismedia, etc.) |
| `fightdb` | `fighters` | Fighter profiles (fname, lname, nickname, pic1filepath) |
| `fightdb` | `fightcards` | Events (promotion, eventname, date, pic1filepath) |
| `fightdb` | `fights` | Fight records (fighters, results, stats) |
| `userfightratings` | `{MD5(email)}` | Per-user rating tables (score, fightid, time_of_rating) |
| `userfighttags` | `{MD5(email)}` | Per-user tag tables (fightid, tagname) |
| `fightreviewsdb` | `{fightid}` | Per-fight review tables (comment, commenteremail, helpful, upvoters) |

### MD5 Email Hash Convention

User-specific data (ratings, tags) is stored in tables named by the MD5 hash of the user's lowercase email:

```javascript
const tableName = crypto.createHash('md5')
  .update(user.email.toLowerCase())
  .digest('hex');
// Example: "test@example.com" -> "973dfe463ec85785f5f95af5ba3906ee"
```

### Key Legacy Columns

**fighters table:**
```sql
id, fname, lname, nickname, pic1filepath
```

**fightcards table:**
```sql
id, promotion, eventname, date, pic1filepath
```

**fights table:**
```sql
id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
winner, method, round, time, weightclass, istitle,
orderoncard, prelimcode, hasstarted, percentscore, numvotes, deleted
```

**users table:**
```sql
id, emailaddress, displayname, ismedia, mediaorganization,
reviewerscore, numreviews, confirmedemail, maptoemail
-- Note: maptoemail is NOT reliable - use MD5(emailaddress) instead
```

**userfightratings.{md5email}:**
```sql
fightid (varchar), score (int), time_of_rating (datetime)
```

**userfighttags.{md5email}:**
```sql
fightid (varchar), tagid (int)
-- Note: tagid is FK to fightdb.tags table, NOT the tag name directly
```

**fightdb.tags (legacy tag definitions):**
```sql
id (int), tag (varchar)
-- 41 tags total (after deduplication)
```

**Complete Legacy Tag List (41 tags):**
| ID | Tag | Category |
|----|-----|----------|
| 1 | Brutal | EMOTION |
| 2 | Explosive | STYLE |
| 4 | Technical | STYLE |
| 14 | Climactic | EMOTION |
| 15 | Surprising | EMOTION |
| 16 | Striking-heavy | STYLE |
| 17 | Submission-heavy | STYLE |
| 18 | Balanced | STYLE |
| 19 | Back-and-Forth | STYLE |
| 20 | Competitive | STYLE |
| 21 | Fast-paced | PACE |
| 23 | Bloody | OUTCOME |
| 24 | Scrappy | STYLE |
| 26 | Controversial | EMOTION |
| 27 | One-sided | OUTCOME |
| 28 | Heart | EMOTION |
| 29 | Walk Off | OUTCOME |
| 31 | Great Grappling | STYLE |
| 32 | Wild | STYLE |
| 33 | Chaotic | STYLE |
| 34 | Edge Of Your Seat | EMOTION |
| 35 | Boring | QUALITY |
| 36 | BJJ | STYLE |
| 37 | Funny | EMOTION |
| 38 | Comeback | EMOTION |
| 39 | FOTN | QUALITY |
| 40 | FOTY | QUALITY |
| 41 | POTN | QUALITY |
| 42 | Disappointing | QUALITY |
| 43 | Stand Up Battle | STYLE |
| 44 | Unique Style | STYLE |
| 45 | Crowd-pleasing | EMOTION |
| 46 | High-stakes | EMOTION |
| 47 | Instant Classic | QUALITY |
| 48 | Must-watch | QUALITY |
| 49 | KO | OUTCOME |
| 50 | Brawl | STYLE |
| 51 | Kick-heavy | STYLE |
| 52 | Wrestling-oriented | STYLE |
| 53 | Charged | EMOTION |
| 54 | War | STYLE |

Note: All legacy tags have `forHighRatings`, `forMediumRatings`, `forLowRatings`, `forVeryLowRatings` = false (available for any rating).

**fightreviewsdb.{fightid}:**
```sql
comment (text), commenteremail (varchar), helpful (int), date (int/year),
upvoters (blob) -- Format: "-46--914-" containing legacy user IDs
```

---

## What Gets Migrated

| Source | Target | Notes |
|--------|--------|-------|
| `fightdb.fighters` | `fighters` | With profile images (pic1filepath) |
| `fightdb.fightcards` | `events` | With banner images (pic1filepath) |
| `fightdb.fights` | `fights` | Results, methods, rounds, card order |
| `fightdb.users` | `users` | `password=null` triggers claim flow |
| `userfightratings.*` | `fight_ratings` | Score, timestamp |
| `userfighttags.*` | `fight_tags` | Tag mappings (FOTY, FOTN, etc.) |
| `fightreviewsdb.*` | `fight_reviews` | Content + upvote COUNT (helpful field) |
| `fightreviewsdb.*.upvoters` | `review_votes` | Individual upvote records |

## What Does NOT Get Migrated

| Data | Reason |
|------|--------|
| Legacy passwords | Users must claim account and set new password |
| Deleted fights | `WHERE deleted = 0` filter |
| Future events | Come from scrapers AFTER migration |

**Note:** Unconfirmed users ARE now migrated (filter was removed Jan 2026).

---

## Sync Order (Dependencies Matter)

The sync script runs in this exact order:

```
1. FIGHTERS (no dependencies)
   └── Creates fighter records with profile images

2. EVENTS (no dependencies)
   └── Creates event records with banner images

3. FIGHTS (depends on: fighters, events)
   └── Creates fight records
   └── Builds legacyFightId → newFightId mapping

4. USERS (no dependencies)
   └── Creates user records (password=null)
   └── Builds legacyUserId → newUserId mapping

5. RATINGS (depends on: fights, users)
   └── Uses MD5(email) to find rating tables
   └── Links to new fight/user IDs

6. TAGS (depends on: fights, users)
   └── Uses MD5(email) to find tag tables
   └── NOT maptoemail (unreliable)

7. REVIEWS (isolated - depends on: fights, users)
   └── Migrates review content
   └── Migrates upvote COUNT (helpful field)
   └── Non-fatal: errors logged but don't stop migration

8. REVIEW UPVOTES (isolated - depends on: reviews, users)
   └── Parses upvoters buffer ("-46--914-" format)
   └── Creates individual ReviewVote records
   └── Non-fatal: if fails, we still have upvote counts
```

---

## Migration Commands

### 1. Wipe All Data

```bash
cd packages/backend

# Dry run (see what would be deleted)
node scripts/legacy-migration/wipe-legacy-data.js --dry-run

# Execute (requires confirmation)
node scripts/legacy-migration/wipe-legacy-data.js --confirm
```

**Expected output:**
```
╔════════════════════════════════════════╗
║     WIPE LEGACY DATA - COMPLETE RESET  ║
╠════════════════════════════════════════╣
║  Deleted 48,000 ratings                ║
║  Deleted 600 tags                      ║
║  Deleted 770 reviews                   ║
║  Deleted 1,900 users                   ║
║  Deleted 13,500 fights                 ║
║  Deleted 1,300 events                  ║
║  Deleted 6,800 fighters                ║
╚════════════════════════════════════════╝
```

### 2. Sync From Live MySQL

```bash
cd packages/backend/scripts/legacy-migration/mysql-export

# Full sync
node sync-all-from-live.js

# Dry run
node sync-all-from-live.js --dry-run

# Specific steps only
node sync-all-from-live.js --only=fighters
node sync-all-from-live.js --only=events
node sync-all-from-live.js --only=fights
node sync-all-from-live.js --only=users
node sync-all-from-live.js --only=ratings
node sync-all-from-live.js --only=tags
node sync-all-from-live.js --only=reviews
node sync-all-from-live.js --only=upvotes
```

**Expected output:**
```
╔═══════════════════════════════════════════════════════════════╗
║     SYNC ALL DATA FROM LIVE LEGACY DATABASE                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Step 1: FIGHTERS                                             ║
║    Synced:  6,800 fighters (500 with images)                  ║
║                                                               ║
║  Step 2: EVENTS                                               ║
║    Synced:  1,300 events (300 with banner images)             ║
║                                                               ║
║  Step 3: FIGHTS                                               ║
║    Synced:  13,500 fights                                     ║
║    Built fight ID mapping for ratings/tags                    ║
║                                                               ║
║  Step 4: USERS                                                ║
║    Synced:  1,928 users (password=null for claim flow)        ║
║                                                               ║
║  Step 5: RATINGS                                              ║
║    Synced:  48,892 ratings                                    ║
║                                                               ║
║  Step 6: TAGS                                                 ║
║    Synced:  594 tags                                          ║
║                                                               ║
║  Step 7: REVIEWS (isolated)                                   ║
║    Synced:  770 reviews with upvote counts                    ║
║                                                               ║
║  Step 8: REVIEW UPVOTES (isolated)                            ║
║    Synced:  ~2,000 individual upvote records                  ║
╚═══════════════════════════════════════════════════════════════╝
```

### 3. Update Statistics

```bash
cd packages/backend

# Update fight stats (averageRating, totalRatings per fight)
node update-rating-stats.js

# Update user stats (totalRatings, totalReviews, upvotesReceived per user)
node scripts/legacy-migration/update-user-stats.js
```

### 4. Verify Migration

```bash
cd packages/backend
node scripts/legacy-migration/wipe-legacy-data.js --verify
```

---

## Verification Checklist

### Data Counts (Actual from Jan 2026 run)

| Table | Legacy | Synced | Notes |
|-------|--------|--------|-------|
| Fighters | 7,814 | 7,209 | 605 duplicates skipped |
| Events | 1,152 | 1,149 | 3 filtered |
| Fights | 13,974 | 7,926 | 6,041 errors (fighter matching) |
| Users | 1,966 | 1,963 | 3 errors |
| Ratings | ~48,000 | 35,101 | Some users have no ratings |
| Tags | ~594 | 602 | Fixed with setup-legacy-tags.js |
| Reviews | ~770 | 0 | Skipped (too slow) |
| Review Votes | ~2,000 | 0 | Skipped |

### Images

- [x] Fighter images populated (1,239 with images)
- [x] Event banners populated (432 with images)
- [x] Image URLs start with `https://fightingtomatoes.com/`

### Stats Recalculation

- [x] `update-rating-stats.js` completed successfully
- [x] `update-user-stats.js` completed successfully (1,110 users updated)
- [x] Fight "Gaethje vs Pimblett" shows 20 ratings, avg 9
- [x] User `avocadomike@hotmail.com` has 1,286 ratings, 72 reviews, 109 upvotes

### Auth & Account Claim

- [ ] Users with `password=null` trigger claim flow on login
- [ ] Password reset email sends correctly
- [ ] User can claim account and set new password

### Data Integrity

- [ ] A review with upvotes shows correct count AND has ReviewVote records
- [ ] Ratings link correctly to fights (spot check 5 random)
- [ ] Tags link correctly to fights and users
- [ ] No orphaned records (ratings without fights)

---

## Troubleshooting

### Connection refused to MySQL

```
Error: connect ECONNREFUSED 216.69.165.113:3306
```

**Fix:** Check if the legacy MySQL server is accessible. May need VPN or SSH tunnel.

### Fighter name collisions

```
Error: Unique constraint failed on fields: (firstName, lastName)
```

**Cause:** Two fighters with identical names (e.g., multiple "Michael Johnson")
**Fix:** The sync script logs collisions and uses first match. Review logs for manual cleanup.

### Missing reviews (non-fatal)

```
⚠️ Reviews sync failed (non-fatal): ...
```

**Cause:** Review sync is isolated and won't stop migration.
**Fix:** Check error message, then re-run: `node sync-all-from-live.js --only=reviews`

### MD5 table not found

```
Table 'userfightratings.973dfe463ec85785f5f95af5ba3906ee' doesn't exist
```

**Cause:** User has no ratings in legacy system.
**Fix:** Normal - not all users have ratings. Script continues.

### Account claim not working

1. Check `password` column is `null` for legacy users
2. Verify `FRONTEND_URL` env var points to correct domain
3. Check email templates exist for claim flow

---

## Production Checklist

### Before Migration

1. [ ] **Backup production database**
   ```bash
   pg_dump $DATABASE_URL > backup-before-migration.sql
   ```

2. [ ] **Test on staging first**
   ```bash
   DATABASE_URL="postgresql://localhost:5433/goodfights_staging" \
     node scripts/legacy-migration/wipe-legacy-data.js --confirm
   ```

3. [ ] **Verify MySQL access** - Can connect to 216.69.165.113:3306

### During Migration

1. [ ] Run wipe script: `node scripts/legacy-migration/wipe-legacy-data.js --confirm`
2. [ ] Setup legacy tags: `node scripts/legacy-migration/setup-legacy-tags.js --confirm`
3. [ ] Run sync script: `node scripts/legacy-migration/mysql-export/sync-all-from-live.js`
4. [ ] Run fight stats: `node update-rating-stats.js`
5. [ ] Run user stats: `node scripts/legacy-migration/update-user-stats.js`
6. [ ] Verify: `node scripts/legacy-migration/wipe-legacy-data.js --verify`

### After Migration

1. [ ] Test login with a legacy user email
2. [ ] Test account claim flow
3. [ ] Verify ratings appear on fight pages
4. [ ] Verify reviews appear on fight pages
5. [ ] Run scrapers for upcoming events:
   ```bash
   node services/scrapeAllUFCData.js
   node services/scrapeAllOneFCData.js
   ```

---

## Architecture Notes

### Why Wipe ALL Data?

Past event data (fights, events, fighters) comes from the legacy MySQL database, NOT from scrapers. Scrapers only provide FUTURE/upcoming events. Therefore:

1. Wipe everything
2. Import all history from legacy
3. Run scrapers for upcoming events

### Password = null for Claim Flow

Legacy users are imported with `password: null`. This triggers:

1. User tries to log in with email
2. Backend detects `password=null`
3. Backend sends "claim your account" email
4. User clicks link, sets new password
5. Account is now claimed

### Reviews Are Isolated

The reviews sync has historically been problematic (encoding issues, missing data). Design principle: **reviews failure should NOT fail the migration**. If reviews fail:

1. All other data is still migrated
2. Error is logged
3. Re-run `--only=reviews` to retry

### Image URL Handling

Legacy images use relative paths. The sync script prepends `https://fightingtomatoes.com/` to relative paths:

```javascript
// Before: "pics/fighters/jones.jpg"
// After:  "https://fightingtomatoes.com/pics/fighters/jones.jpg"
```

---

## Migration Scripts Reference

All scripts are in `packages/backend/scripts/legacy-migration/`:

| Script | Purpose | Usage |
|--------|---------|-------|
| `wipe-legacy-data.js` | Complete database reset (FK-safe order) | `--dry-run`, `--confirm`, `--verify` |
| `setup-legacy-tags.js` | Replace tags with 41 legacy tag definitions | `--dry-run`, `--confirm` |
| `update-user-stats.js` | Recalculate user totalRatings, totalReviews, upvotesReceived | (no flags) |
| `mysql-export/sync-all-from-live.js` | Main sync script - 8 steps | `--dry-run`, `--only=X`, `--with-reviews` |

### Generated Files

| File | Purpose |
|------|---------|
| `legacy-tag-mapping.json` | Maps legacy tagid (int) → new tag UUID |

### Scripts in `packages/backend/` (root)

| Script | Purpose |
|--------|---------|
| `update-rating-stats.js` | Recalculate fight averageRating and totalRatings |

---

## Migration Run Log (Local/Staging - Jan 2026)

### Final Results (Local/Staging - Jan 31, 2026)

```
╔════════════════════════════════════════════════════════════════╗
║                     DATA SYNC RESULTS                          ║
╠════════════════════════════════════════════════════════════════╣
║  ✅ Fighters     7,209 synced (1,239 with images)              ║
║  ✅ Events       1,149 synced (432 with images)                ║
║  ✅ Fights       7,926 synced (6,041 errors - fighter matching)║
║  ✅ Users        1,942 synced (password=null for claim flow)   ║
║  ✅ Ratings     35,101 synced                                  ║
║  ✅ Tags           602 synced (from 93 users)                  ║
║  ⏭️  Reviews    SKIPPED (too slow over remote MySQL)           ║
║  ⏭️  Upvotes    SKIPPED                                        ║
╠════════════════════════════════════════════════════════════════╣
║                     STATS UPDATE RESULTS                       ║
╠════════════════════════════════════════════════════════════════╣
║  Fight Stats:   Gaethje vs Pimblett = 20 ratings, avg 9        ║
║  User Stats:    1,110 users updated, 832 unchanged             ║
╚════════════════════════════════════════════════════════════════╝
```

### Top Users After Migration

| Email | Ratings | Reviews | Upvotes |
|-------|---------|---------|---------|
| qegjkirljzyodxlwnn@ttirv.org | 1,612 | 0 | 0 |
| rahbi.salahuddin@gmail.com | 1,337 | 6 | 9 |
| dcookmeyer89@gmail.com | 1,290 | 15 | 40 |
| avocadomike@hotmail.com | 1,286 | 72 | 109 |
| andretmichel@gmail.com | 1,181 | 0 | 0 |

### Issues Discovered & Fixed

#### 1. Fighter "nickname" Column Missing
**Problem:** Legacy DB doesn't have a `nickname` column in fighters table.
**Fix:** Removed `nickname` from SELECT query.

#### 2. PostgreSQL Schema Out of Sync
**Problem:** Local DB missing `isVisible` column on events table (P2022 error).
**Fix:** Run `npx prisma db push --accept-data-loss` to sync schema.

#### 3. User Count Mismatch (493 vs 1,966)
**Problem:** Query had `WHERE confirmedemail = 1` which excluded unconfirmed users.
**Fix:** Removed the filter - now syncs ALL 1,963 users.

#### 4. Reviews Too Slow Over Remote MySQL
**Problem:** Reviews sync queries 14,241 individual tables over remote connection.
Only synced 19 reviews in 40+ minutes - unacceptable.
**Fix:** Added `--with-reviews` flag; reviews skipped by default.
**Future:** Optimize with batch queries or mysqldump + local import.

### Known Issues (Not Yet Fixed)

#### 1. Fight Sync Errors (6,041 of 13,974)
**Cause:** Fighter name matching failures. Legacy fights reference fighters
by name (f1fn, f1ln, f2fn, f2ln) but many names don't match our fighters table.
**Examples:** Different spellings, nickname vs real name, special characters.
**Impact:** ~43% of fights missing. These are mostly older fights.
**To investigate:** Log unmatched fighter names for manual review.

#### 2. Tags Sync Returns 0 - FIXED
**Cause:** Legacy stores `tagid` (integer FK to `fightdb.tags`) but our sync
code expected `tagname` string.
**Fixed:** Created `setup-legacy-tags.js` to:
1. Wipe all existing tags
2. Create 41 legacy tags (mimicking prod with all forX flags = false)
3. Generate `legacy-tag-mapping.json` for direct ID mapping
**Result:** 602 tags synced successfully from 93 users.

### Reviews Migration Strategy

The remote MySQL query approach is too slow. Options:

1. **mysqldump + local import** - Dump `fightreviewsdb` database, import locally,
   then run sync against local copy.

2. **Batch query** - Instead of one query per fight, query `SHOW TABLES` to get
   all table names, then batch SELECT from multiple tables.

3. **Accept manual entry** - Reviews are relatively few (~770). Could skip and
   let users re-enter reviews if needed.

Recommended: Option 1 (mysqldump). One-time dump, fast local processing.

### Data Quality Notes

- **Fighters:** 7,814 in legacy → 7,209 synced (605 skipped as duplicates)
- **Events:** 1,152 in legacy → 1,149 synced (3 filtered/duplicates)
- **Fights:** 13,974 in legacy → 7,926 synced (6,041 errors + 7 duplicates)
- **Users:** 1,966 in legacy → 1,963 synced (3 errors, likely invalid emails)
- **Ratings:** 35,101 synced (users without ratings tables silently skipped)

### Next Steps for Production

1. [x] ~~Fix tags sync~~ - DONE: Created `setup-legacy-tags.js` with direct ID mapping
2. [x] ~~Run stats update scripts~~ - DONE: Both fight and user stats updated
3. [ ] Investigate fight errors (6,041 - log unmatched fighter names)
4. [ ] Decide on reviews strategy (mysqldump recommended)
5. [ ] Test on staging with real data verification
6. [ ] Schedule production migration window

---

## Summary: Local/Staging Migration Status (Jan 31, 2026)

### Completed Successfully

| Component | Status | Details |
|-----------|--------|---------|
| Wipe Script | ✅ Created | `wipe-legacy-data.js` - FK-safe deletion order |
| Setup Tags Script | ✅ Created | `setup-legacy-tags.js` - 41 legacy tags |
| Sync Script | ✅ Updated | Direct legacy tagid → new UUID mapping |
| User Stats Script | ✅ Created | `update-user-stats.js` |
| Fighters | ✅ 7,209 | 1,239 with images |
| Events | ✅ 1,149 | 432 with banner images |
| Fights | ⚠️ 7,926 | 6,041 errors (fighter matching) |
| Users | ✅ 1,942 | All with password=null |
| Ratings | ✅ 35,101 | From 1,109 users |
| Tags | ✅ 602 | From 93 users |
| Fight Stats | ✅ Updated | averageRating, totalRatings |
| User Stats | ✅ Updated | 1,110 users with activity |

### Not Yet Migrated

| Component | Reason | Recommendation |
|-----------|--------|----------------|
| Reviews (~770) | Too slow over remote MySQL | mysqldump + local import |
| Review Upvotes (~2,000) | Depends on reviews | Same as above |
| ~6,000 fights | Fighter name matching | Log & investigate |

### Files Created This Session

```
packages/backend/scripts/legacy-migration/
├── migration-overview.md          # This document
├── wipe-legacy-data.js            # Complete database reset
├── setup-legacy-tags.js           # Replace tags with legacy definitions
├── update-user-stats.js           # Recalculate user statistics
├── legacy-tag-mapping.json        # Generated: legacyId → newUUID
└── mysql-export/
    └── sync-all-from-live.js      # Updated: uses legacy-tag-mapping.json
```

### Production Command Sequence

```bash
cd packages/backend

# 1. Backup production first!
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# 2. Wipe all data
node scripts/legacy-migration/wipe-legacy-data.js --confirm

# 3. Setup legacy tags
node scripts/legacy-migration/setup-legacy-tags.js --confirm

# 4. Sync from live MySQL
node scripts/legacy-migration/mysql-export/sync-all-from-live.js

# 5. Update statistics
node update-rating-stats.js
node scripts/legacy-migration/update-user-stats.js

# 6. Verify
node scripts/legacy-migration/wipe-legacy-data.js --verify

# 7. Run scrapers for upcoming events
node services/scrapeAllUFCData.js
node services/scrapeAllOneFCData.js
```
