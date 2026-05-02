# Onboard a New Promotion

Step-by-step for adding a new fight promotion (org) to the system. The promotion registry collapsed many of the scattered touch points into one canonical edit, but **scraper integration still requires a handful of secondary edits** — this playbook is the reality, not the aspiration.

**Source of truth**: `packages/backend/src/config/promotionRegistry.ts`

The Gamebred Fighting Championship onboarding (2026-05-02) was the test case that drove the current shape of this doc.

---

## 1. Add the registry entry

Edit `packages/backend/src/config/promotionRegistry.ts`:

```ts
{
  code: 'NEW_ORG',                        // stable UPPER_SNAKE; never changes
  canonicalPromotion: 'New Org',          // string parsers write to Event.promotion
  shortLabel: 'NEW ORG',                  // mobile/web filter pill text
  fullLabel: 'New Organization',          // admin event-edit + notification grid label
  scraperType: 'tapology',                // 'ufc' | 'matchroom' | 'oktagon' | 'onefc' | 'tapology' | 'bkfc' | 'raf' | 'pfl'
  hasReliableLiveTracker: true,           // false → falls back to section-start ping
  logoKey: 'new_org',                     // mobile/web map this to bundled assets
  userVisible: true,                      // show in mobile/web filter pills?
  notificationEligible: true,             // show the bell-toggle for this org?
  tapologyHub: {                          // required if scraperType === 'tapology'
    url: 'https://www.tapology.com/fightcenter/promotions/...',
    slugFilter: ['new-org'],              // OR scopeSelector if URLs are headliner-named
  },
  aliases: ['NEW_ORG', 'New Org Inc'],    // legacy/alternate strings to canonicalize
}
```

Also extend the `PromotionCode` union at the top of the file with the new code.

This auto-feeds:
- `RELIABLE_LIVE_TRACKER_PROMOTIONS_UPPER` (consumed by `liveTrackerConfig.ts`)
- `TAPOLOGY_PROMOTION_HUBS` (consumed by `runTapologyLiveTracker.ts` + `backfillTapologyResults.ts`)
- `GET /api/promotions` (mobile + web filter pills, hydrated within 24h)
- `GET /admin/config/promotions` (admin notification grid)

## 2. Add the logo

**SVG**: tracing a PNG with `potrace` produces a clean monochrome SVG. White-on-transparent works in both contexts:

```bash
mkdir /tmp/vec && cd /tmp/vec && npm init -y >/dev/null && npm install potrace
node -e "require('potrace').trace('<input.png>', { color: '#FFFFFF', threshold: 180, turdSize: 4, optTolerance: 0.4 }, (e, svg) => require('fs').writeFileSync('<output.svg>', svg))"
```

**Mobile**: paste the `<svg>...</svg>` body into `packages/mobile/components/PromotionLogo.tsx` as a new `NEW_ORG_LOGO` template literal, then add a `case 'NEW_ORG':` (and aliases) to the switch with the right `aspectRatio` (width / height of the viewBox).

**Admin panel**: copy the SVG to `packages/backend/public/images/promotions/<key>_logo.svg` and add an entry (canonical + aliases, all lowercase) to the `PROMOTION_LOGOS` map in `packages/backend/public/admin.html`.

**Web**: there is currently no per-org logo component in `packages/web` — text labels only. If/when one is added, mirror the mobile pattern.

## 3. Build the scraper + parser (Tapology pattern)

For Tapology-tracked orgs (most boxing/MMA promos without a usable own site):

1. **Scraper**: copy `packages/backend/src/services/scrapeDirtyBoxingTapology.js` to `scrapeNewOrgTapology.js`. Update:
   - `TAPOLOGY_PROMOTION_URL`
   - The slug-filter check inside `scrapeEventsList` (must match the `slugFilter` you set in the registry)
   - The `fightId` prefix
   - Output dir name (`scraped-data/<key>/`)
   - The `scheduledRounds` default (3 for MMA, 10 for boxing)

2. **Parser**: copy `dirtyBoxingDataParser.ts` to `newOrgDataParser.ts`. Have it read the canonical promotion string and `scraperType` from `getPromotionByCode('NEW_ORG')` so they're never out of sync with the registry. Update the weight-class parser if the org is MMA (Sport.MMA, UFC weight thresholds) vs boxing (Sport.BOXING, boxing thresholds).

3. **Output dir convention**: `scraped-data/<key>/...` — must match between scraper output and parser read. No hyphens; concatenated lowercase. Mismatch causes silent ENOENT.

For dedicated-source orgs (UFC/BKFC/ONE/Oktagon/Matchroom — they have structured event pages on their own site), follow the existing per-org scraper pattern in `services/scrapeAll<Org>Data.js` + `<org>DataParser.ts`. Same registry-derived constants apply.

## 4. Wire the scraper into the daily pipeline

Edit `packages/backend/src/services/dailyAllScrapers.ts`:

- Import the new parser: `import { importNewOrgData } from './newOrgDataParser';`
- Add `'NEW_ORG'` to the `OrganizationType` union
- Add an entry to the `SCRAPER_CONFIG` map (scraperFile + importFn + displayName + timeout)
- Add a `runDailyNewOrgScraper()` convenience export
- Add `'NEW_ORG'` to the `organizations` array inside `runAllOrganizationScrapers`

Edit `packages/backend/src/services/backgroundJobs.ts`:

- Add `runDailyNewOrgScraper` to the import list from `./dailyAllScrapers` (even if the job is currently disabled in startBackgroundJobs — keeps the wiring symmetric for future re-enable).

Edit `packages/backend/src/routes/admin.ts`:

