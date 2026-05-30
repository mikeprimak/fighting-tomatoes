# Work Session - January 28, 2026

## Goal: Final Pre-Launch Preparation

Preparing the app for public announcement and store submissions.

---

## Checklist

### 1. Hide Matchroom Boxing from Frontend
- [x] Added `isVisible` field to Event model in Prisma schema
- [x] Updated `/api/events` endpoint to filter by `isVisible: true`
- [x] Updated `/api/events/:id` endpoint to filter by `isVisible: true`
- [x] Ran `prisma db push` to apply schema change
- [x] Created script: `packages/backend/src/scripts/hideMatchroomEvents.ts`
- [x] Executed script - **6 Matchroom events hidden**

**To reinstate later:**
```sql
UPDATE events SET "isVisible" = true WHERE promotion ILIKE '%MATCHROOM%';
```

---

### 2. Re-migrate Legacy Data (fightingtomatoes.com)
- [x] Fixed bug in `sync-all-from-live.js` (changed `oddsId` to `userId`)
- [x] Ran incremental sync with `--only=ratings`
- [x] **Result: 0 new ratings** - database already up to date from previous migration

**Stats from sync:**
- Legacy fights: 13,974
- New DB fights: 12,335 (2,182 missing - would need scrapers)
- Users in new DB: 1,942
- Rating tables checked: 2,119

---

### 3. Verify Event/Fight Accuracy
- [ ] Manual verification in progress (user checking)

---

### 4. Build and Submit to Stores
- [x] Incremented versionCode: 29 → **30**
  - `packages/mobile/app.json`
  - `packages/mobile/android/app/build.gradle`
- [ ] Android build (user running in separate terminal)
  ```bash
  cd packages/mobile && eas build --platform android --profile production
  ```
- [ ] Submit to Google Play Console
- [ ] iOS build and submit (if needed)

---

### 5. Reddit Internal Testing Recruitment
- [ ] Post to relevant subreddits for Android internal testers
- [ ] Need 14 days of internal testing before public release

---

## Files Modified Today

| File | Change |
|------|--------|
| `packages/backend/prisma/schema.prisma` | Added `isVisible` field to Event model |
| `packages/backend/src/routes/index.ts` | Filter events by `isVisible: true` |
| `packages/backend/src/scripts/hideMatchroomEvents.ts` | New script to hide Matchroom events |
| `packages/backend/scripts/legacy-migration/mysql-export/sync-all-from-live.js` | Fixed 5 bugs: emailaddress, parseInt, MD5 lookup, score column, date parsing |
| `packages/backend/scripts/legacy-migration/mysql-export/check-legacy-ufc.js` | New debug script for querying legacy fights |
| `packages/backend/scripts/legacy-migration/mysql-export/debug-sync.js` | New debug script for tracing sync flow |
| `packages/backend/scripts/legacy-migration/mysql-export/debug-maddalena.js` | New debug script for fight matching |
| `packages/backend/update-rating-stats.js` | New script to recalculate totalRatings/averageRating |
| `packages/mobile/app.json` | versionCode 29 → 30 |
| `packages/mobile/android/app/build.gradle` | versionCode 29 → 30 |

---

### 6. Bug Fixes (Second Session)

#### UFC 321, 322, 323 Wrong Dates ✅ FIXED
- [x] Fixed dates from 2026 to 2025
  - UFC 321: 2026-10-25 → **2025-10-25**
  - UFC 322: 2026-11-16 → **2025-11-15**
  - UFC 323: 2026-12-07 → **2025-12-06**
- [x] Created and ran `packages/backend/fix-ufc-dates.js`
- [x] Verified in production API - dates now correct

#### Dirty Boxing Banner Not Showing ✅ FIXED
- [x] Discovered banner file was never committed to git (404 in production)
- [x] Committed `packages/backend/public/images/events/dirty-boxing/dirty-boxing-banner-default.png`
- [x] Pushed to trigger Render deployment
- User manually deploying Render

#### Matchroom Visibility ✅ WORKING
- [x] Verified in production API: **0 Matchroom events** returned
- The `isVisible` filter is working correctly

#### UFC 324 Missing from App ⚠️ NEEDS FIX
- **Problem**: UFC 324 not showing in "Completed Fights" screen
- **Root cause found**: Event has `hasStarted: false` and `isComplete: false`
- All 13 fights have no status/results
- Completed fights screen filters by `isComplete: true`, so UFC 324 is excluded
- **TODO**: Need to mark UFC 324 as complete and add fight results

#### Legacy Data Migration ✅ FIXED

**Problem**: `sync-all-from-live.js` was reporting 0 new ratings despite legacy data existing (e.g., UFC 324 Gaethje vs Pimblett had 21 ratings in legacy, UFC 322 Della Maddalena vs Makhachev had 23 ratings).

**Investigation Process**:

1. **Verified legacy data exists** - Queried legacy MySQL directly:
   - Legacy uses `ratings_given_1` through `ratings_given_10` columns (not `totalrating`/`numratings`)
   - Legacy event names are short (e.g., "324" not "UFC 324: Gaethje vs. Pimblett")
   - Confirmed 21 ratings exist for Gaethje vs Pimblett fight (ID 15172)

