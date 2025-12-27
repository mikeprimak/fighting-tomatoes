# Legacy Data Migration Scripts

Scripts to migrate user data from fightingtomatoes.com (MySQL) to the new FightCrewApp (PostgreSQL).

## Prerequisites

1. SQL dump files in `databases from fightingtomatoes/` folder:
   - `users.sql` - User accounts
   - `fights.sql` - Fight data
   - `userfightratings.sql` - User ratings (per-user tables)
   - `userfightreviews.sql` - User review references
   - `userfighttags.sql` - User tags (per-user tables)
   - (Optional) `fightreviewsdb/*.sql` - Full review content

2. Backend database should have fight data already (from UFC scraper)

3. Node.js and TypeScript set up (`npx ts-node` available)

## Migration Strategy

### User Accounts
- Users are imported with `password: null`
- This triggers the account claim flow when they try to log in
- Users verify their email and set a new password
- All their ratings/reviews/tags are already linked to their account

### Fight Matching
- Legacy fights use integer IDs
- New fights use UUIDs
- Matching done by: fighter names + event date
- Unmatched fights are logged for review

### Data Flow
```
Legacy SQL Dumps → JSON Files → PostgreSQL Database
     ↓                 ↓               ↓
01-parse        02-mapping        03-07 import
```

## Running the Migration

### Full Migration (Recommended)

```bash
cd packages/backend

# First, do a dry run to see what will happen
npx ts-node scripts/legacy-migration/run-migration.ts --dry-run

# Then run the actual migration
npx ts-node scripts/legacy-migration/run-migration.ts
```

### Individual Steps

```bash
# Step 1: Parse SQL dumps to JSON
npx ts-node scripts/legacy-migration/01-parse-legacy-data.ts

# Step 2: Create fight ID mappings
npx ts-node scripts/legacy-migration/02-create-fight-mapping.ts

# Step 3: Migrate users (dry run first!)
npx ts-node scripts/legacy-migration/03-migrate-users.ts --dry-run
npx ts-node scripts/legacy-migration/03-migrate-users.ts

# Step 4: Migrate ratings
npx ts-node scripts/legacy-migration/04-migrate-ratings.ts --dry-run
npx ts-node scripts/legacy-migration/04-migrate-ratings.ts

# Step 5: Migrate reviews
npx ts-node scripts/legacy-migration/05-migrate-reviews.ts --dry-run
npx ts-node scripts/legacy-migration/05-migrate-reviews.ts

# Step 6: Migrate tags
npx ts-node scripts/legacy-migration/06-migrate-tags.ts --dry-run
npx ts-node scripts/legacy-migration/06-migrate-tags.ts

# Step 7: Verify migration
npx ts-node scripts/legacy-migration/07-verify-migration.ts
```

### Resume from a specific step

```bash
# Start from step 4 (if steps 1-3 completed)
npx ts-node scripts/legacy-migration/run-migration.ts --step 4

# Run only step 7 (verification)
npx ts-node scripts/legacy-migration/run-migration.ts --only 7
```

## Output Files

After running step 1, the `legacy-data/` folder will contain:

- `users.json` - Parsed user accounts
- `fights.json` - Parsed fights
- `ratings.json` - Parsed ratings with user email hashes
- `reviews.json` - Parsed reviews (may be empty)
- `tags.json` - Parsed tags with user email hashes
- `email-hash-map.json` - MD5 hash → email mapping

After running step 2:
- `fight-mapping.json` - Legacy fight ID → new UUID mapping
- `unmatched-fights.json` - Fights that couldn't be matched

After running step 3:
- `user-mapping.json` - Legacy user email → new UUID mapping

## Troubleshooting

### "No reviews to migrate"
The full review content is stored in `fightreviewsdb` with tables named by fight ID. We only have a sample. Reviews can be migrated later when full dump is available.

### Low fight match rate
- Check `unmatched-fights.json` to see which fights didn't match
- Common reasons: different promotions, name variations, cancelled fights
- UFC fights should have high match rate; other promotions may be lower

### User already exists
Users who signed up independently are skipped. Their legacy data can still be migrated by running ratings/tags scripts (which look up by email).

## Legacy Database Structure

The legacy database uses a unique schema:

| Database | Table Naming | Contents |
|----------|--------------|----------|
| `fightdb` | `users`, `fights` | Central tables |
| `userfightratings` | `{MD5(email)}` | Per-user rating tables |
| `userfightreviews` | `{MD5(email)}` | Per-user review tables |
| `userfighttags` | `{MD5(email)}` | Per-user tag tables |
| `fightreviewsdb` | `{fightid}` | Per-fight review tables |

The `maptoemail` column in `users` contains the MD5 hash used to find each user's tables.
