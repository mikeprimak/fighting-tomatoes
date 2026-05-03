# How-to-Watch + Broadcast Discovery — Handoff

**Status (2026-05-03):** Shipped to prod. End-to-end working. Open items at the bottom.

This doc is self-contained — read it cold to resume.

---

## What it does

Two related systems:

1. **How-to-Watch** — region-aware "where do I watch this fight?" UI on every event.
   Mobile users see: `[🇺🇸 US] On: Paramount+ [Sub] ›` above each card section. Per-section
   broadcasters supported (early prelims on Fight Pass, prelims on CBS, main on Paramount+).
   Tap to deep-link. Region picker available globally (one change updates all instances).

2. **Broadcast Discovery Job** — a weekly autonomous web crawler that hunts for new
   broadcaster deals + drift in existing ones, posts findings to an admin inbox. Admin
   reviews + applies — nothing auto-publishes.

---

## Where it lives

### Database (Render external Postgres)

5 new tables, applied via 3 migrations:

| Table | Purpose |
|---|---|
| `broadcast_channels` | Streamers/cable nets (Paramount+, DAZN, Sky Sports, etc.). Slug-keyed. 28 rows seeded. |
| `event_broadcasts` | Per-event per-region broadcast row. `cardSection` field allows per-section overrides (NULL/EARLY_PRELIMS/PRELIMS/MAIN_CARD). 3 rows for UFC 328 demo. |
| `promotion_broadcast_defaults` | Per-promotion × region fallback. 94 rows seeded. `lastDiscoveryAt` tracks auto-verification freshness. |
| `broadcast_reports` | User-flagged corrections inbox. 0 rows. |
| `broadcast_discoveries` | Discovery-job findings inbox. 5 rows from first run (all reviewed). |

`User.broadcastRegion` (nullable) added. `Event.broadcasts` relation added.

Migrations:
- `20260503180000_how_to_watch` — main 4 tables
- `20260503210000_broadcast_card_section` — `cardSection` column
- `20260503230000_broadcast_discovery` — discovery table + `lastDiscoveryAt`

### Backend (`packages/backend/`)

```
src/services/region.ts                       — IP/header → region bucket mapper
src/routes/broadcasts.ts                     — public read API + report flow
src/routes/adminBroadcasts.ts                — admin CRUD + discovery actions
src/services/broadcastDiscovery/
  ├── README.md                              — operator's guide for the job
  ├── searchBrave.ts                         — Brave Search API wrapper
  ├── fetchHowToWatch.ts                     — official-page scraper
  ├── extract.ts                             — Claude Haiku extraction (prompt-cached)
  ├── diff.ts                                — classify findings as NEW / CONFIRMED / CHANGED
  ├── persist.ts                             — write to inbox, dedupe vs rejections
  └── run.ts                                 — orchestrator + CLI entry
scripts/run-broadcast-discovery.ts           — GH Actions wrapper, reads env knobs

prisma/seed-broadcast-channels.ts            — channel registry seed
prisma/seed-promotion-defaults.ts            — defaults seed (94 rows)
prisma/seed-ufc328-sections.ts               — UFC 328 per-section demo data
prisma/audit-broadcast-coverage.ts           — coverage matrix (which promos × regions have a default)
prisma/inspect-discoveries.ts                — show inbox contents from CLI
prisma/review-first-discoveries.ts           — one-shot reviewer for the first run (kept as reference)
```

Public endpoints (live):
- `GET /api/events/:id/broadcasts?region=XX` — returns `{eventId, region, detectedFrom, availableRegions, broadcasts[]}`
- `PATCH /api/users/me/broadcast-region` — set/clear user override
- `POST /api/events/:id/broadcasts/report` — user flag

