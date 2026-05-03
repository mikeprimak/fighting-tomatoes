# Plan: "How to Watch" Feature

**Status:** Design — not yet implemented
**Branch:** `claude/how-to-watch-feature-oXZ8j`
**Started:** 2026-05-03
**First target ship:** UFC 328 (May 9, 2026) — thin slice

---

## 1. Goal

Show users where they can watch each event (live and upcoming) based on their location. Convert "I want to watch this fight, where do I go?" — currently unanswered in the app — into a one-tap deep link to the right streaming/cable/PPV channel for the user's region.

Past events are **out of scope for now** (revisit later when we have time to handle archival sources like UFC Fight Pass / DAZN library / Prime Video catalog).

---

## 2. Scope

### Regions (6 buckets, in priority order)
1. 🇺🇸 **US** (United States) — biggest market
2. 🇨🇦 **CA** (Canada)
3. 🇬🇧 **UK** (United Kingdom)
4. 🇦🇺 **AU** (Australia)
5. 🇳🇿 **NZ** (New Zealand)
6. 🇪🇺 **EU** ("Europe" — single bucket for v1)

EU is one bucket on purpose — start simple. We list the common European broadcasters (DAZN, UFC Fight Pass, TNT Sports streaming where geo-permitted, etc.) and let the user pick. We can split into per-country EU buckets in a later pass once we know what European users actually want.

### Promotions (all of them)

Pulled from `docs/areas/scrapers.md`:

| Promotion | Existing scraper | Difficulty | Notes |
|-----------|------------------|------------|-------|
| UFC | `scrapeAllUFCData.js` | **Easy** | UFC.com publishes a regional broadcaster table per event |
| ONE FC | `scrapeAllOneFCData.js` | **Easy** | onefc.com/how-to-watch — global broadcaster list |
| PFL | `scrapeAllPFLData.js` | **Medium** | DAZN globally, varies by season/league |
| Matchroom | manual | **Easy** | DAZN globally |
| Oktagon | manual | **Easy** | Oktagon.TV + DAZN in some EU markets |
| BKFC | Tapology live tracker | **Trivial** | DAZN globally |
| RIZIN | Tapology live tracker | **Medium** | RIZIN Confession + Sherdog Fight Pass |
| Karate Combat | `scrapeKarateCombatTapology.js` | **Trivial** | YouTube + KC app — free |
| Dirty Boxing | `scrapeDirtyBoxingTapology.js` | **Easy** | DAZN |
| Zuffa Boxing | Tapology live tracker | **Hard** | Card-by-card rights — manual entry realistic |
| Top Rank | `scrapeTopRankTapology.js` | **Hard** | ESPN/ESPN+ in US, varies elsewhere |
| Golden Boy | `scrapeGoldenBoyTapology.js` | **Medium** | DAZN exclusive (still true as of last check — verify) |
| Gold Star | (covered by Tapology hub) | **Medium** | DAZN |
| MVP | `scrapeMVPTapology.js` | **Hard** | Netflix sometimes, varies dramatically — manual |
| RAF | `scrapeAllRAFData.js` | **Easy** | YouTube — free |
| The Ring | (covered by Tapology hub) | **Medium** | DAZN |

**The boxing landscape is the hard part** — boxing rights are negotiated card-by-card. Default templates won't cover it. Plan: per-event manual entry for Top Rank + Zuffa Boxing + MVP + Riyadh Season cards. Expect this to be ~5–10 minutes of admin work per major boxing event.

### Pricing display: SKIP

We do **not** show dollar amounts. Two-tier label only:
- `FREE` (e.g., RAF on YouTube, Karate Combat on YouTube)
- `PAID` (everything else — subscription or PPV)