- Add `'new-org': 'new-org-scraper.yml'` to the `SCRAPER_WORKFLOWS` map. This auto-registers `POST /admin/trigger/scraper/new-org` and includes the org in `POST /admin/trigger/scraper/all`.

## 5. Add the GitHub Actions workflow

Copy `.github/workflows/dirty-boxing-scraper.yml` to `new-org-scraper.yml`. Update:

- `name:` heading
- The job key (`scrape-dirty-boxing` → `scrape-new-org`)
- The `cron:` time (stagger by ~5–10 min from existing daily scrapers to avoid Render memory spikes)
- The two `node ... ` commands at the end (scraper file + parser import call)
- The failure-alert `org=` query param

Tapology-family scrapers run on GitHub Actions and write directly to the Render DB. The live tracker is separate — it runs on the Hetzner VPS and auto-picks-up from the registry's `TAPOLOGY_PROMOTION_HUBS`. SSH + `vps-update.sh` to deploy live-tracker registry changes (see `docs/areas/scrapers.md`).

## 6. Update the legacy hub-map duplicates

These two files have **hardcoded duplicates** of `TAPOLOGY_PROMOTION_HUBS` that the registry rollout did not yet absorb. Add the new org to both until the duplicates are refactored away (tech debt; see "Known issues" below):

- `packages/backend/src/scraperService.ts` (around line 389)
- `packages/backend/src/scripts/backfillStartTimes.ts` (around line 41)

## 7. Update the bundled fallback `ORGANIZATIONS` arrays

These are the offline / pre-fetch defaults shown by mobile + web before `/api/promotions` returns. Already-running clients will hydrate from the API within 24h, but new installs depend on these:

- `packages/mobile/store/OrgFilterContext.tsx` — `ORGANIZATIONS` array
- `packages/web/src/lib/orgFilter.tsx` — `ORGANIZATIONS` array

Mobile may also need an `ORG_GROUPS` entry if the new org's promotion strings need substring/exact-match handling beyond the default behaviour.

## 8. Update the admin panel hardcoded lists

In `packages/backend/public/admin.html`:

- Global filter `<select id="globalPromotion">` (around line 1714) — add `<option value="..."></option>`
- Event-edit form `<select id="eventPromotion">` (around line 1947) — same
- `scraperOrgs` array (around line 3830) — add `{ key: '<key>', name: '...', dbName: '<canonical>' }`

## 9. Test locally

```bash
cd packages/backend
pnpm build
node -e "const r = require('./dist/config/promotionRegistry.js'); console.log(r.getPromotionByCode('NEW_ORG'));"
node -e "const m = require('./dist/services/dailyAllScrapers.js'); console.log(m.getAllOrganizations().find(o => o.org === 'NEW_ORG'));"
```

Both should print the populated entry. Then optionally run the scraper end-to-end:

```bash
node dist/services/scrapeNewOrgTapology.js                                          # scrape only
node -e "require('./dist/services/newOrgDataParser.js').importNewOrgData()"         # then import
```

(On Windows, `pnpm build`'s last step `cp src/services/*.js dist/services/` doesn't expand the glob in cmd. Either copy the scraper file manually or run the smoke test on the GitHub runner. Production isn't affected.)

## 10. Ship

- **Backend**: Render auto-deploys from `main`.
- **Web**: Vercel auto-deploys from `main`.
- **Mobile**: ship an EAS update (`eas update --branch production`) so already-installed apps fetch the updated `/api/promotions`. Two app restarts to apply (download + apply).
- **VPS** (Tapology-family live trackers only): SSH + `bash /opt/scraper-service/packages/backend/vps-update.sh`.
- **Admin panel**: log in, verify the new org appears in:
  - Daily Scrapers grid
  - Production Live Trackers grid
  - Fight Notification Settings grid
  - Toggle each on as desired.

## 11. Backfill existing rows (only if needed)

If the org's events were already in the DB under non-canonical promotion strings:

```bash
cd packages/backend
pnpm tsx src/scripts/canonicalizePromotionStrings.ts            # dry run
pnpm tsx src/scripts/canonicalizePromotionStrings.ts --apply    # commit
```

Idempotent — looks up each Event row's promotion in the registry (canonical or alias) and rewrites to canonical.

## Audit checklist (sanity)

After onboarding, an admin event with the new promotion should:

- Appear with the correct logo on the events list (mobile/web)
- Match the new filter pill (toggle the pill, verify only matching events show)
- Show the bell-toggle on upcoming-fight modals (if `notificationEligible: true`)
- Trigger the bell-toast with the right wording (tracker precision vs section-start fallback) per `hasReliableLiveTracker`
- Live-update during the event (if `hasReliableLiveTracker: true`) OR fire the section-start ping (if false)

If any break, check:

- `Event.promotion` matches `registryEntry.canonicalPromotion` exactly (case + spaces)
- `Event.scraperType` matches the registry entry's `scraperType`
- `notify_promotions` SystemConfig has the canonical promotion string (admin grid toggle)

## Known issues / tech debt

- `packages/backend/src/scraperService.ts:389` and `packages/backend/src/scripts/backfillStartTimes.ts:41` keep their own hardcoded copies of the Tapology hub map. The registry already exports `TAPOLOGY_PROMOTION_HUBS`, so both should `import` it instead of redefining. Until then, a new Tapology org needs three hub entries (registry + these two), and they can drift.
- Admin `<select>` dropdowns are intentionally hardcoded so legacy values like Bellator/PBC stay editable, but this also means new orgs get a manual edit. Worth a future `adminVisible: true` field on the registry entry to drive both menus from data.