Admin endpoints (require admin JWT):
```
GET    /api/admin/broadcast-channels
POST   /api/admin/broadcast-channels
PATCH  /api/admin/broadcast-channels/:id

GET    /api/admin/broadcasts?eventId=...
POST   /api/admin/broadcasts
PATCH  /api/admin/broadcasts/:id
DELETE /api/admin/broadcasts/:id?hard=1   (else soft-delete)

GET    /api/admin/broadcast-defaults?promotion=...
POST   /api/admin/broadcast-defaults
PATCH  /api/admin/broadcast-defaults/:id
DELETE /api/admin/broadcast-defaults/:id

GET    /api/admin/broadcast-reports?status=OPEN
PATCH  /api/admin/broadcast-reports/:id

GET    /api/admin/broadcast-discoveries?status=PENDING
PATCH  /api/admin/broadcast-discoveries/:id   body: {action: APPLY|REJECT|DUPLICATE, channelSlug?, tier?, reviewNote?}
POST   /api/admin/broadcast-discoveries/run   body: {promotions?, regions?, skipFreshDays?, maxQueries?}
```

### Mobile (`packages/mobile/`)

```
components/HowToWatch.tsx                    — single-line card, region pill, optional title-absorption
components/RegionPickerSheet.tsx             — bottom-sheet picker w/ auto-detect option
store/BroadcastRegionContext.tsx             — global region override (AsyncStorage + backend sync)
services/api.ts                              — added: getEventBroadcasts, setBroadcastRegion, reportBroadcast + types
store/AuthContext.tsx                        — added broadcastRegion to User type
app/_layout.tsx                              — wraps app in BroadcastRegionProvider
app/edit-profile.tsx                         — adds "Watch Region" row
app/(tabs)/events/index.tsx                  — wires HowToWatch into Upcoming Events tab (with section title fallback)
app/(tabs)/live-events.tsx                   — wires HowToWatch into Live Events tab (top + per-section)
```

Component contract (passed through React Query, cached per `(eventId, region)`):

```ts
type Props = {
  eventId: string;
  section?: 'EARLY_PRELIMS' | 'PRELIMS' | 'MAIN_CARD';  // omit for whole-event
  label?: string;     // e.g. "MAIN CARD" — replaces "On:" inline
  time?: string;      // e.g. "9:00 PM ET" — rendered after label
  collapsedByDefault?: boolean;
};
```

Layout rules:
- 1 broadcast → single inline row
- 2 broadcasts → both shown
- 3+ broadcasts → top 2 visible, rest behind "+ N more"
- 0 broadcasts → component returns null; parent renders the original section header so titles are always visible

### Admin UI (`packages/backend/public/admin.html`)

New "Broadcasts" tab with three sections:
- **Discovery Inbox** — list + filter by status, apply/reject/duplicate buttons, ad-hoc "Run Discovery" trigger, pending-count badge on the tab
- **Promotion Defaults** — table with promotion filter, edit modal, delete
- **Broadcast Channels** — list, edit modal, add new

URL: `https://fightcrewapp-backend.onrender.com/admin.html`. Login with any `ADMIN_EMAILS` user.

### Workflow (`.github/workflows/broadcast-discovery.yml`)

- Schedule: Mondays 09:00 UTC
- Manual dispatch supported with inputs: `promotions`, `regions`, `skip_fresh_days`
- Required secrets: `BRAVE_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL` (already set)

---

## How the discovery job works (data flow)

1. **Active promotions** — query `Event.groupBy({promotion})` filtered by `date >= now`. Skip defunct promos.
2. **Per region**, skip if existing default's `lastDiscoveryAt < N days` (default 14).
3. **Search**: 2 Brave queries per (promo × region) — `"{promo} broadcaster {region-name} 2026"` and `"where to watch {promo} {region} 2026"`. Top 5 results each, dedupe on URL.
4. **Fetch**: pull the official "how to watch" page if we have one (UFC.com, ONEFC.com, BKFC.com, Paramount+ for UFC, KarateCombat). Strip to ≤8KB main text via cheerio.
5. **Extract**: send snippets + page text + current defaults to Claude Haiku 4.5 with prompt caching. System prompt enforces strict JSON, regional precision, confidence rules, no-invent rule.
6. **Classify**: each finding becomes NEW / CONFIRMED / CHANGED based on existing defaults; channel-name → slug via case-insensitive + substring match.
7. **Persist**: writes inbox row (status=PENDING) for NEW/CHANGED. CONFIRMED bumps `lastDiscoveryAt` only — no inbox spam. Suppresses anything matching a REJECTED entry from the last 90 days.

