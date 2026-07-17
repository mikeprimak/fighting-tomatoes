# HANDOFF — GA4 key events + MP API secret (manual, ~3 min, NOT DONE YET)

**Written:** 2026-07-14. **Updated 2026-07-17** after finding and fixing the
reason zero events had arrived (see below). Claude cannot do the GA4 UI
steps — the `ga-reader` service account is Viewer-only.

## Context

Flywheel conversion events shipped 2026-07-14 (commit `045f2107`):
`rating_submitted` and `hype_submitted` fire from
`packages/web/src/lib/api.ts`, `app_download_click` from the delegated
listener in `DownloadClickTracker.tsx`. All three go to PostHog **and** GA4.

**2026-07-17 discovery:** zero events had reached GA4 in 3 days. Verified
with headless Chrome against prod: gtag.js batches events for ~5 seconds and
**silently drops the unsent queue when the page navigates away** — and every
`app_download_click` is immediately followed by a navigation. Not a config
error; structural gtag behavior (`transport_type: 'beacon'` is ignored,
`event_callback` fires before the hit is actually sent).

**Fix shipped 2026-07-17:** download-click events now go out via
`navigator.sendBeacon` (survives unload) — PostHog directly, GA4 through a
new backend relay `POST /api/track/ga`
(`packages/backend/src/routes/track.ts`) that forwards to the GA4
Measurement Protocol. `trackEventBeacon` in
`packages/web/src/lib/analytics.ts` is the client half.
**The relay silently no-ops until `GA4_MP_API_SECRET` is set on Render** —
that's manual step 2 below.

## Manual steps (GA4 UI, one trip)

### 1. Mark the three key events (~2 min)

1. [analytics.google.com](https://analytics.google.com) → **Good Fights**
   property (top left).
2. **Admin** (gear, bottom of left sidebar).
3. Under **Data display** → **Key events**.
4. **New key event** (blue button, top right) → type the name exactly →
   Save. Three times:
   - `rating_submitted`
   - `hype_submitted`
   - `app_download_click`

All lowercase, underscores. Use "New key event" (not the Events-list
toggle) — it works before GA4 has processed a first firing, so no waiting.

### 2. Create a Measurement Protocol API secret (~1 min)

1. Still in **Admin** → **Data collection and modification** →
   **Data streams** → click the goodfights.app web stream.
2. Scroll to **Measurement Protocol API secrets** → **Create** →
   nickname `backend-relay` → Create.
3. Copy the **Secret value** and paste it to Claude (or set it yourself in
   Render → fightcrewapp-backend → Environment as `GA4_MP_API_SECRET`).
   Render redeploys automatically on env change.

## Verify

- Immediately after the secret is live, Claude can drive a headless click on
  a Get-the-App link and confirm the event in GA4 Realtime (service account
  can call `runRealtimeReport`).
- A day later: `node packages/backend/scripts/ga.js --report events` should
  list `app_download_click`.
- GA4 **Reports → Engagement → Events** shows the names with counts.

## Notes

- `rating_submitted` / `hype_submitted` still use plain gtag — their flows
  don't navigate, so batching is safe there. Zero counts so far are
  plausibly real (web ratings require login).
- PostHog showed nothing in the headless tests, but posthog-js drops events
  from automated browsers (`navigator.webdriver`), so that proves nothing
  about real users. Worth a 30-second glance at PostHog Activity (project
  424323) for `app_download_click` once real clicks exist.
- Still open from June (`followup_web_analytics_next_steps`): GA4 ↔ Search
  Console link, import conversions into Google Ads (needs step 1 done
  first), web `identify()` on login.