Optional sub-label `PPV` to distinguish numbered UFC cards from included-with-subscription content (because that's a meaningful UX signal even without a price). So three effective tiers:
- `FREE` — no signup, no payment
- `SUBSCRIPTION` — included with the channel's subscription
- `PPV` — extra purchase on top of any subscription

---

## 3. Data Model (Prisma schema additions)

### New tables

```prisma
// A streaming/cable/PPV channel that broadcasts events.
model BroadcastChannel {
  id             String   @id @default(uuid())
  slug           String   @unique  // "espn-plus", "dazn", "tnt-sports", "ufc-fight-pass"
  name           String            // "ESPN+", "DAZN", "TNT Sports", "UFC Fight Pass"
  logoUrl        String?           // R2-hosted logo (square preferred)
  homepageUrl    String?           // Generic homepage if no event-level deep link
  // Optional iOS/Android deep-link template — `{slug}` placeholder swapped at render time.
  // null means open homepageUrl in browser.
  iosDeepLink    String?
  androidDeepLink String?
  webDeepLink    String?
  // Affiliate URL template — used when present, falls back to homepageUrl. Has `{eventSlug}` placeholder.
  affiliateUrl   String?
  isActive       Boolean  @default(true)

  broadcasts     EventBroadcast[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("broadcast_channels")
}

// One row per (event × channel × region). An event has many of these.
model EventBroadcast {
  id           String   @id @default(uuid())

  eventId      String
  event        Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  channelId    String
  channel      BroadcastChannel @relation(fields: [channelId], references: [id])

  // ISO 3166-1 alpha-2 country code, OR the special "EU" bucket for v1.
  // Allowed values for v1: "US", "CA", "GB", "AU", "NZ", "EU"
  region       String

  // Tier — drives the badge in the UI.
  tier         BroadcastTier   // FREE | SUBSCRIPTION | PPV

  // Optional deep link override for this specific event (e.g., direct PPV order page).
  // Falls back to channel.affiliateUrl, then channel.homepageUrl.
  eventDeepLink String?

  // Optional language code if the broadcast is in a non-English language (e.g., "es" for Spanish).
  language     String?

  // Free-text note shown under the channel name. Use sparingly — e.g., "Main card only" or "PPV via TV provider".
  note         String?

  // Provenance — how this row was created.
  source       BroadcastSource @default(MANUAL)
  // For SCRAPED rows: when the scraper last verified this entry. Used to expire stale auto-data.
  lastVerifiedAt DateTime?

  isActive     Boolean  @default(true)

  createdAt    DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([eventId, channelId, region])
  @@index([eventId])
  @@index([region])
  @@map("event_broadcasts")
}

enum BroadcastTier {
  FREE
  SUBSCRIPTION
  PPV
}

enum BroadcastSource {
  MANUAL    // entered in admin panel
  SCRAPED   // pulled by a scraper
  DEFAULT   // applied via PromotionBroadcastDefault rule
}

// Default broadcaster mapping per (promotion × region). Fills events that have no
// explicit EventBroadcast row, so we don't have to enter "BKFC = DAZN globally" 50 times.
model PromotionBroadcastDefault {
  id          String   @id @default(uuid())
  promotion   String   // matches Event.promotion strings ("UFC", "ONE FC", "BKFC", etc.)
  region      String   // "US" | "CA" | "GB" | "AU" | "NZ" | "EU"
  channelId   String
  channel     BroadcastChannel @relation(fields: [channelId], references: [id])
  tier        BroadcastTier
  note        String?
  isActive    Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([promotion, region, channelId])
  @@map("promotion_broadcast_defaults")
}

// User reports of incorrect broadcast info — admin reviews and acts on these.
model BroadcastReport {
  id           String   @id @default(uuid())
  broadcastId  String?  // EventBroadcast.id if user reported a specific row
  eventId      String   // always required so we know which event
  region       String
  reportedBy   String?  // userId, nullable for anonymous
  reason       String   // free-text from the user
  status       BroadcastReportStatus @default(OPEN)
  resolution   String?  // admin note when closed
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?

  @@index([status])
  @@index([eventId])
  @@map("broadcast_reports")
}

enum BroadcastReportStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  REJECTED
}
```

Add to `BroadcastChannel`: backref to defaults.
```prisma
defaults  PromotionBroadcastDefault[]
```

### Changes to existing `Event` model

Add the relation:
```prisma
broadcasts  EventBroadcast[]
```

**Do not delete `mainChannel` / `mainLink` / `prelimChannel` / `prelimLink` yet.** Strategy:
1. Phase 3a (this rollout): leave the legacy fields in place. New UI reads from `EventBroadcast` if any exist; falls back to `mainChannel`/`mainLink` when empty.
2. Phase 3b (later): one-shot migration script writes legacy values into `EventBroadcast` with `region='US'` (best guess), `tier='SUBSCRIPTION'`, `source='MANUAL'`. Then deprecate the legacy fields.
3. Phase 3c (later): drop the legacy fields after verifying nothing on web/mobile/admin still reads them.

### User region preference

Add to `User`:
```prisma
broadcastRegion String? // "US" | "CA" | "GB" | "AU" | "NZ" | "EU" — null means use IP detection
```

---

## 4. Geo-Detection

### Server-side detection

Render passes a country header on incoming requests:
- Cloudflare-style: `cf-ipcountry`
- Render's own: check `request.headers['x-forwarded-for']` against a MaxMind lookup, OR add Cloudflare in front (already?).
- **Action item:** check what header Render currently passes. Add a small middleware in `packages/backend/src/server.ts` that resolves `request.region` from headers, with the priority:
  1. `?region=US` query param (debugging / share-link override)
  2. Authenticated user's `broadcastRegion` preference
  3. `cf-ipcountry` header → mapped to one of our 6 buckets
  4. Default fallback: `US`

Mapping rules:
- `US` → `US`
- `CA` → `CA`
- `GB` → `GB` (UK)
- `AU` → `AU`
- `NZ` → `NZ`
- Any country in EEA + Switzerland + Norway + Iceland + microstates → `EU`
- Anything else (Asia, LATAM, Africa, ME) → fallback to `US` for now, with a clear "Set your region" prompt visible in the UI. Document this fallback choice — we expand later if data shows demand.

### Client-side override (mobile app)

On the **profile screen**, add a "Watch region" row. Tap → bottom sheet with the 6 options + "Auto-detect (currently: 🇺🇸 US)". Persists to backend via `PATCH /users/me { broadcastRegion: 'GB' }`. The backend prefers this over the IP header on every subsequent request from this user.

For unauthenticated browsing on web, a localStorage key `broadcastRegion` overrides the IP detection in the same priority order.

---

## 5. UI Placement

### Live Events tab (`packages/mobile/app/(tabs)/live-events.tsx`)

Below each event header (above or below the fight list — A/B in design), one row per applicable broadcast for the user's region:

```
📺 Watch on  [logo]  ESPN+    PPV       →
              [logo]  Fight Pass  Subscription   →
```

Tap the row → open the event deep link (or affiliate URL) externally via `Linking.openURL()`.

### Upcoming Events tab (`packages/mobile/app/(tabs)/index.tsx` — verify file path)

Same component, same data fetch, smaller / collapsed by default if there are >2 options. Show top 1 by default with "+ 2 more" expandable.

### Past Events — out of scope for v1

Don't render anything. Component returns `null` when `event.eventStatus === 'COMPLETED'` (configurable later).

### Web app (`packages/web`)

Mirror the mobile component on the corresponding event cards in the web's live and upcoming list views. Same API, different rendering.

### Region indicator + "wrong region?" affordance

Every "How to Watch" block has a small region indicator at top-right:

```
📺 Watching from 🇺🇸 US — change
```

Tap "change" → opens region picker (same one as profile). Resolves the most common gripe (VPN users, travelers, wrong IP detection) inline without forcing a trip to settings.

### "Report incorrect" affordance

Long-press a broadcast row, OR a small `…` icon, opens an action sheet:
- "This is wrong" → opens a small form (channel, free text), POSTs `BroadcastReport`
- "Channel changed" → same
- "Cancel"

Confirmation toast: "Thanks — we'll check it." Routes a row into `BroadcastReport` with `status=OPEN`. Admin reviews queue daily.

---

## 6. Component Contract

Mobile + web use the same shape from the API:

```ts
type HowToWatchResponse = {
  region: 'US' | 'CA' | 'GB' | 'AU' | 'NZ' | 'EU';
  detectedFrom: 'user-pref' | 'query-param' | 'ip' | 'fallback';
  broadcasts: Array<{
    id: string;          // EventBroadcast.id (or `default-<channelId>` for default-derived rows)
    channel: {
      slug: string;
      name: string;
      logoUrl: string | null;
    };
    tier: 'FREE' | 'SUBSCRIPTION' | 'PPV';
    deepLink: string;    // event-specific or channel.homepageUrl fallback
    note: string | null;
    language: string | null;
    source: 'MANUAL' | 'SCRAPED' | 'DEFAULT';
  }>;
};
```

The backend resolves the broadcasts list in this order:
1. Query `EventBroadcast` rows for this `eventId` and `region` where `isActive=true`.
2. If empty, query `PromotionBroadcastDefault` for this event's `promotion` and `region`.
3. If empty, return an empty list. UI renders a graceful "Broadcaster info coming soon — [report it]" placeholder.

---

## 7. Backend API

New endpoints in `packages/backend/src/routes/`:

```
GET  /api/events/:id/broadcasts?region=GB
     → HowToWatchResponse (region resolved server-side; query param wins)

PATCH /api/users/me/broadcast-region
     body: { region: 'GB' | null }
     → 200 { broadcastRegion: 'GB' }

POST /api/events/:id/broadcasts/report
     body: { region: string, reason: string, broadcastId?: string }
     → 201 { reportId: string }
```

Admin endpoints (in `packages/backend/src/routes/admin.ts`):

```
GET    /api/admin/broadcasts?eventId=...
POST   /api/admin/broadcasts                 // create EventBroadcast
PATCH  /api/admin/broadcasts/:id             // edit
DELETE /api/admin/broadcasts/:id             // soft via isActive=false

GET    /api/admin/broadcast-channels
POST   /api/admin/broadcast-channels
PATCH  /api/admin/broadcast-channels/:id

GET    /api/admin/broadcast-defaults?promotion=UFC
POST   /api/admin/broadcast-defaults
PATCH  /api/admin/broadcast-defaults/:id
DELETE /api/admin/broadcast-defaults/:id

GET    /api/admin/broadcast-reports?status=OPEN
PATCH  /api/admin/broadcast-reports/:id      // change status, write resolution note
```

All admin endpoints reuse the existing admin auth pattern (`ADMIN_EMAILS` + admin key, same as the rest of `admin.ts`).

---

## 8. Admin Panel Additions (`packages/backend/public/admin.html`)

Add three sections to the existing admin panel:

### 8a. Broadcast Channels (one-time setup, then rarely touched)

Simple CRUD table:
- slug, name, logo upload (R2), homepage URL, deep-link templates (iOS/Android/web), affiliate URL, isActive
- Initial seed list to enter manually:
  - `espn-plus` — ESPN+
  - `dazn` — DAZN
  - `ufc-fight-pass` — UFC Fight Pass
  - `tnt-sports` — TNT Sports
  - `tnt-sports-box-office` — TNT Sports Box Office
  - `main-event` — Main Event (AU PPV)
  - `kayo` — Kayo Sports (AU)
  - `youtube` — YouTube
  - `paramount-plus` — Paramount+
  - `netflix` — Netflix
  - `prime-video` — Prime Video
  - `rizin-confession` — RIZIN Confession
  - `sherdog-fight-pass` — Sherdog Fight Pass
  - `oktagon-tv` — Oktagon.TV
  - `karate-combat-app` — Karate Combat (app + YouTube)

Logos: download from each broadcaster's press kit / Wikipedia, upload to R2 via the existing image upload service. Store as ~256x256 PNG, transparent bg.

### 8b. Per-Event Broadcasts

On the existing per-event admin page, add a "How to Watch" section:
- Table: Region | Channel | Tier | Note | Source | Last Verified
- Add row → modal with region picker, channel picker, tier picker, optional deep link / note
- Edit / delete inline
- "Apply promotion defaults" button — populates rows from `PromotionBroadcastDefault` for any region not yet covered for this event

### 8c. Promotion Defaults

Standalone page: list of (promotion × region × channel) defaults. Bulk edit. This is where you set "BKFC + everywhere = DAZN" once and forget it.

### 8d. Broadcast Reports Inbox

Sidebar link: "Broadcast Reports (3)" with count of OPEN reports. Page lists open reports, click → see event/region/reason, button to "Mark resolved" or jump straight to the event's broadcasts editor.

---

## 9. Per-Promotion Data Sources (research / verification needed)

These are **starting hypotheses based on general knowledge**. The user verifies each before we hard-code them. Do not trust without a fresh check at https://<promotion>.com/how-to-watch (or equivalent).

### UFC
- **Source page:** UFC.com publishes a per-event "Where to Watch" table. URL pattern usually `https://www.ufc.com/event/<slug>` — the broadcaster section is on the event page itself. Selectors: look for a "How to watch" or "Where to watch" section / table on the event page DOM.
- **2026 hypotheses (verify each):**
  - US: ESPN+ (PPV for numbered cards, included for Fight Nights). _**Verify** — UFC is rumored to be moving rights to Paramount+ in 2026; check current state._
  - CA: TSN+ / RDS+ (French)
  - UK: TNT Sports (numbered + Fight Nights)
  - AU: Main Event (PPV) / Kayo (Fight Nights) / Stan Sport — verify
  - NZ: Sky Sport
  - EU: UFC Fight Pass primary, DAZN in some markets
- **Automation strategy:** extend `scrapeAllUFCData.js` to extract the broadcaster table during the per-event scrape. Output a `broadcasts` array on the event JSON. The data parser writes `EventBroadcast` rows with `source='SCRAPED'`.

### ONE FC
- **Source page:** `https://www.onefc.com/how-to-watch/` lists global broadcasters. Doesn't always vary per event — usually a single global mapping per region.
- **2026 hypotheses:** US: Prime Video (deal still active? verify). UK: TNT Sports. AU: Foxtel/Kayo. EU: varies, check `onefc.com/how-to-watch`.
- **Automation strategy:** scrape the `how-to-watch` page once daily, build a `PromotionBroadcastDefault` set automatically from it. Per-event overrides only when there's a press release announcing a special broadcaster.

### PFL
- **Source page:** `pflmma.com` event pages + press releases. DAZN was the main partner; verify season-by-season.
- **Hypotheses:** DAZN globally for most events. ESPN+ in US for some. Sky Sports in UK?
- **Automation strategy:** start with `PromotionBroadcastDefault` for DAZN in all regions. Override per event from press release scraping if needed (low ROI — manual entry probably fine for now).

### Matchroom Boxing
- **Source page:** Press releases + DAZN's schedule. Eddie Hearn's cards are DAZN globally for the most part.
- **Hypotheses:** DAZN globally except UK on rare occasions (Sky Sports historically — now mostly DAZN).
- **Automation strategy:** `PromotionBroadcastDefault` covers 95%. Manual override for the UK-divergent cards.

### Oktagon
- **Source page:** `oktagonmma.com` event pages + Oktagon.TV.
- **Hypotheses:** Oktagon.TV globally + DAZN in DE/AT/CZ/SK + RTVS in Slovakia. Free preliminary cards on YouTube sometimes.
- **Automation strategy:** mostly defaults. Per-event overrides if a card has a special TV deal (Czech national broadcaster, e.g.).

### BKFC
- **Hypotheses:** DAZN globally as of 2024 deal. Verify it still holds in 2026.
- **Automation strategy:** trivial — single `PromotionBroadcastDefault` row per region.

### RIZIN
- **Source page:** `rizinff.com` + RIZIN Confession (RIZIN's own streamer) + Sherdog Fight Pass for English-language coverage.
- **Hypotheses:** Japan: RIZIN Confession + WOWOW. International: Sherdog Fight Pass / Triller (varies).
- **Automation strategy:** mostly defaults; flag for manual review since deals shift.

### Karate Combat
- **Hypotheses:** Free worldwide on YouTube + KC app + KC website. Trivial.
- **Automation strategy:** single default `FREE / YouTube` row applied to all events.

### Dirty Boxing
- **Hypotheses:** DAZN globally.
- **Automation strategy:** single default row.

### Zuffa Boxing (TKO Boxing)
- **The hard one.** Card-by-card rights. Recently announced cards aired on ESPN/ESPN+ and DAZN with mixed deals.
- **Automation strategy:** **manual entry per event** in admin panel. No scraper. Accept this is the cost of covering boxing.

### Top Rank
- **Hypotheses:** US: ESPN/ESPN+. UK: Sky Sports / TNT. Varies.
- **Automation strategy:** manual entry per event (with strong default of "ESPN+ in US" applied via PromotionBroadcastDefault, overridable).

### Golden Boy
- **Hypotheses:** DAZN exclusive globally (verify — multi-year deal was announced).
- **Automation strategy:** default rows.

### Gold Star
- **Hypotheses:** DAZN.
- **Automation strategy:** defaults.

### MVP (Most Valuable Promotions — Jake Paul)
- **The other hard one.** Some cards on Netflix (Tyson vs Paul precedent), some on DAZN, some on different platforms.
- **Automation strategy:** **manual entry per event.** No scraper.

### RAF
- **Hypotheses:** Free on RAF YouTube channel.
- **Automation strategy:** single default `FREE / YouTube` row.

### The Ring (Saudi-funded)
- **Hypotheses:** DAZN + Saudi-aligned platforms (Riyadh Season).
- **Automation strategy:** defaults + per-event overrides for the major Riyadh Season cards.

---

## 10. Scraper Extension Pattern

**Goal:** keep changes minimal and follow the existing one-source-of-truth-per-org architecture (see `docs/areas/scrapers.md` — backfill orchestrator pattern).

### For native-scraper promotions (UFC, ONE FC, PFL, RAF)

1. In each `scrapeAll<X>Data.js`, during the per-event scrape, also extract a `broadcasts` field if the source page exposes it. Shape:
   ```js
   broadcasts: [
     { region: 'US', channelSlug: 'espn-plus', tier: 'PPV', note: null, deepLink: null },
     { region: 'GB', channelSlug: 'tnt-sports', tier: 'SUBSCRIPTION', note: null, deepLink: null },
     // ...
   ]
   ```
2. The corresponding `<x>DataParser.ts` reads this field and upserts `EventBroadcast` rows where `source='SCRAPED'`. Match strategy: `(eventId, channelId, region)` — it's the unique constraint.
3. Stamp `lastVerifiedAt = now()` on every successful scrape. Rows that haven't been verified in N days (e.g., 7) get flagged in the admin panel as "stale" so we know the source page changed.
4. **Don't delete rows** the scraper no longer sees — broadcasters sometimes vanish from a "how to watch" page mid-event-week and reappear. Instead, expire on `lastVerifiedAt` age.

### For Tapology-tracked promotions (BKFC, RIZIN, Top Rank, Golden Boy, KC, Dirty Boxing, etc.)

Tapology generally doesn't publish broadcaster info reliably. **Don't try to scrape from Tapology.** Instead:
1. Rely on `PromotionBroadcastDefault` rows for the bulk of coverage.
2. For promotions with their own "how to watch" pages (Karate Combat, etc.), add a **lightweight per-promotion broadcast scraper** that hits one URL, extracts the broadcaster mapping, and writes `PromotionBroadcastDefault` rows. Run weekly (cron). This is a new file pattern: `services/scrapeBroadcasts<Promotion>.js`.

### Generic fallback

For promotions where neither the daily scraper nor a custom broadcast scraper exists (Zuffa Boxing, MVP), broadcasts are 100% manual entry via the admin panel. That's fine — those events are rare and the admin work is bounded.

### Cron / GitHub Actions

Add a single new workflow `.github/workflows/broadcast-defaults-refresh.yml` that runs once per week and re-fetches the global "how to watch" pages for promotions that have one (UFC, ONE FC, BKFC if it has one, etc.). Cheap, low-risk, keeps defaults fresh.

---

## 11. Report Incorrect Flow — Detail

1. User taps "report" on a broadcast row.
2. Modal: "What's wrong?" with 4 quick-pick reasons + free text:
   - "Wrong channel"
   - "Channel doesn't broadcast in my country"
   - "Link is broken / dead"
   - "Other (please describe)"
3. Submit → `POST /api/events/:id/broadcasts/report` with `{ region, reason, broadcastId? }`.
4. Backend creates `BroadcastReport(status=OPEN)`, returns 201.
5. UI shows toast: "Thanks — we'll fix it soon."
6. Admin sees count badge in panel. Reviews the queue daily, fixes the underlying `EventBroadcast` row or `PromotionBroadcastDefault`, marks the report `RESOLVED` with a note.
7. Optional later: notify the user when their report is resolved (push notification or in-app inbox).

---

## 12. Affiliate Links + FTC Disclosure

Not required for v1, but design with this in mind so the affiliate slot is already there:
- `BroadcastChannel.affiliateUrl` is the field. When set on an event-deep-link click, route through it.
- Track clicks: add a lightweight `BroadcastClick` table later (eventId, channelId, region, userId?, clickedAt) for affiliate attribution and signal on which broadcasters drive engagement.
- **FTC / app-store compliance**: when the first click goes to an affiliate URL, the UI must show a small "Some links may earn us a commission" line. Add this once we wire up our first affiliate partner — not before.

Do not add affiliate links until v1 is live, validated, and we know which broadcaster relationships are worth the integration work.

---

## 13. Security / Privacy / Edge Cases

- **VPN users** get the IP-detected region; the manual override is the escape hatch. Document this in the FAQ once we have one.
- **Children / privacy**: we don't store IP or country at the user level — only the user-set preference. The IP-derived country is computed per-request and discarded.
- **Sanctioned countries** (e.g., users in countries where some streamers are blocked): they'll fall to the `US` default and the override is available. Don't try to be clever here.
- **Embedded illegal streams**: hard rule — never link to one. App stores will pull us. Curated channels only.
- **Event-deep-link rot**: if a deep link goes 404, the report flow surfaces it; admin replaces with a fresh URL.

---

## 14. Migration Plan (legacy `mainChannel` / `mainLink` fields)

Phase 3a (this rollout): non-breaking. New tables added, old fields untouched. The new API responds with `EventBroadcast` data; if the array is empty for the user's region, the UI gracefully shows the "Coming soon" placeholder OR optionally falls back to `mainChannel`/`mainLink` rendered as a single `region='US'` row labeled `SUBSCRIPTION`. **Pick one** — recommend the placeholder, since the legacy fields are stale on most events anyway.

Phase 3b (after the feature is live and stable for ~2 weeks):
- One-shot migration script `packages/backend/src/scripts/migrateLegacyBroadcastFields.ts`:
  - For every event with non-null `mainChannel`, create or skip an `EventBroadcast(region='US', channelId=lookupBySlug(mainChannel), tier='SUBSCRIPTION', source='MANUAL', eventDeepLink=mainLink)`.
  - Same for `prelimChannel` / `prelimLink` (note: 'Prelims only' in the `note` field).
- Run against Render external DB.
- After verification, schedule the field removal in a follow-up Prisma migration.

Phase 3c: drop legacy fields after grep confirms no readers remain in mobile, web, or admin code.

---

## 15. Implementation Order (concrete steps)

This is the order to actually build. Each step is independently shippable.

1. **Schema migration** — add the four new tables + `User.broadcastRegion` + `Event.broadcasts` relation. Run `prisma migrate dev` against local, verify, then `prisma migrate deploy` against Render.
2. **Seed broadcast channels** — write a one-time seed script `prisma/seed-broadcast-channels.ts` with the 15 channels listed in §8a. Upload logos to R2 (or use placeholder URLs initially and replace).
3. **Backend region detection middleware** — add `request.region` resolver in `server.ts`.
4. **Backend admin endpoints** — implement the CRUD endpoints in `routes/admin.ts` for channels, defaults, broadcasts, reports.
5. **Admin panel UI (§8)** — extend `public/admin.html` with the new sections. Use the existing inline-CRUD pattern for consistency.
6. **Seed promotion defaults** — for each promotion, manually enter the obvious defaults (BKFC=DAZN, KC=YouTube, RAF=YouTube, Golden Boy=DAZN, etc.). About 15 promotions × 6 regions = 90 rows max, mostly the same handful of channels. Realistically 30 rows because most promotions are global on one channel.
7. **Public read API** — `GET /api/events/:id/broadcasts?region=...`.
8. **Mobile `<HowToWatch>` component** — render on Live Events tab first.
9. **Mobile region preference UI** — profile screen row + bottom-sheet picker + `PATCH /api/users/me/broadcast-region` integration.
10. **Mobile region indicator + "change" affordance** — inline on the component.
11. **Mobile report flow** — long-press / `…` menu, modal, POST to report endpoint.
12. **Mobile rollout to Upcoming Events tab** — same component, same hook.
13. **Web app integration** — port the component to `packages/web` for live + upcoming.
14. **Admin: reports inbox** — page for reviewing OPEN reports.
15. **Per-event manual entry for UFC 328** — populate broadcast rows for the 6 regions. **This is the thin slice that ships first.** It can be done before steps 8–14 are perfect — as soon as the API and admin CRUD work, you can enter the data and fall back to a placeholder UI on the client.
16. **UFC scraper extension** — add the `broadcasts` extraction to `scrapeAllUFCData.js` + parser.
17. **ONE FC scraper extension** — same.
18. **Other native scrapers** — PFL, RAF as needed.
19. **Weekly broadcast-defaults refresh workflow** — `.github/workflows/broadcast-defaults-refresh.yml`.
20. **Migration of legacy `mainChannel` fields** — Phase 3b.

### Suggested first commits on this branch

- Commit A: Prisma schema + migration + seed script (no API or UI yet).
- Commit B: backend admin endpoints + admin panel UI for channels & defaults.
- Commit C: public read endpoint + region middleware.
- Commit D: mobile `<HowToWatch>` component on live tab + profile region picker.
- Commit E: report flow + admin reports inbox.
- Commit F: UFC scraper extension.
- Commit G: ONE FC scraper extension.

---

## 16. UFC 328 Thin Slice (target: May 9, 2026)

Today is **2026-05-03**. UFC 328 is **6 days out**. To ship a working slice for that card:

Minimum viable path:
1. Run the schema migration.
2. Seed the 15 broadcast channels via the seed script (or hand-enter via admin).
3. Hand-enter the 6 broadcast rows for UFC 328 (one per region) via the admin panel — verify each broadcaster against UFC.com first.
4. Ship the public read API.
5. Ship the mobile component on the Live Events tab only (skip Upcoming, skip web for v1).
6. Ship the profile region picker.
7. **Don't ship the report flow yet** — add it the following week. The first 6 days of usage will surface bugs we fix manually.

If we keep scope this tight, this is achievable in ~3 days of focused work.

---

## 17. Open Questions (decide as we build)

1. **Where exactly does the "How to Watch" block render on the Live Events tab — above or below the fight list?** Above probably wins; it's the highest-intent question.
2. **Does Render pass `cf-ipcountry`, or do we need to add Cloudflare in front?** Verify by inspecting one production request's headers.
3. **Default region for users outside our 6 buckets — `US` or "show all options"?** Leaning `US` with a clear "set your region" prompt. Reconsider if we get reports.
4. **Should the IP detection happen on the backend (per-request) or on the client first, with a server fallback?** Backend is simpler and faster.
5. **Do we expose `EventBroadcast.eventDeepLink` to users, or always go through `channel.affiliateUrl`?** Until we have affiliate deals, expose the eventDeepLink directly. Once we have an affiliate, we route through it transparently.
6. **EU bucket: is it worth splitting today?** No — ship the bucket, see if reports skew toward specific countries, then split.
7. **Logos: source from broadcaster press kits or use generic icons?** Press kits give a polished look but require maintenance. Start with press kit logos for the top 6 channels (ESPN+, DAZN, UFC Fight Pass, TNT Sports, YouTube, Prime Video); generic for the rest.
8. **What happens when an event has 0 broadcasts in the user's region AND no defaults?** Show "We're working on it — [report channel]" with a 1-tap report. **Decided: yes, this is the placeholder.**

---

## 18. File-by-File Change List (preview)

Backend:
- `packages/backend/prisma/schema.prisma` — add 4 models, 2 enums, User field, Event relation
- `packages/backend/prisma/migrations/<timestamp>_how_to_watch/migration.sql` — generated
- `packages/backend/prisma/seed-broadcast-channels.ts` — new
- `packages/backend/src/routes/admin.ts` — add ~10 new endpoints
- `packages/backend/src/routes/events.ts` (or wherever event routes live) — add `GET /:id/broadcasts`
- `packages/backend/src/routes/users.ts` — add `PATCH /me/broadcast-region`
- `packages/backend/src/server.ts` — region resolver middleware
- `packages/backend/src/services/region.ts` — new helper for country → region mapping
- `packages/backend/src/services/scrapeAllUFCData.js` — extract broadcasts
- `packages/backend/src/services/ufcDataParser.ts` — upsert EventBroadcast rows
- (later) `packages/backend/src/services/scrapeAllOneFCData.js` + parser
- `packages/backend/public/admin.html` — 3 new sections + reports inbox
- `packages/backend/src/scripts/migrateLegacyBroadcastFields.ts` — Phase 3b

Mobile:
- `packages/mobile/components/HowToWatch.tsx` — new component
- `packages/mobile/components/RegionPickerSheet.tsx` — new bottom sheet
- `packages/mobile/components/BroadcastReportModal.tsx` — new
- `packages/mobile/app/(tabs)/live-events.tsx` — render `<HowToWatch>`
- `packages/mobile/app/(tabs)/index.tsx` (or upcoming events file) — render `<HowToWatch>` (later)
- `packages/mobile/app/(tabs)/profile.tsx` — region picker row
- `packages/mobile/services/api.ts` — add 3 new endpoint methods

Web:
- `packages/web/components/HowToWatch.tsx` — port from mobile
- Hook into the live & upcoming event list pages

Workflows:
- `.github/workflows/broadcast-defaults-refresh.yml` — new weekly cron

Docs:
- `docs/areas/scrapers.md` — append a "Broadcast info" section once UFC scraper is extended
- `docs/areas/backend.md` — note the new tables and routes
- `docs/areas/mobile.md` — note the new screens / components

---

## 19. Notes for the Next Session

- Read this doc first.
- The branch is `claude/how-to-watch-feature-oXZ8j`.
- Today's daily log (`docs/daily/2026-05-03.md`) summarizes the design conversation.
- Start at §15 step 1 (Prisma migration) unless you want to pre-research a specific promotion's broadcaster page.
- Remember the project rules: **ask before EAS builds**, **never use local DB** (always Render external URL).
- When verifying current 2026 broadcaster deals, the user's manual research is the source of truth — don't hard-code without him confirming each one. Boxing rights especially shift quietly.