### Cost

~$1/run (~50 Brave queries × $0.005 + ~50 Haiku calls × ~$0.001 with caching).
Brave free tier covers it ($5/mo credit ≈ 1000 requests). Annual bottom-line: $0–$50.

### Confidence floor

Findings <0.4 confidence are dropped at the LLM step. 0.7+ is "reputable outlet". 0.9+ is "official press release / broadcaster site".

---

## Operations playbook

### Daily (none)
Job runs itself.

### Weekly (Mondays after 09:00 UTC)
1. Open admin → Broadcasts → Discovery Inbox
2. Review pending items (badge count tells you how many)
3. For each: Apply / Reject (with note) / Mark Duplicate
4. Watch the cost — Brave dashboard at https://api.search.brave.com/app/dashboard

### Ad-hoc (gap-filling)
- Admin → Broadcasts → "▶ Run Discovery" button (uses default scope = all active promos × all regions)
- Or via GitHub Actions UI → workflow_dispatch with narrow scope (e.g. `promotions=ONE,Zuffa Boxing`, `regions=NZ,EU`, `skip_fresh_days=0` to force re-check)
- Or CLI: `cd packages/backend && DISCOVERY_PROMOTIONS=UFC DISCOVERY_REGIONS=GB npx ts-node scripts/run-broadcast-discovery.ts` (against Render external DB; needs both API keys in env)

### Adding a new promotion
1. Promotion appears via existing Event scrapers — no work needed for that side.
2. Optionally seed defaults: edit `prisma/seed-promotion-defaults.ts`, re-run.
3. Optionally add an official "how to watch" URL: edit `HOW_TO_WATCH_URLS` in `services/broadcastDiscovery/fetchHowToWatch.ts`. Only worth it if the page is reliably structured.

### Adding a new channel
Admin → Broadcasts → Channels → "+ New Channel". Slug must be lowercase-with-dashes and immutable (defaults reference it).

### Per-event override (e.g. UFC 328 prelims free on CBS)
No UI yet. Two options:
- Use the API directly: `POST /api/admin/broadcasts` with `{eventId, channelId, region, tier, cardSection?, eventDeepLink?, note?}`
- Or follow the pattern in `prisma/seed-ufc328-sections.ts` — adapt to the new event

### Reviewing a discovery in CLI (no UI access)
```bash
cd packages/backend
npx ts-node prisma/inspect-discoveries.ts
```

### Forcing a re-check of a "fresh" entry
The default skips entries with `lastDiscoveryAt < 14 days`. Override with `skip_fresh_days=0` on workflow dispatch (or env var).

---

## Coverage matrix (as of 2026-05-03)

```
Promotion              Events US   CA   GB   AU   NZ   EU
──────────────────────────────────────────────────────────
ONE                      18    ✓    ✓    ✓    ✓    ✓    ✓
BKFC                     13    ✓    ✓    ✓    ✓    ✓    ✓
UFC                       8    ✓    ✓    ✓    ✓    ✓    ✓
Matchroom Boxing          7    ✓    ✓    ✓    ✓    ✓    ✓
OKTAGON                   6    ✓    ✓    ✓    ✓    ✓    ✓
PFL                       5    ✓    ✓    ✓    ✓    ✓    ✓
TOP_RANK                  5    ✓    ✓    ✓    ✓    ✓    ✓
Zuffa Boxing              3    ✓    ✓    ✓    ✓    —    ✓
MVP                       3    —    —    —    —    —    —    (per-card by design)
RAF                       3    ✓    —    —    —    —    —    (Fox Nation US-only)
RIZIN                     2    ✓    ✓    ✓    ✓    ✓    ✓
Gold Star                 1    ✓    ✓    ✓    ✓    ✓    ✓
```

