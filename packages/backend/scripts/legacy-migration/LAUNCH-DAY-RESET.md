# Launch Day Reset

**Purpose**: Wipe production database and re-import fresh from live MySQL to ensure 100% clean data with no test/fake fights.

---

## Quick Reference

```bash
cd packages/backend/scripts/legacy-migration

# Preview what will happen (safe)
node launch-day-reset.js

# Execute the reset (DESTRUCTIVE)
node launch-day-reset.js --execute

# Verify data after reset
node launch-day-reset.js --verify
```

---

## What It Does

| Step | Action | Script Called |
|------|--------|---------------|
| 1 | TRUNCATE all production tables | (inline) |
| 2 | Import from live MySQL | `sync-all-from-live.js` |
| 3a | Fix fight ordering | `sync-fight-order.js` |
| 3b | Fix duplicate orders | `fix-duplicate-orders.js` |
| 3c | Import fighter images | `import-images.js` |
| 3d | Import event banners | `import-event-images-v2.js` |

---

## Tables Reset

All data in these tables will be deleted and re-imported:

- `events`
- `fighters`
- `fights`
- `users` (re-imported with `password: null` for claim flow)
- `fight_ratings`
- `fight_reviews`
- `fight_tags`
- `fight_predictions`
- `pre_fight_comments`

---

## Pre-Launch Checklist

- [ ] Verify legacy MySQL is accessible: `node mysql-export/test-connection.js`
- [ ] Backup production database (Render dashboard → Manual Backup)
- [ ] Run dry-run: `node launch-day-reset.js`
- [ ] Execute: `node launch-day-reset.js --execute`
- [ ] Verify: `node launch-day-reset.js --verify`
- [ ] Test the app

---

## Estimated Time

~20-30 minutes total

---

## Rollback

If something goes wrong:
1. Restore from Render backup
2. Debug the issue
3. Try again
