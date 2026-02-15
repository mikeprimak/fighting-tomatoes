# Legacy Migration Notes

Complete guide for migrating data from fightingtomatoes.com (MySQL) to the new Good Fights app (PostgreSQL).

---

## Overview

| Source | Target |
|--------|--------|
| fightingtomatoes.com MySQL | Render PostgreSQL |
| Host: 216.69.165.113:3306 | Via Prisma Client |
| ~14,000 fights | ~10,954 fights synced |
| ~1,966 users | ~1,963 users in new DB |
| ~54,507 ratings (from per-user tables) | 54,507 ratings imported |

---

## How to Run a Full Clean Migration

If starting from scratch (empty DB), run these steps in order.

### Step 0: Set Up Tags

Tags must exist before syncing fight tags:
```bash
cd packages/backend/scripts/legacy-migration
node setup-legacy-tags.js --confirm
```

### Step 1: Sync Everything

```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js
```

This syncs fighters, events, and fights. **The MySQL connection may time out** during the fights step (which takes several minutes for ~14,000 fights). If it crashes during Step 4 (Users), continue with individual steps:

```bash
node sync-all-from-live.js --only=users
node sync-all-from-live.js --only=ratings
node sync-all-from-live.js --only=tags
```

### Step 2: Update Statistics

```bash
cd packages/backend
node update-rating-stats.js
cd scripts/legacy-migration
node update-user-stats.js
```

### Step 3: Create Test Accounts

```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node create-test-accounts.js
```

This sets passwords on migrated real accounts (avocadomike, michaelsprimak) and creates test/admin accounts. All use password `password123`.

**Accounts with passwords after migration:**
| Email | Purpose |
|-------|---------|
| `avocadomike@hotmail.com` | Real account (legacy ratings preserved) |
| `michaelsprimak@gmail.com` | Real account (legacy ratings preserved) |
| `test@fightcrewapp.com` | Test account |
| `test@fightingtomatoes.com` | Test account |
| `admin@fightcrewapp.com` | Admin account |
| `applereview@goodfights.app` | Apple review account |
| `contact@goodfights.app` | Contact account |

### Step 4: Verify with Audit

```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node audit-and-fix.js --promotion=UFC
node audit-and-fix.js                    # All promotions
```

### Step 5: Verify in App

- Pull-to-refresh or restart the app
- Check a fight like UFC 324 Gaethje vs Pimblett - should show ratings

---

## Legacy Database Schema

### Database: `fightdb`

#### Table: `fights`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int(10) | Primary key |
| `f1fn`, `f1ln` | varchar(50) | Fighter 1 first/last name |
| `f2fn`, `f2ln` | varchar(50) | Fighter 2 first/last name |
| `eventname` | varchar(100) | Short name like "324" not "UFC 324: ..." |
| `date` | date | Fight date |
| `ratings_given_1` ... `ratings_given_10` | int(7) | Count of ratings at each score |
| `deleted` | int(1) | 0 = active, 1 = deleted |

**Note:** There is NO `totalrating` or `numratings` column. To get rating count:
```sql
SELECT (COALESCE(ratings_given_1,0) + COALESCE(ratings_given_2,0) + ... + COALESCE(ratings_given_10,0)) as numratings
```

#### Table: `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int(10) | Primary key |
| `emailaddress` | varchar(200) | User's email (**NOT** `email`!) |
| `maptoemail` | varchar(300) | **DO NOT USE** - not the MD5 of email |
| `displayname` | varchar(60) | Username |

### Database: `userfightratings`

Each user has their own table named as the **MD5 hash of their email address**.

Example: User `avocadomike@hotmail.com` → Table name `bddf5fe1b9f9ea00b00e2064e08e7436`

#### Table: `[MD5(email)]`
| Column | Type | Notes |
|--------|------|-------|
| `id` | int(11) | Primary key |
| `fightid` | varchar(9) | Legacy fight ID (**string, not int!**) |
| `score` | int(3) | Rating value 1-10 (**NOT** `rating`!) |
| `excited` | int(1) | Excitement flag |
| `time_of_rating` | varchar(60) | Timestamp (can be invalid!) |

### Database: `userfighttags`

Same structure as `userfightratings` - tables named by MD5(email).

### Database: `fightreviewsdb`

Tables named by fight ID (integer), containing reviews for that fight.