Run `npx ts-node packages/backend/prisma/audit-broadcast-coverage.ts` to refresh.

Intentional gaps:
- **MVP** — every card is bespoke (Netflix vs Paul-Tyson, DAZN vs others). Per-event entry only.
- **RAF** — Fox Nation US deal only. International unconfirmed; promotion plans first international event late 2026 but no broadcaster announced.
- **Zuffa Boxing NZ** — Paramount+ deal covers US/CA/AU/LatAm; Sky covers UK; no public NZ deal.

---

## Mobile UI behavior reference

| Scenario | What renders |
|---|---|
| Event has a single whole-event broadcaster | Top card with `On: ChannelName [Tier] ›`. Section headers (MAIN CARD time, etc.) render normally. |
| Event has per-section broadcasters | No top card. Each section's HowToWatch absorbs the title: `MAIN CARD 9PM ET ChannelName [Tier] ›`. |
| Event has both whole-event AND a section override | Top card shows whole-event broadcaster. Section with override gets its own absorbed-title card. Sections without overrides get the standard section header. |
| Event has 0 broadcasters for the user's region | No card. Standard section headers still visible. |
| User changes region in any card | All HowToWatch instances on the screen re-fetch + update (shared React Query key + global context). |

Region detection priority (server-side):
1. `?region=US` query param (debug override)
2. Authenticated user's `broadcastRegion`
3. `cf-ipcountry` header (Cloudflare/Vercel/Render-passed)
4. Fallback: `US`

---

## Open items

### Untriaged (low-priority polish)
- **Per-event broadcasts editor in the admin UI** — currently only via API. Add a section on the per-event admin page with a table of EventBroadcast rows + add/edit/delete + "apply promotion defaults" button.
- **Broadcast reports inbox in admin UI** — endpoints exist (`/api/admin/broadcast-reports`) but no UI yet. Pattern would mirror Discovery Inbox.
- **Live Events tab title-absorption parity** — Upcoming tab absorbs section titles into HowToWatch when per-section data exists. Live tab still shows section header titles unconditionally; the absorption pattern hasn't been ported.
- **Logo URLs on channels** — most are null. R2 upload + display in HowToWatch component.
- **Affiliate URLs** — schema field exists but unused. When ready: add a `BroadcastClick` table for attribution + an FTC disclosure line in the UI.

### Designed but not yet built
- **Testing process** — user requested 2026-05-03 but deferred until design choice. Three options:
  1. End-to-end smoke (one script, hits real APIs, asserts inbox + apply + read endpoint flow)
  2. Unit + golden (mock Brave/Anthropic, snapshot extract/diff/persist)
  3. Both
  
  Recommendation: build (1) first as a CLI script that runs against Render dev or against a local backend with mocked external APIs. Add (2) only if discovery logic gets non-trivial.

### Stale-entry strategy (not yet implemented)
The discovery job bumps `lastDiscoveryAt` on CONFIRMED rows. Idea: surface defaults that haven't been re-verified in N days as a separate admin queue, run a focused discovery on those promotion×regions when triggered. Can reuse the `skipFreshDays=0` knob to force re-checks.

### Scraper extension to per-event broadcasts
The original how-to-watch design doc proposes that `scrapeAllUFCData.js` (and similar) should also extract the broadcaster table per event during the scrape. Not done. Would replace the manual UFC 328 per-section seed with automatic population. Lower priority because the discovery job covers promotion-level defaults, and per-event overrides are rare.

---

## Secrets + env vars

GitHub Actions secrets (set):
- `BRAVE_API_KEY` — `BSAS...` (Free plan, $5/mo credit, $0 cap)
- `ANTHROPIC_API_KEY` — `sk-ant-api03-...` (your project-level key)
- `DATABASE_URL` — Render external (was already set)

Render env vars (NOT set yet):
- For the manual `POST /api/admin/broadcast-discoveries/run` button on admin.html to actually run, the BACKEND needs `BRAVE_API_KEY` and `ANTHROPIC_API_KEY` too. Currently only the GitHub Actions cron has them. If you want the admin "Run Discovery" button to work, add those to Render env. Otherwise use GH Actions UI to trigger.

