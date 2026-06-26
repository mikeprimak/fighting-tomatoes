# HANDOFF — How-to-Watch Affiliate Monetization (2026-06-26)

**Status: ✅ SHIPPED + LIVE (2026-06-26 evening).** All code committed/pushed/deployed; backend `/api/r/b` confirmed live; FTC/ASA disclosure shipped (web + mobile OTA); affiliate research corrected (UFC→Paramount+; ESPN+ program is real); Impact site verification live on goodfights.app. **Open item is non-engineering:** affiliate-program applications are being DECLINED at current traffic scale (Impact Marketplace + Paramount+ both denied) — gated on traffic, revisit with click data as the app grows. Full details + commit list + path-forward in `docs/daily/2026-06-26.md` (the "Evening follow-on session" section is the source of truth now). The rest of this doc is the original pre-ship build record.

---

## What this is
Monetize the broadcaster links in the How-to-Watch cards (every org, every region, web + mobile). The system already had a `BroadcastChannel.affiliateUrl` field and link precedence that preferred it — this session built the tracked-redirect + click telemetry + operator tooling around it so links earn and clicks are measured.

## What was built

1. **`BroadcastClick` model** (`broadcast_clicks` table) — one row per outbound tap: channel, event, region, cardSection, tier, placement (web/mobile), `targetUrl`, `isAffiliate` (monetized vs homepage fallback), `ipHash`, UA, referer.
   - Migration `20260626000000_add_broadcast_clicks`. **Already applied to prod via `migrate deploy`** (additive empty table, inert until code deploys — safe).

2. **Tracked redirect endpoint** `GET /api/r/b?c=<channelId>&e=&r=&s=&t=&p=&b=` (`routes/broadcasts.ts`). Resolves the real target server-side (eventDeepLink → affiliateUrl → homepageUrl), logs a `BroadcastClick`, 302s out. **No open-redirect** (destination never in the URL; re-resolved from channelId → editing an affiliate URL is instant for all clients). Logging never blocks the redirect.

3. **deepLink rewrite** — `broadcasts.ts` now returns every `deepLink` as a tracked `/api/r/b` URL. **Web + mobile render code unchanged** — they already open `entry.deepLink`.

4. **Platform tagging** — `x-client-platform: web|mobile` header added to both api clients' central request fn; added to CORS `allowedHeaders`; read in the broadcasts route and baked into the link as `p`. Segments click revenue by platform.

5. **Admin panel** (`public/admin.html`, Broadcasts tab):
   - **Affiliate URL** field in the channel editor (the lever). Channel list shows a 💰 Affiliate column + "X of Y monetized" summary.
   - **"How-to-Watch Click Revenue"** panel — total / monetized / homepage-lost, by region, by platform, per-channel table with "Add link" shortcuts. Backed by `GET /admin/broadcast-clicks/stats?days=`.
   - **Always-open reference card** at the top of the tab: how it works, the lever, signup order, programs-by-region, the reality-check caveat, compliance note.

6. **Docs** — `docs/marketing/affiliate-programs-by-region.md` (full program research).

## Affiliate landscape (researched 2026-06-26)
- **Join in order:** Impact.com (Fubo, Kayo AU, US streamers) → Awin (Sky UK + EU) → DAZN direct → Fubo (~$30/sub) → Amazon Associates (Prime Video).
- **Reality check:** ESPN+ (UFC US PPV), TNT Sports (UFC UK), UFC Fight Pass have **no open affiliate program**. Monetizable surface = aggregators (Fubo/Sling/Kayo/Sky) + DAZN. Supplemental revenue at current scale.

## Verification done
- Backend `tsc --project tsconfig.production.json --noEmit` → clean. Web `tsc --noEmit` → clean. Prisma client regenerated.

## How to test
- **Admin / web is the fast path** (pure web, no native build): `cd packages/web && pnpm dev` → open an event → tap a How-to-Watch link → confirm it routes through `/api/r/b`. Admin: `http://<backend>/admin.html` → Broadcasts tab → set an Affiliate URL on a channel, then watch the Click Revenue panel populate.
- **Redirect endpoint smoke test:** `GET /api/r/b?c=<channelId>&r=US` should log a click and 302 to the channel's affiliate (or homepage) URL.
- For a tracked link to resolve back to a *local* backend during testing, that backend must run with `BACKEND_URL=http://<host>:3008` (the link base defaults to the prod onrender URL, which won't have `/api/r/b` until deploy).

## To ship (after Mike approves)
1. Commit + push (backend Render redeploy makes `/api/r/b` + admin live; web Vercel deploy for the header; mobile OTA for the header — non-critical).
2. **Add FTC/ASA affiliate disclosure** ("we may earn a commission") near How-to-Watch on web + mobile — currently missing.
3. Apply to the programs above; paste affiliate URLs into channels in the admin as approved.

## Optional follow-ups
- PostHog server-side capture in the redirect for funnels (currently DB-only).
- A `revenue` field on `BroadcastClick` once networks report per-click/conversion value, for true $ attribution.

See `docs/daily/2026-06-26.md` for the full session log and memory `project_broadcast_affiliate_monetization`.