---

## Critical Bugs Fixed (January 2026)

### Bug 1: Wrong Column Name
```javascript
// WRONG
'SELECT email FROM users WHERE maptoemail = ?'

// CORRECT
'SELECT emailaddress FROM users WHERE maptoemail = ?'
```

### Bug 2: Type Mismatch on Fight ID
```javascript
// WRONG - rating.fightid is a string "15172", map keys are integers
const legacyFight = legacyFightMap.get(rating.fightid);

// CORRECT
const legacyFight = legacyFightMap.get(parseInt(rating.fightid, 10));
```

### Bug 3: Wrong User Lookup Method

The `maptoemail` column in the users table is **NOT** the MD5 hash of the email. The rating table names ARE the MD5 hash.

```javascript
// WRONG - iterating rating tables and looking up maptoemail
for (const table of tables) {
  const [userRows] = await connection.query(
    'SELECT emailaddress FROM users WHERE maptoemail = ?', [tableName]
  );
  // This returns 0 rows because maptoemail != MD5(email)
}

// CORRECT - iterate users and calculate MD5 of their email
const crypto = require('crypto');
for (const user of users) {
  const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
  const [ratings] = await connection.query(`SELECT * FROM \`${emailMd5}\``);
  // Now finds the correct table
}
```

### Bug 4: Wrong Rating Column
```javascript
// WRONG
rating: rating.rating

// CORRECT
rating: rating.score
```

### Bug 5: Invalid Date Handling
```javascript
// WRONG - time_of_rating can be "Invalid Date" or other garbage
createdAt: rating.time_of_rating ? new Date(rating.time_of_rating) : new Date()

