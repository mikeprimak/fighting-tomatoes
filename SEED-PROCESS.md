# Hype Seeding Process

Seeds upcoming fights with realistic hype predictions that drip in gradually over days, so the app doesn't look empty for early adopters.

## How It Works

1. **25 seed user accounts** (`seed-user-01@goodfights.app` through `seed-user-25@goodfights.app`) create predictions on upcoming fights
2. Predictions ramp up gradually over 14 days before the event (exponential curve)
3. Hype scores, winner picks, and method predictions are informed by real betting odds (UFC) or tier-based defaults (all other promotions)
4. Runs daily via GitHub Actions at 2pm UTC (9am EST)

## Data Priority Chain

```
Manual Override  >  The Odds API (UFC)  >  Tier Defaults (all orgs)
   (highest)          (middle)               (fallback)
```

- **Manual overrides** (`packages/backend/scripts/hype-overrides.json`): Set exact hype, winner, method, or skip fights entirely
- **The Odds API**: Real betting odds for UFC fights — converts moneyline to winner bias, competitive fights get hype boosts
- **Tier defaults**: Fallback for non-UFC promotions or when API has no data

## Seed User Accounts

| # | Email | Display Name |
|---|-------|-------------|
| 1 | seed-user-01@goodfights.app | MMANerd42 |
| 2 | seed-user-02@goodfights.app | CageSideView |
| 3 | seed-user-03@goodfights.app | KnockoutKid |
| ... | ... | ... |
| 25 | seed-user-25@goodfights.app | FightIQ |

These accounts have no password (can't log in), no activity points, and no email verification.

## Tier Targets

| Tier | Criteria | Predictions | Avg Hype | Skip % |
|------|----------|-------------|----------|--------|
| UFC Main Event | UFC + orderOnCard=1 | 15-20 | 8.5-9.5 | 0% |
| UFC Co-Main | UFC + orderOnCard=2 | 10-15 | 7.0-8.5 | 0% |
| UFC Main Card | UFC + cardType "main" | 6-10 | 5.5-7.0 | 0% |
| UFC Prelim | UFC + cardType "prelim"/"early" | 3-6 | 3.5-5.5 | 0% |
| ONE FC / PFL | promotion match | 4-8 | 5.0-7.0 | 30% |
| Boxing | Matchroom, Golden Boy, etc. | 2-5 | 4.0-6.5 | 30% |
| BKFC | BKFC | 2-5 | 4.0-6.5 | 30% |
| Default | everything else | 2-5 | 4.0-6.5 | 30% |

## Gradual Ramp Algorithm

14-day seeding window with exponential ramp (`fraction = (dayIndex / 13) ^ 1.5`):

```
14 days out:  0 predictions
11 days out:  2 predictions (cumulative)
 7 days out:  7 predictions
 3 days out: 14 predictions
 1 day out:  18 predictions (full target)
```

Late-added fights start at a higher dayIndex so they ramp faster.

## Manual Overrides

Edit `packages/backend/scripts/hype-overrides.json`:

```json
{
  "overrides": [
    {
      "match": { "fighter1": "Topuria", "fighter2": "Holloway" },
      "targetCount": 22,
      "targetAvgHype": 9.5,
      "forceWinner": "fighter1",
      "methodWeights": { "KO_TKO": 0.5, "DECISION": 0.3, "SUBMISSION": 0.2 }
    },
    {
      "match": { "fightId": "some-uuid-here" },
      "targetCount": 0
    }
  ]
}
```

- `match`: By fighter last names (order-independent, case-insensitive) or fight UUID
- `targetCount`: Number of seed predictions (`0` = skip entirely)
- `targetAvgHype`: Desired average hype (1-10)
- `forceWinner`: `"fighter1"` or `"fighter2"` for 65/35 winner bias
- `methodWeights`: Override method distribution

## How to Run

```bash
cd packages/backend

# Dry run (see what would be created, no DB writes)
npx tsx src/scripts/seedHype.ts --dry-run

# Run for real (production DB via DATABASE_URL env var)
DATABASE_URL="postgresql://..." ODDS_API_KEY="..." npx tsx src/scripts/seedHype.ts

# Or via compiled output
pnpm build
node dist/scripts/seedHype.js --dry-run
```

## Cleanup

```bash
# Remove seed predictions from a specific fight
npx tsx src/scripts/seedHype.ts --cleanup --fight "Topuria vs Holloway"

# Remove ALL seed predictions (keeps user accounts)
npx tsx src/scripts/seedHype.ts --cleanup --all

# Remove ALL seed predictions AND delete seed user accounts
npx tsx src/scripts/seedHype.ts --cleanup --all --delete-users
```

**Manual SQL fallback:**
```sql
DELETE FROM fight_predictions WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'seed-user-%@goodfights.app'
);
DELETE FROM users WHERE email LIKE 'seed-user-%@goodfights.app';
```

## GitHub Actions

- **Workflow**: `.github/workflows/seed-hype.yml`
- **Schedule**: Daily at 2pm UTC (9am EST)
- **Manual trigger**: `workflow_dispatch` with `dry_run` and `cleanup_all` options
- **Secrets needed**: `DATABASE_URL`, `ODDS_API_KEY`

## Safety

- **Idempotent**: Running multiple times per day creates 0 duplicate predictions (delta-based + `skipDuplicates`)
- **Deterministic**: Same fight always gets the same target count/hype (seeded PRNG from fight UUID)
- **No activity points**: Seed predictions don't create `UserActivity` records
- **Only UPCOMING fights**: Never touches live or completed fights
- **Only visible events**: Respects `isVisible: true` filter

## Troubleshooting

- **Fights not getting seeded for an event**: Check that the fights have `fightStatus: 'UPCOMING'`. Some scrapers (e.g., Rizin) may incorrectly mark future fights as `COMPLETED`. Fix with:
  ```sql
  UPDATE fights SET "fightStatus" = 'UPCOMING', "completedAt" = NULL, "completionMethod" = NULL
  WHERE "eventId" = '<event-uuid>' AND "fightStatus" = 'COMPLETED';
  ```
- **Event not appearing at all**: Check `isVisible: true` and `eventStatus: 'UPCOMING'` on the event.
- **Hype not showing in app**: The seeder writes to `fight_predictions` with `hasRevealedHype: true`. The community page (`/community/top-upcoming-fights`) aggregates these into `averageHype`. Pull-to-refresh or check the API directly to confirm data is there.