2. **Traced the sync flow** - Created debug scripts to identify where matching failed:
   - Fight matching: Works correctly (normalized fighter names match)
   - User matching: **FAILING** - 100% of rating tables showed "no user in legacy DB"

3. **Discovered the core bug** - Rating table names in `userfightratings` database:
   - Table names are MD5 hashes of user emails (e.g., `bddf5fe1b9f9ea00b00e2064e08e7436`)
   - Script was looking up `maptoemail` column in users table, but that contains DIFFERENT values
   - The `maptoemail` column is NOT the MD5 of the email - it's something else entirely
   - Example: `avocadomike@hotmail.com` has MD5 `bddf5fe1b9f9ea00b00e2064e08e7436` but `maptoemail` is `a072ef9238e0d571ba9a7151773f2de8`

**Bugs Fixed in `sync-all-from-live.js`**:

| Bug | Location | Issue | Fix |
|-----|----------|-------|-----|
| 1 | Line 246 | Used `email` column | Changed to `emailaddress` |
| 2 | Line 257 | `rating.fightid` is varchar(9), map keys were integers | Added `parseInt(rating.fightid, 10)` |
| 3 | Lines 227-254 | Iterated rating tables, looked up `maptoemail` | **Rewrote**: Iterate users, calculate `MD5(email)`, query that table |
| 4 | Line 263 | Used `rating.rating` | Changed to `rating.score` |
| 5 | Line 263 | `time_of_rating` can be invalid strings like "Invalid Date" | Added safe date parsing with fallback to `new Date()` |

**Code Changes**:

```javascript
// OLD (broken): Iterate rating tables, lookup user by maptoemail
for (const table of tables) {
  const [userRows] = await connection.query(
    'SELECT email FROM users WHERE maptoemail = ?', [tableName]
  );
  // This ALWAYS returned 0 rows because maptoemail != MD5(email)
}

// NEW (working): Iterate users, calculate MD5 of their email
for (const user of users) {
  const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
  const [ratings] = await connection.query(`SELECT * FROM \`${emailMd5}\``);
  // Now we find the correct rating table for each user
}
```

**Additional Fix Required**:

After syncing ratings, the `totalRatings` and `averageRating` fields on the Fight model were still 0. Created and ran `update-rating-stats.js` to recalculate:
- Updated **4,593 fights** with correct rating counts and averages
- Gaethje vs Pimblett: `totalRatings: 0 → 20`, `averageRating: 0 → 9`

**Final Result**:
- **1,271 new ratings synced** (48,958 total, up from 47,687)
- **4,593 fights updated** with correct `totalRatings` and `averageRating`
- Recent events now display ratings in app:
  - UFC 324: 90 ratings
  - UFC 322: 171 ratings
  - UFC 323: 179 ratings
  - UFC 321: 136 ratings

**Scripts Created/Modified**:

| Script | Purpose |
|--------|---------|
| `sync-all-from-live.js` | Fixed 5 bugs (see above) |
| `check-legacy-ufc.js` | Debug: Query legacy DB for UFC 324/322 fights |
| `debug-sync.js` | Debug: Trace sync flow and identify failure points |
| `debug-maddalena.js` | Debug: Check fight matching for specific fight |
| `update-rating-stats.js` | Recalculate `totalRatings`/`averageRating` for all fights |

**Legacy Database Schema Notes** (for future reference):

```
fightdb.fights:
  - ratings_given_1 through ratings_given_10: Count of ratings at each score
  - No totalrating/numratings columns

fightdb.users:
  - emailaddress: The user's email (NOT 'email')
  - maptoemail: Some hash value (NOT the MD5 of email, don't use this!)

userfightratings.[MD5(email)]:
  - Table name IS the MD5 hash of the user's email
  - fightid: varchar(9) - string, not integer!
  - score: The rating value (NOT 'rating')
  - time_of_rating: varchar - can be invalid date strings
```

---

## Commits Today

| Commit | Description |
|--------|-------------|
| `9dfb3e6` | Add event visibility flag, ONE FC start times, Dirty Boxing banner code |
| `e0d65ec` | Add Dirty Boxing default banner image file |

---

## Outstanding Issues

1. **UFC 324** - Need to mark as complete and add fight results
2. **Duplicate fights in UFC 322** - Two copies of Della Maddalena vs Makhachev fight exist (one has 23 ratings, one has 0)

---

## Commands Reference

**Re-run legacy ratings sync** (if needed in future):
```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js --only=ratings
```

**Update rating stats after sync** (required for app to display ratings):
```bash
cd packages/backend
node update-rating-stats.js
```

**Check legacy data for specific event**:
```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node check-legacy-ufc.js
```

---

## Notes

- Build credits are limited (91% used as of Jan 19) - use sparingly
- Reviews not re-migrated (user confirmed minimal/no new reviews since last migration)
- 2,182 legacy fights not in new DB - these are from events not yet scraped (old/obscure events)
- Render requires manual deployment