// CORRECT
let createdAt = new Date();
if (rating.time_of_rating) {
  const parsed = new Date(rating.time_of_rating);
  if (!isNaN(parsed.getTime())) {
    createdAt = parsed;
  }
}
```

---

## Name Normalization (Diacritics)

All names are normalized to plain ASCII before matching. The `normalizeName` function:
1. Replaces special chars that NFKD doesn't decompose (Polish l-stroke, etc.)
2. Applies Unicode NFKD decomposition to split diacritics into base + combining mark
3. Strips combining marks, leaving ASCII equivalents
4. Lowercases and removes non-alphanumeric characters

```javascript
function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ßẞ]/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
```

Examples: `Błachowicz` -> `blachowicz`, `Farès` -> `fares`, `Rakić` -> `rakic`

The `stripDiacritics` function does the same but preserves casing/spaces — used when storing names in the DB so they're human-readable but ASCII-safe.

**IMPORTANT:** All scrapers and live trackers must also strip diacritics when creating/matching fighters. See TODO section below.

## Event Name Matching

Legacy stores event names WITHOUT the promotion prefix. The sync script prepends the promotion:

| Legacy `eventname` | Legacy `promotion` | App event name |
|----|----|----|
| `324` | `UFC` | `UFC 324` |
| `Fight Night Whittaker vs Till` | `UFC` | `UFC Fight Night Whittaker vs Till` |
| `Fight Night: Gane vs Tuivasa` | `UFC` | `UFC: Gane vs Tuivasa` |

Both `syncEvents` and `syncFights` must apply the same transformation for matching to work.

---

## Scripts

Located in `packages/backend/scripts/legacy-migration/mysql-export/`:

| Script | Purpose |
|--------|---------|
| `sync-all-from-live.js` | **Main migration script** — syncs fighters, events, fights, users, ratings, tags |
| `audit-and-fix.js` | **Audit & fix** — compares legacy vs app, finds mismatches, can apply fixes |
| `wipe-all-data.js` | Wipes all app DB data (preserves schema) |
| `create-test-accounts.js` | Creates test/admin accounts after migration |
| `check-legacy-ufc.js` | Query legacy DB for specific UFC events |
| `test-connection.js` | Verify MySQL connection works |

---

## Known Issues / Remaining Gaps

### 1. ~3,100 Legacy Fights Not Synced
About 3,100 of ~14,000 legacy fights don't sync because:
- Fighters exist in legacy but not in the fighters table (name variants, one-off fighters)
- Non-UFC promotions with incomplete fighter rosters
- A few old/obscure UFC events where fighter names don't match

### 2. Rating Count Mismatches (Legacy Aggregates are Stale)
The legacy `ratings_given_1..10` columns on the fight record are cached aggregates that may not match the actual per-user rating tables. The app imports from per-user tables (source of truth), so the app sometimes has MORE ratings than the legacy aggregate shows. This is correct — the app count is more accurate.

### 3. Audit Script Rating Comparison
The audit compares legacy `ratings_given_1..10` sums vs app `FightRating.count`. Mismatches where app > legacy are expected (stale legacy aggregates). Mismatches where legacy > app indicate users whose per-user tables weren't found.

## DONE: Strip Diacritics in Scrapers

All daily scrapers and live event trackers now strip diacritics from fighter names using `stripDiacritics` from `src/utils/fighterMatcher.ts`. Completed Feb 14, 2026.

**Daily scraper parsers updated (10 files):**
- `ufcDataParser.ts`, `oneFCDataParser.ts`, `bkfcDataParser.ts`, `pflDataParser.ts`
- `oktagonDataParser.ts`, `matchroomDataParser.ts`, `goldenBoyDataParser.ts`, `topRankDataParser.ts`
- `dirtyBoxingDataParser.ts`, `zuffaBoxingDataParser.ts`

**Live event parsers updated (5 files):**
- `ufcLiveParser.ts`, `oneFCLiveParser.ts`, `oktagonLiveParser.ts`
- `matchroomLiveParser.ts`, `tapologyLiveParser.ts`

---

## MySQL Connection Details

```javascript
const MYSQL_CONFIG = {
  host: '216.69.165.113',
  port: 3306,
  user: 'fotnadmin',
  password: 'HungryMonkey12',
};
```

Databases to switch between:
```javascript
await connection.query('USE fightdb');
await connection.query('USE userfightratings');
await connection.query('USE userfighttags');
await connection.query('USE fightreviewsdb');
```

---

## Migration History

| Date | Action | Result |
|------|--------|--------|
| Dec 2025 | Initial migration | ~47,000 ratings imported |
| Jan 28, 2026 | Fixed 5 bugs in sync script | +1,271 ratings synced |
| Feb 14, 2026 | **Full wipe + clean re-migration** | See below |

### Feb 14, 2026 — Full Wipe & Clean Re-Migration

**Why:** Accumulated data errors from incremental patching. The app had duplicate fights from truncated names (e.g., "Diego Lopes vs Jean Silv" alongside "Diego Lopes vs Jean Silva"), incorrect rating counts, and diacritic mismatches creating duplicate fighters.

**What was done:**
1. Wiped all app DB data (schema preserved)
2. Fixed `normalizeName` to strip diacritics using Unicode NFKD decomposition + manual mappings for Polish l-stroke, etc.
3. Added `stripDiacritics` to store fighter/event names as ASCII in the DB
4. Fixed event name matching in fight sync (legacy `"Fight Night X vs Y"` must be matched as `"UFC Fight Night X vs Y"`)
5. Re-ran full sync from legacy MySQL
6. Re-created test accounts

**Results:**
| Data | Count |
|------|-------|
| Fighters | 7,262 |
| Events | 1,155 |
| Fights | 10,954 |
| Users | 1,963 |
| Ratings | 54,507 |
| Tags | 1,993 |

**UFC audit after migration:**
- 654/654 events matched (100%)
- 7,148/8,569 fights matched (83%)
- 0 erroneous/duplicate fights
- 0 unmatched users
- 62 missing fights (old events with unmatched fighters)

---

## Checklist for Future Full Migration

1. [ ] `node setup-legacy-tags.js --confirm`
2. [ ] `node wipe-all-data.js --confirm`
3. [ ] `node sync-all-from-live.js` (may crash during users — continue with `--only=` flags)
4. [ ] `node sync-all-from-live.js --only=users`
5. [ ] `node sync-all-from-live.js --only=ratings`
6. [ ] `node sync-all-from-live.js --only=tags`
7. [ ] `cd ../.. && node update-rating-stats.js`
8. [ ] `cd scripts/legacy-migration && node update-user-stats.js`
9. [ ] `cd mysql-export && node create-test-accounts.js`
10. [ ] `node audit-and-fix.js --promotion=UFC` (verify)
11. [ ] `node audit-and-fix.js` (all promotions)
12. [ ] Test in app — pull-to-refresh, check known fights