---

## Branch + deploy state

- Work merged to `main` directly (the feature branch `claude/how-to-watch-feature-oXZ8j` is now obsolete; safe to delete on the remote).
- Three commits on main carry this work:
  - `5a5a312` — backend + mobile + service + workflow
  - `93a30db` — admin UI
  - (plus the in-between `2b6dd94` and `96a3712` from a parallel UFC-historic session — unrelated)
- Render auto-deployed both. Live as of 2026-05-03 ~21:00 UTC.

---

## How to resume

When you come back:

1. **Read this doc + `services/broadcastDiscovery/README.md`** — together they cover everything.
2. **Check the inbox** (admin → Broadcasts → Discovery Inbox). The cron will have fired the next Monday after this handoff. There may be pending items.
3. **Pick an open item** from the list above. Most natural next steps:
   - Build the testing process (was the question on deck)
   - Add Render env vars so the admin "Run Discovery" button works
   - Build the per-event broadcasts editor in the admin UI
   - Port title-absorption to the Live Events tab
4. **If discovery is misbehaving**: check GitHub Actions run logs for the latest `Broadcast Discovery` run. Look for `[discovery]` log lines in the "Run discovery" step. Common issues:
   - Brave 429 (rate limit) → reduce queries or wait for monthly reset
   - Anthropic 401 → key rotated; update `ANTHROPIC_API_KEY` secret
   - LLM JSON parse failure → noted in logs, individual finding silently dropped, run continues

---

## File-by-file change log (commit `5a5a312` + `93a30db`)

```
.github/workflows/broadcast-discovery.yml                   NEW
docs/plans/how-to-watch-broadcaster-research-2026-05-03.md  NEW (research notes)
packages/backend/package.json                               +@anthropic-ai/sdk
packages/backend/prisma/audit-broadcast-coverage.ts         NEW
packages/backend/prisma/inspect-discoveries.ts              NEW
packages/backend/prisma/migrations/20260503180000_how_to_watch/   NEW
packages/backend/prisma/migrations/20260503210000_broadcast_card_section/   NEW
packages/backend/prisma/migrations/20260503230000_broadcast_discovery/   NEW
packages/backend/prisma/review-first-discoveries.ts         NEW (one-shot, kept as ref)
packages/backend/prisma/schema.prisma                       +5 models, +1 col, +1 enum
packages/backend/prisma/seed-broadcast-channels.ts          NEW
packages/backend/prisma/seed-promotion-defaults.ts          NEW
packages/backend/prisma/seed-ufc328-sections.ts             NEW
packages/backend/public/admin.html                          +Broadcasts tab + 3 modals + ~480 LOC JS
packages/backend/scripts/run-broadcast-discovery.ts         NEW (GH Actions wrapper)
packages/backend/src/routes/adminBroadcasts.ts              NEW
packages/backend/src/routes/broadcasts.ts                   NEW
packages/backend/src/routes/auth.fastify.ts                 +broadcastRegion in profile
packages/backend/src/routes/index.ts                        +register both new route files
packages/backend/src/services/broadcastDiscovery/           NEW (6 files + README)
packages/backend/src/services/region.ts                     NEW
packages/mobile/app/(tabs)/events/index.tsx                 +HowToWatch wiring + section-fallback
packages/mobile/app/(tabs)/live-events.tsx                  +HowToWatch wiring
packages/mobile/app/_layout.tsx                             +BroadcastRegionProvider
packages/mobile/app/edit-profile.tsx                        +Watch Region row
packages/mobile/components/HowToWatch.tsx                   NEW
packages/mobile/components/RegionPickerSheet.tsx            NEW
packages/mobile/components/index.ts                         +exports
packages/mobile/services/api.ts                             +3 methods + types
packages/mobile/store/AuthContext.tsx                       +broadcastRegion field
packages/mobile/store/BroadcastRegionContext.tsx            NEW
pnpm-lock.yaml                                              +anthropic SDK
```
