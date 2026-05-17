# Handoff: Org Onboarding System Design

**Date**: 2026-05-02
**Context**: Continuation of section-start notification work earlier today (commits `c7d8205`, `7278880`). User flagged that several orgs are missing from admin "Fight Notification Settings" toggle area, asked to confirm consistency across all toggle/dropdown areas, and wants to design a system for onboarding new orgs cleanly because they touch many disconnected places in the codebase.

User said in their last message: "lets pivot into this: design system for onboarding new orgs. - retroactive scraper, live scraper, daily scraper, admin panel, app logo, dropdowns on events screen of admin panel and elsewhere..."

User then said: "once you're done processing this prompt, simply write a handoff doc - i am going to take over this work with another claude code window."

This doc IS the handoff. The previous window did the audit and proposed a design but did NOT implement anything new on this prompt. Pick up from here.

---

## Audit results — where each promotion is referenced

There are **9 distinct lists/dropdowns** that each have to be kept in sync when a new org is added. Today they have **drifted** — at least 4 confirmed gaps + several near-orphans.

### Canonical 14-org list (per mobile `OrgFilterContext.tsx:5`)

`UFC`, `PFL`, `ONE`, `BKFC`, `OKTAGON`, `RIZIN`, `KARATE COMBAT`, `DIRTY BOXING`, `ZUFFA BOXING`, `TOP RANK`, `GOLDEN BOY`, `GOLD STAR`, `MVP`, `RAF`

### The 9 places an org has to appear (cross-reference matrix)

| Org | Mobile ORGS list | Mobile ORG_GROUPS rules | Mobile PromotionLogo | Web ORGS list | Admin Daily Scrapers (auto from backend) | Admin Production Live Trackers (auto from `ALL_SCRAPER_TYPES`) | Admin Fight Notification Settings (`ALL_PROMOTIONS_FOR_NOTIFY`) | Admin event-edit dropdown + global filter | Backend `TAPOLOGY_RELIABLE_PROMOTIONS_UPPER` |
|---|---|---|---|---|---|---|---|---|---|
| UFC | ✅ | — | ✅ | ✅ | ✅ ufc | ✅ ufc | ✅ | ✅ | n/a (own scraper) |
| PFL | ✅ | — | ✅ | ✅ | ✅ pfl | ✅ pfl | ✅ | ✅ | ✅ |
| ONE | ✅ | — | ✅ | ✅ | ✅ onefc | ✅ onefc | ✅ | ✅ | n/a |
| BKFC | ✅ | — | ✅ | ✅ | ✅ bkfc | ✅ bkfc | ✅ | ✅ | n/a |
| OKTAGON | ✅ | — | ✅ | ✅ | ✅ oktagon | ✅ oktagon | ✅ | ✅ | n/a |
| RIZIN | ✅ | — | ✅ | ✅ | ✅ tapology | ✅ tapology | ✅ Rizin | ✅ Rizin | ✅ |
| KARATE COMBAT | ✅ | — | ✅ | ✅ | ✅ tapology | ✅ tapology | ✅ | ✅ | ✅ |
| DIRTY BOXING | ✅ | ✅ | ✅ DBX_LOGO | ✅ | ✅ tapology | ✅ tapology | ✅ | ✅ | ✅ |
| ZUFFA BOXING | ✅ | ✅ | ✅ | ✅ | ✅ tapology | ✅ tapology | ✅ | ✅ | ✅ |
| TOP RANK | ✅ | ✅ | ✅ | ✅ | ✅ tapology | ✅ tapology | **❌ MISSING** | ✅ Top Rank | ❌ (correct — unreliable tracker) |
| GOLDEN BOY | ✅ | ✅ | ✅ | ✅ | ✅ tapology | ✅ tapology | ✅ Golden Boy | ✅ Golden Boy | ❌ (correct — unreliable tracker) |
| GOLD STAR | ✅ | — | ✅ GOLD_STAR_LOGO (PNG) | **❌ MISSING** | ✅ tapology | ✅ tapology | **❌ MISSING** | ✅ Gold Star | ❌ (correct — unreliable tracker) |
| MVP | ✅ | — | ✅ | ✅ | ✅ tapology | ✅ tapology | **❌ MISSING** | ✅ MVP | ❌ (correct — unreliable tracker) |
| RAF | ✅ | — | ✅ | ✅ | ✅ raf | ✅ raf | ✅ | ✅ | n/a |
| MATCHROOM | **HIDDEN_ORGS** (mobile) | — | ✅ | **HIDDEN_ORGS** (web) | ✅ matchroom | ✅ matchroom | ✅ Matchroom Boxing | ✅ Matchroom | ❌ |

