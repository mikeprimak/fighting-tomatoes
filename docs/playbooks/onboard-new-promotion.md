# Onboard a New Promotion

Step-by-step for adding a new fight promotion (org) to the system. The promotion registry collapsed what used to be ~24 scattered touch points into one canonical edit plus a small checklist for the things that genuinely need code (scraper logic, logo asset, GitHub workflow).

**Source of truth**: `packages/backend/src/config/promotionRegistry.ts`

## 1. Add the registry entry

Edit `packages/backend/src/config/promotionRegistry.ts` and add a new `PromotionRegistryEntry` to `PROMOTION_REGISTRY`. Pick a stable UPPER_SNAKE `code` — it never changes after launch.

```ts
{
  code: 'NEW_ORG',
  canonicalPromotion: 'New Org',          // exact string parsers will write to Event.promotion
  shortLabel: 'NEW ORG',                  // mobile/web filter pill text
  fullLabel: 'New Organization',          // admin event-edit + notification grid label
  scraperType: 'tapology',                // 'ufc' | 'matchroom' | 'oktagon' | 'onefc' | 'tapology' | 'bkfc' | 'raf' | 'pfl'
  hasReliableLiveTracker: true,           // does the live tracker deliver per-fight precision?
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

Once committed, every place that consumes the registry picks up the new org automatically:
- `liveTrackerConfig.ts` `hasReliableLiveTracker()`
- `runTapologyLiveTracker.ts` + `backfillTapologyResults.ts` hub maps
- `GET /admin/config/promotions` (admin notification grid)
- `GET /api/promotions` (mobile + web filter pills, hydrated within 24h)

## 2. Add the logo asset

**Mobile**:
- PNG: `packages/mobile/assets/promotions/{logoKey}_logo.png`, then add a branch in `packages/mobile/components/PromotionLogo.tsx`
- SVG-as-string: just add a branch in `PromotionLogo.tsx`

**Web**: mirror the mobile component (`packages/web/src/components/...PromotionLogo`).

## 3. Pick a scraper strategy

### Option A: Dedicated scraper (UFC/BKFC/ONE/Oktagon/Matchroom pattern)

Use this when the org has a clean source site (their own events page, not just a Tapology listing).

1. `packages/backend/src/services/scrapeAll{Org}Data.js` — Puppeteer/Cheerio scraper.
2. `packages/backend/src/services/{org}DataParser.ts` — parses the JSON output into the DB. **Must write** `promotion: registryEntry.canonicalPromotion`.
3. **Output dir convention** — `services/{org}/data/...` directory must match between scraper output and parser read. No hyphens; concatenated lowercase. Mismatch causes silent ENOENT (DBX 2026-04-10 incident).
4. `packages/backend/src/services/{org}LiveScraper.ts` + `{org}LiveParser.ts` if the live tracker is dedicated.
5. `packages/backend/src/services/backfill{Org}Results.ts` — retroactive backfill wrapper.
6. `.github/workflows/{org}-scraper.yml` daily cron.
7. `.github/workflows/{org}-live-tracker.yml` if live-tracked.
8. Add scraper trigger function to `services/backgroundJobs.ts` and admin trigger button in `routes/admin.ts` if you want manual-run capability.

### Option B: Tapology-tracked

Use this when Tapology is the authoritative event source (most boxing promos).

1. Set `scraperType: 'tapology'` and `tapologyHub` on the registry entry. The generic tracker picks it up automatically — no per-org code.
2. Add a `scrape{Org}Tapology.js` daily scraper if the org has its own daily events page on Tapology, OR rely on the existing tapology daily scraper.
3. **VPS deploy**: Tapology family live trackers run on the Hetzner VPS, not GitHub Actions. After committing changes affecting the live tracker:
   ```
   ssh user@vps
   bash /opt/scraper-service/packages/backend/vps-update.sh
   ```
   The VPS does NOT auto-deploy from `main`. See `docs/areas/scrapers.md`.

## 4. Test the import locally

```bash
cd packages/backend
pnpm tsx src/services/{org}DataParser.ts
```

Spot-check that `Event.promotion` rows match `registryEntry.canonicalPromotion` exactly.

## 5. Push to main + ship

- **Backend**: Render auto-deploys from `main`.
- **Web**: Vercel auto-deploys from `main`.
- **Mobile**: ship an EAS update (`eas update --branch production`) so already-installed apps fetch the updated `/api/promotions` and render the new pill. Two app restarts to apply (download + apply).
- **VPS** (Tapology-family only): SSH + `vps-update.sh`.
- **Admin panel**: log in, verify the new org appears in:
  - Daily Scrapers grid (auto from backend)
  - Production Live Trackers grid (auto)
  - Fight Notification Settings grid (auto)
  - Toggle each on as desired.

## 6. Backfill existing rows (if any)

If the org's events were already in the DB under a non-canonical promotion string:

```bash
cd packages/backend
pnpm tsx src/scripts/canonicalizePromotionStrings.ts            # dry run
pnpm tsx src/scripts/canonicalizePromotionStrings.ts --apply    # commit
```

This walks every Event row, looks up the promotion string in the registry (canonical or alias), and rewrites to canonical. Idempotent.

## What still requires manual updates outside the registry

- **Bundled fallback `ORGANIZATIONS` arrays** in `packages/mobile/store/OrgFilterContext.tsx` and `packages/web/src/lib/orgFilter.tsx` — these are the offline / pre-fetch defaults. Already-running clients hydrate from `/api/promotions` within 24h, so this is a soft second touch point: needed for fresh installs only. Update at the next mobile/web release.
- **Admin event-edit + global-filter `<select>` dropdowns** in `packages/backend/public/admin.html` (lines ~1714 + ~1947) — still hardcoded; intentionally include legacy values like Bellator / PBC for editing old DB rows. Worth extending the registry with an `adminVisible` field to migrate these. Tracked.
- **Mobile org-matching rules** (`ORG_GROUPS` in `OrgFilterContext.tsx`) — only needed when the org has substring/exact-match patterns for handling promotion-string variants. Most new orgs don't need this.

## Audit checklist (sanity)

After onboarding, an admin event with the new promotion should:
- Appear with the correct logo on the events list (mobile/web)
- Match the new filter pill (toggle the pill, verify only matching events show)
- Show the bell-toggle on upcoming-fight modals (if `notificationEligible: true`)
- Trigger the bell-toast with the right wording (tracker precision vs section-start fallback) per `hasReliableLiveTracker`
- Live-update during the event (if tracker is reliable) OR fire the section-start ping (if not)

If any of those break, check:
- `Event.promotion` matches `registryEntry.canonicalPromotion` exactly (case + spaces)
- `Event.scraperType` matches the registry entry's `scraperType`
- `notify_promotions` SystemConfig has the canonical promotion string (admin grid toggle)
