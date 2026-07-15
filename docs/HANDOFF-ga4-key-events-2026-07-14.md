# HANDOFF — Mark GA4 key events (manual, ~2 min, NOT DONE YET)

**Written:** 2026-07-14. **Status:** Mike will do this next session. Claude
cannot do it — the `ga-reader` service account is Viewer-only on GA4.

## Context

Flywheel conversion events shipped to production 2026-07-14 (commit
`045f2107`): `rating_submitted` and `hype_submitted` fire from
`packages/web/src/lib/api.ts`, `app_download_click` from the delegated
listener in `DownloadClickTracker.tsx` (placement = the link's `utm_medium`).
All three go to PostHog **and** GA4. The code side is complete and live;
GA4 just doesn't know these are conversions yet.

## The steps (do in GA4 UI)

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

## Verify (a day or two later)

- GA4 **Reports → Engagement → Events**: the three names appear with counts.
- To force one immediately: open goodfights.app on a phone, tap **Get the
  App** in the navbar → fires `app_download_click`.
- Claude can verify from the repo: `node packages/backend/scripts/ga.js
  --report events` should list the event names once they've fired.

## Optional, no rush

PostHog needs no setup (custom events show automatically). If desired later:
define the three as Actions / pin an insight in PostHog project 424323.
Also still open from June (`followup_web_analytics_next_steps`): GA4 ↔
Search Console link, import conversions into Google Ads.