Plus three vestigial entries that exist as logos only with no ORGS-list backing: **PBC**, **SHOWTIME**, **THE RING** — see `PromotionLogo.tsx:74,134,153`. Probably fine to leave.

### Confirmed gaps to fix

1. **TOP RANK** missing from admin `ALL_PROMOTIONS_FOR_NOTIFY` (`packages/backend/public/admin.html:3859-3872`)
2. **GOLD STAR** missing from admin `ALL_PROMOTIONS_FOR_NOTIFY`
3. **MVP** missing from admin `ALL_PROMOTIONS_FOR_NOTIFY`
4. **GOLD STAR** missing from web `ORGANIZATIONS` list (`packages/web/src/lib/orgFilter.tsx:5`) — present in mobile but not web

### Dead toggle (configured but unreachable)

5. **Matchroom Boxing** is in admin `ALL_PROMOTIONS_FOR_NOTIFY` AND in `Production Live Trackers` (as `matchroom` scraperType) — but `MATCHROOM` is in `HIDDEN_ORGS` on both mobile (`OrgFilterContext.tsx:28`) and web (`orgFilter.tsx:15`). So Matchroom events never appear in user-facing event lists, which means the bell toggle and tracker toggle are effectively dead. Either un-hide it or remove from admin lists. Not blocking, but worth resolving so admin reflects reality.

### Naming-drift bug (already known, not yet fixed)

Per `scrapers.md` line 82: DB has 3 casing variants in the wild — `TOP_RANK`(25)/`Top Rank`(1), `Matchroom Boxing`(14)/`Matchroom`(2), `Rizin`(9)/`RIZIN`(2). These were written by older parser versions. A one-shot `updateMany` to canonicalize + fix the writing parser is a tracked follow-up. **The onboarding registry below should fix this at the source by exporting one canonical string per org and having all parsers consume it.**

---

## Onboarding doc finding

User asked to find a doc about onboarding new orgs from the last 2 weeks. **No dedicated onboarding checklist exists.** Closest is `docs/areas/scrapers.md` (last modified 2026-05-01) which is architectural reference + gotchas, not a step-by-step onboarding guide. So this handoff is greenfield.

---

## Touch points when onboarding a new promotion

Based on grepping the codebase. Each numbered item is a place a new org has to be touched/added. **Forgetting any one of these breaks something silently.**

### Backend (most files)

1. `packages/backend/src/services/scrapeAll{Org}Data.js` — daily scraper (Puppeteer or Cheerio). Or use Tapology daily scraper script `scrapeAll{Org}Tapology.js`.
2. `packages/backend/src/services/{org}DataParser.ts` — parse daily scrape output into DB. **Output dir convention footgun**: `services/{org}/data/...` directory the scraper writes to MUST match the directory the parser reads from. No hyphens; concatenated lowercase (`goldenboy`, `toprank`, `dirtyboxing`). Mismatch causes silent ENOENT — see `2026-04-10.md`.
3. `packages/backend/src/services/{org}LiveScraper.ts` + `{org}LiveParser.ts` — only if dedicated live tracker (UFC, BKFC, ONE FC, Oktagon, Matchroom). Tapology-tracked orgs use the generic `tapologyLiveScraper.ts` + `tapologyLiveParser.ts` and just need a hub-map entry (#5 below).
4. `packages/backend/src/services/backfill{Org}Results.ts` — retroactive backfill wrapper. Required for orgs with their own live tracker (UFC/BKFC/ONE/Oktagon/Matchroom). Tapology family uses the older `backfillTapologyResults.ts` path and just needs the hub-map entry.
5. `packages/backend/src/scripts/runTapologyLiveTracker.ts` `TAPOLOGY_PROMOTION_HUBS` — only for Tapology-tracked orgs. Add `{ url, slugFilter, scopeSelector? }` entry. **DUPLICATED in `backfillTapologyResults.ts`** — both must be edited (low-priority refactor to share).
6. `packages/backend/src/config/liveTrackerConfig.ts`:
   - `ScraperType` union — only if introducing a new scraperType (rare; existing 8 cover most cases)
   - `ALL_SCRAPER_TYPES` — same
   - `DEFAULT_PRODUCTION_SCRAPERS` — only if it should auto-enable on first boot
   - `TAPOLOGY_RELIABLE_PROMOTIONS_UPPER` — add to set if Tapology-tracked AND the live tracker actually delivers reliable per-fight updates (see today's section-start fix)
7. `packages/backend/src/services/eventLifecycle.ts` — workflow dispatch map at lines 238 + 264-310. Only if introducing a new scraperType. Used to dispatch GitHub Actions or VPS scraper workflows.
8. `.github/workflows/{org}-scraper.yml` — daily cron. Or delegate to existing tapology-scraper workflow.
9. `.github/workflows/{org}-live-tracker.yml` — only for orgs with dedicated live tracker.
10. **VPS deploy** — Tapology family live trackers run on Hetzner VPS (`scraperService.ts`). Per `scrapers.md` line 72: VPS does NOT auto-deploy from `main`. After committing, must `ssh` + `bash /opt/scraper-service/packages/backend/vps-update.sh`.

### Admin panel — `packages/backend/public/admin.html`

11. `ALL_PROMOTIONS_FOR_NOTIFY` array (~line 3859) — add `{ value, label, scraper }`. **This is where TOP RANK / GOLD STAR / MVP are missing today.**
12. `SCRAPER_LABELS` map (~line 3908) — add label only if introducing a new scraperType.
13. Event-edit form `<select id="eventPromotion">` (~line 1947) — add `<option>`.
14. Global filter `<select id="globalPromotion">` (~line 1714) — add `<option>`. **This is the SAME hardcoded list duplicated.**

### Mobile — `packages/mobile/`

15. `store/OrgFilterContext.tsx` `ORGANIZATIONS` array (line 5) — add to canonical list.
16. `store/OrgFilterContext.tsx` `ORG_GROUPS` (line 11) — add matching rules ONLY if the promotion string has variants in the DB (e.g. spaces vs underscores). Default behavior auto-handles `KARATE COMBAT` ↔ `KARATE_COMBAT`.
17. `components/PromotionLogo.tsx` — add SVG-as-string OR PNG asset import + branch in the conditional block at lines 178-268.
18. `assets/promotions/{name}_logo.png` — only if PNG (e.g. `goldstar_logo.png`, `zuffa_boxing_logo.png`).

### Web — `packages/web/`

19. `src/lib/orgFilter.tsx` `ORGANIZATIONS` array (line 5) — same idea as mobile. **This is where GOLD STAR is missing today.**
20. `src/lib/orgFilter.tsx` `ORG_GROUPS` and `HIDDEN_ORGS` — same idea.
21. Web's promotion logo component (likely mirrors mobile's PromotionLogo) — verify and add.

### Database / data

22. **Promotion string canonicalization** — every parser must write the SAME canonical string for the same org. Today there's drift (`TOP_RANK` vs `Top Rank`, etc.). Cleanest fix: parsers import a constant from a shared registry rather than writing string literals.
23. **One-shot `updateMany` per the scrapers.md note** — normalize existing rows after the registry is in place.

### Docs

24. `docs/areas/scrapers.md` "Scraper Inventory" table — add row.

**Total: 24 distinct touch points.** This is why the user is asking for an onboarding system — the current state is a maintenance hazard.

---

## Proposed design

### Goal

Reduce 24 touch points → 1 registry edit + a thin checklist for the things that genuinely can't be derived (asset files, GitHub workflow files, scraper logic).

### Recommended architecture: a single canonical promotion registry

**Single source of truth file:** `packages/backend/src/config/promotionRegistry.ts`

Shape (sketch):

```ts
export interface PromotionRegistryEntry {
  /** Canonical code used for keying — UPPER_SNAKE. Stable forever. */
  code: 'UFC' | 'PFL' | 'ONE' | 'BKFC' | 'OKTAGON' | 'RIZIN' | 'KARATE_COMBAT'
      | 'DIRTY_BOXING' | 'ZUFFA_BOXING' | 'TOP_RANK' | 'GOLDEN_BOY'
      | 'GOLD_STAR' | 'MVP' | 'RAF' | 'MATCHROOM';

  /** Canonical promotion string written to Event.promotion by ALL parsers.
   *  Single source of truth — no more `TOP_RANK` vs `Top Rank` drift. */
  canonicalPromotion: string;

  /** Short label shown in admin dropdowns, mobile filter pills, etc. */
  shortLabel: string;

  /** Full official name shown in admin event-edit form. */
  fullLabel: string;

  /** scraperType this org uses. */
  scraperType: 'ufc' | 'pfl' | 'onefc' | 'bkfc' | 'oktagon' | 'matchroom' | 'tapology' | 'raf';

  /** Whether the live tracker actually delivers reliable per-fight updates.
   *  Drives hasReliableLiveTracker(). For non-tapology scraperTypes, true.
   *  For tapology, true only for the 5 reliable promos. */
  hasReliableLiveTracker: boolean;

  /** Logo asset reference (mobile/web map this to their bundled assets). */
  logoKey: string; // e.g. 'ufc' → both mobile + web know how to resolve

  /** Visible on the user-facing event filter? false = HIDDEN_ORGS. */
  userVisible: boolean;

  /** Eligible for the bell? Was hardcoded ALL_PROMOTIONS_FOR_NOTIFY. */
  notificationEligible: boolean;

  /** For Tapology-tracked orgs, the hub map entry. Empty if not tapology. */
  tapologyHub?: { url: string; slugFilter: string[]; scopeSelector?: string };

  /** Optional aliases the parsers might encounter in the wild that should
   *  normalize to canonicalPromotion when matched. Used by canonicalize-promotion
   *  helper + the one-shot DB normalization migration. */
  aliases: string[];
}

export const PROMOTION_REGISTRY: PromotionRegistryEntry[] = [ /* 14 entries */ ];

export function getPromotionByCode(code: string): PromotionRegistryEntry | null { ... }
export function getPromotionByCanonical(promo: string): PromotionRegistryEntry | null { ... }
export function canonicalizePromotion(rawPromo: string): string { ... } // strips drift
```

### Wire the registry into all 24 touch points

**Backend-driven (auto-populate from registry — no hardcoded lists):**

- `liveTrackerConfig.ts` `TAPOLOGY_RELIABLE_PROMOTIONS_UPPER` → `PROMOTION_REGISTRY.filter(p => p.scraperType === 'tapology' && p.hasReliableLiveTracker).map(p => p.canonicalPromotion.toUpperCase())`
- `liveTrackerConfig.ts` `hasReliableLiveTracker(scraperType, promotion)` → looks up registry by promotion
- `runTapologyLiveTracker.ts` `TAPOLOGY_PROMOTION_HUBS` → built from `PROMOTION_REGISTRY.filter(p => p.tapologyHub).reduce(...)` (also fixes the duplicated hub map in `backfillTapologyResults.ts`)
- New endpoint `GET /admin/config/promotions` returns the registry
- New endpoint `GET /api/promotions` returns the user-visible subset

**Admin panel changes:**

- `ALL_PROMOTIONS_FOR_NOTIFY` deleted; admin grid fetches from `/admin/config/promotions` and renders entries where `notificationEligible === true`
- `SCRAPER_LABELS` derived
- Event-edit form `<select>` and global filter `<select>` populated dynamically from the same endpoint instead of hardcoded options

**Mobile changes:**

- `ORGANIZATIONS` array fetched from `/api/promotions` on app boot, cached locally (treat as fairly static — TTL 24h, fallback to bundled list if offline)
- `HIDDEN_ORGS` derived from `userVisible: false` entries
- `ORG_GROUPS` matching rules derived from `aliases`
- `PromotionLogo.tsx` keeps the asset mapping (logos must be bundled, can't be remote — but the keys come from registry)

**Web changes:**

- Same as mobile — `orgFilter.tsx` fetches from API instead of hardcoding

**Parser changes (the naming-drift fix):**

- Every `services/*DataParser.ts` writes `Event.promotion = registryEntry.canonicalPromotion` instead of a string literal
- One-shot migration script `src/scripts/canonicalizePromotionStrings.ts` runs `canonicalizePromotion(row.promotion)` against every Event row and updates if different. Idempotent. Run once on prod after deploy.

### What can NOT be derived (still manual per onboarding)

- Scraper logic file (`scrapeAll{Org}Data.js` or hub map entry — actual code)
- Parser file (`{org}DataParser.ts` — actual code)
- Live tracker file (only if dedicated)
- Backfill wrapper (only if dedicated tracker)
- GitHub Actions workflow YAML
- Logo asset file (PNG) or SVG string
- VPS deploy (Tapology family) — needs SSH + `vps-update.sh` (consider auto-deploy from main as a separate follow-up)

### Onboarding checklist (final deliverable doc)

After registry is in place, write `docs/playbooks/onboard-new-promotion.md` as a step-by-step:

```
1. Pick canonical code (UPPER_SNAKE) and canonical promotion string. Add entry
   to PROMOTION_REGISTRY in packages/backend/src/config/promotionRegistry.ts.
2. Add logo asset:
   - PNG → packages/mobile/assets/promotions/{logoKey}_logo.png +
     packages/web/public/promotions/{logoKey}.png
   - SVG → add to PromotionLogo.tsx (mobile) and the web equivalent
3. Pick scraper strategy:
   - Has a clean source site → write packages/backend/src/services/
     scrapeAll{Org}Data.js + {org}DataParser.ts
   - Tapology-only → set tapologyHub on registry entry; add scrape*Tapology.js
     in packages/backend/src/services/
4. Create GitHub workflow .github/workflows/{slug}-scraper.yml
5. Test daily scrape locally:
   pnpm tsx src/services/{org}DataParser.ts
6. (Optional) Dedicated live tracker. Skip for Tapology-tracked orgs.
7. (Optional) Dedicated backfill wrapper. Skip for Tapology-tracked orgs.
8. Push to main. Render auto-deploys. Verify admin panel auto-shows new entry.
9. (Tapology family only) SSH to VPS + run vps-update.sh.
10. Toggle on in admin panel: Daily Scrapers, Production Live Trackers, Fight
    Notification Settings.
11. Run pnpm tsx src/scripts/canonicalizePromotionStrings.ts if any rows already
    exist in DB with a non-canonical promotion string.
```

---

## Suggested implementation order for the next window

The user said "design system for onboarding new orgs". They didn't explicitly say "implement now". You can either:

**Option A — Ship it incrementally (recommended):**
1. **First, fix the immediate gaps** (3 missing entries + 1 web gap) — small, no risk, clears today's confusion. ~10-line edits.
2. **Then, build the registry** in `packages/backend/src/config/promotionRegistry.ts`. Wire into existing helpers (`hasReliableLiveTracker`, hub maps). Don't change admin/mobile/web yet.
3. **Then, expose `/admin/config/promotions` and `/api/promotions`** endpoints and migrate admin panel grid to use them. Ship.
4. **Then, migrate mobile + web** to fetch promotions from API. Ship via EAS update / Vercel.
5. **Then, parser canonicalization + one-shot DB migration.** Lowest urgency, highest blast radius.
6. **Finally, write the onboarding playbook** in `docs/playbooks/onboard-new-promotion.md`.

**Option B — Just write the design doc + fix gaps:**
- Fix the 3+1 gaps now
- Save the registry implementation for a dedicated session
- Ship a design doc as `docs/plans/promotion-registry.md` to be picked up later

The user has historically preferred shipping over planning (see memory `feedback_ship_full_pipeline.md`). I'd lean toward Option A but pace it across 2-3 sessions.

---

## Things to verify before touching code

- **Tapology hub map duplication**: confirm `backfillTapologyResults.ts` carries a copy of `TAPOLOGY_PROMOTION_HUBS` and that the registry refactor handles both. See `scrapers.md` line 80.
- **Matchroom decision**: ask user whether to remove from admin lists or un-hide on mobile/web. Currently it's in admin but hidden on user-facing — dead toggle.
- **PBC/Showtime/The Ring logo orphans**: `PromotionLogo.tsx` has logos for these but they're not in any ORGANIZATIONS list. Probably leftover from earlier exploration. Confirm with user before removing or registering them.
- **Web AGENTS.md says "this is NOT the Next.js you know"** — read `node_modules/next/dist/docs/` before touching `packages/web/`. App is on Next.js 16.2 with breaking changes vs mainstream training data.

---

## Today's prior work (context for handoff)

Same session also shipped (already on main, deployed):

- `c7d8205` — Section-start notifications for non-tracker events. New `notifyEventSectionStart` in `notificationService.ts` + Step 1.7 in `eventLifecycle.ts`. Bell now allowed on any promotion in the admin allowlist; mobile shows honest delivery-promise caption when `event.hasLiveTracking === false`.
- `7278880` — Per-promotion `hasLiveTracking`. New `hasReliableLiveTracker(scraperType, promotion)` in `liveTrackerConfig.ts` with `TAPOLOGY_RELIABLE_PROMOTIONS_UPPER` set. Wired into 4 sites + Step 1.7 gate. Mobile toast now branches: tracker orgs say "when this fight is up next", non-tracker orgs say "when {section} start(s)".
- `6399c11` — Updated admin panel "Fight Notification Settings" helper text to reflect both behaviors.

Memory updated:
- `project_notification_system_v2.md` — lane 2 "non-tracker fallback" marked SHIPPED 2026-05-02
- `project_follow_fighter_revival.md` — same
- `followup_notif_double_fire_suppression.md` — created (TODO when morning digest lane lands)
- `MEMORY.md` index — three relevant lines updated

The `TAPOLOGY_RELIABLE_PROMOTIONS_UPPER` set in `liveTrackerConfig.ts` is the precursor to the registry's `hasReliableLiveTracker` field — it should fold into the registry naturally.

Daily log entry: `docs/daily/2026-05-02.md` covers today's section-start work in detail, but does NOT cover this onboarding-system design (this handoff doc holds it).

---

## Recap of what next-window should do

1. Read this doc + `docs/areas/scrapers.md` + `docs/daily/2026-05-02.md`.
2. Confirm with user: Option A (incremental ship) or Option B (design + small fixes only)?
3. If Option A: start with the 4 gap fixes, then sequence registry → endpoints → mobile/web → parser canonicalization → playbook.
4. If Option B: ship the 4 gap fixes; create `docs/plans/promotion-registry.md` capturing the design above; stop.
5. Don't forget to commit + push (Render auto-deploy) + EAS update (mobile) + Vercel auto-deploy (web) — full pipeline per memory `feedback_ship_full_pipeline.md`.
