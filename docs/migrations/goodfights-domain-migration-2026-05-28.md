# Domain migration: web app → goodfights.app (2026-05-28)

Moving the Next.js web app (`packages/web`) from `https://web-jet-gamma-12.vercel.app`
to the apex domain `https://goodfights.app`, and retiring the static marketing
landing site (`packages/landing`) that previously lived there.

This doc is the troubleshooting reference. If anything breaks after cutover,
start here.

---

## TL;DR

- `goodfights.app` now serves **`packages/web`** (the Next.js app), not the static landing.
- The landing site's load-bearing routes were already duplicated in the web app
  (`/privacy`, `/reset-password`, `/verify-email`, `/delete-account`), so email
  links and store-listing links keep resolving.
- The two things the landing had that the web app didn't — the `/download`
  redirect and the `.well-known` deep-link files — were ported into the web app.
- All in-app "get the app" CTAs now point to a relative `/download` (was
  `https://goodfights.app`, which would have become self-referential).
- The old landing site is snapshotted at `archive/landing-snapshot-2026-05-28/`.

---

## Why the web app *has* to be on the apex

The mobile app declares `applinks:goodfights.app` (iOS, in
`packages/mobile/app.json`) and an Android App Links `assetlinks.json`. The
verification files for these (`apple-app-site-association`, `assetlinks.json`)
**must** be served from the apex `goodfights.app`. You cannot move them to a
subdomain without rebuilding/resubmitting the app. So whatever serves
`goodfights.app` must serve those files — which means the web app, now that it
owns the apex, is responsible for them.

---

## Architecture: before → after

| Path | Before (served by) | After (served by) |
|---|---|---|
| `goodfights.app/` (homepage) | landing `index.html` (marketing) | web app home (live fights/ratings/blog) |
| `/privacy` | landing `privacy.html` | web app `/privacy` page |
| `/reset-password` | landing `reset-password.html` | web app `/reset-password` page |
| `/verify-email` | landing `verify-email.html` | web app `/verify-email` page |
| `/delete-account` | landing `delete-account.html` | web app `/delete-account` page |
| `/download` | landing `vercel.json` UA-redirect + `download.html` | web app `/download` route (UA-redirect + chooser) |
| `/.well-known/assetlinks.json` | landing static file | web app `public/.well-known/` |
| `/.well-known/apple-app-site-association` | repo-root file (see "Known issues") | web app `public/.well-known/` + content-type header |
| blog, fights, events, fighters, etc. | (only on vercel.app) | web app (now on goodfights.app) |

Backend is **unchanged**: `FRONTEND_URL=https://goodfights.app` continues to build
email links to `/verify-email` and `/reset-password`, now answered by the web app.
CORS already whitelisted `goodfights.app` (`packages/backend/src/server.ts`,
`middleware/cors.ts`).

---

## Changes made (code) — commit on `main`

1. **`packages/web/public/.well-known/assetlinks.json`** (new) — copied verbatim
   from `packages/landing/.well-known/assetlinks.json`. Android App Links
   verification (package `com.fightcrewapp.mobile`).
2. **`packages/web/public/.well-known/apple-app-site-association`** (new) — copied
   from the repo-root `apple-app-site-association`. iOS Universal Links, scoped to
   `/verify-email*` and `/reset-password*` only. **Contains a `TEAM_ID`
   placeholder — see Known issues.**
3. **`packages/web/next.config.ts`** — added `async headers()` to force
   `Content-Type: application/json` on `/.well-known/apple-app-site-association`
   (no file extension → would otherwise be `application/octet-stream`).
4. **`packages/web/src/app/download/page.tsx`** (new) — server component. Reads
   `user-agent`: iPhone/iPad/iPod → App Store, Android → Play Store, everything
   else → styled "pick your phone" chooser. Ports `packages/landing/download.html`.
5. **CTA repoints** (`https://goodfights.app` → relative `/download` with UTM):
   - `packages/web/src/components/layout/AppDownloadBanner.tsx`
   - `packages/web/src/components/sidebar/FollowedFightersStrip.tsx`
   - `packages/web/src/app/followed-fighters/page.tsx` (×2 links)
   - **Note:** the profile page was inspected and has **no** get-the-app link
     today (despite the original ask mentioning it). Nothing to change there.
6. **`packages/web/src/lib/site.ts`** — default `SITE_URL` changed from the
   vercel.app origin to `https://goodfights.app` (aligns with `layout.tsx`
   `metadataBase`, the sitemap, and `robots.ts`, all already on goodfights.app).

Store URLs used everywhere:
- App Store: `https://apps.apple.com/us/app/good-fights/id6757172609`
- Play Store: `https://play.google.com/store/apps/details?id=com.fightcrewapp.mobile`

---

## Vercel cutover steps (the live switch)

> Done after the code above is pushed and the web project has deployed it.

1. Set env on the **web** project: `NEXT_PUBLIC_SITE_URL=https://goodfights.app`
   (belt-and-suspenders; the code default now matches).
2. Remove `goodfights.app` + `www.goodfights.app` from the **landing** project.
3. Add `goodfights.app` + `www.goodfights.app` to the **web** project.
4. DNS is already pointed at Vercel, so this is a project reassignment — no
   registrar/DNS change. Vercel re-issues the TLS cert for the apex on the web
   project (brief blip possible).
5. Redeploy web to production so the new env var takes effect.

(Exact commands / dashboard actions recorded in `docs/daily/2026-05-28.md`.)

---

## Rollback procedure

If the cutover goes wrong:

1. **Fast revert (domain):** In Vercel, remove `goodfights.app` + `www` from the
   **web** project and re-add them to the **landing** project. The landing site
   is untouched and still deployed, so this restores the prior state within a
   minute (plus cert re-issue).
2. **Code revert:** `git revert` the migration commit. The CTA links go back to
   `https://goodfights.app` and the `.well-known`/`/download` additions are
   removed. Harmless to leave in place even if the domain is rolled back.
3. The landing source is preserved in two places: the live `packages/landing`
   project and the snapshot at `archive/landing-snapshot-2026-05-28/`.

---

## Known issues / follow-ups (NOT blockers)

- **`apple-app-site-association` has a literal `TEAM_ID` placeholder.** The repo
  has no real Apple Team ID committed (`eas.json` only has `ascAppId`). This
  strongly implies iOS Universal Links were **never actually functioning** on
  goodfights.app. Porting the file as-is is a no-op regression-wise (it didn't
  work before either). **Follow-up:** get the real 10-char Apple Team ID and
  substitute it (both `appID` and `webcredentials`) to make iOS deep links +
  password autofill work. Verify with Apple's CDN validator afterward.
- **Android `assetlinks.json` uses `common.handle_all_urls`.** Now that
  goodfights.app is a full website, tapping *any* goodfights.app link on an
  Android device with the app installed may open the native app instead of the
  browser. iOS is already scoped (AASA lists only `/verify-email*`,
  `/reset-password*`). **Follow-up:** consider whether to keep all-URL handling
  on Android or scope it; requires an app config change + resubmit.
- **`packages/landing` retirement.** Keep the landing Vercel project alive on a
  throwaway URL for a few days as a rollback net, then delete the project once
  the cutover is verified stable.

---

## POST-CUTOVER TEST PLAN

Run all of these against `https://goodfights.app` after the domain switch.
Check each box as verified.

### A. Core web app loads
- [ ] `goodfights.app/` homepage renders (live/upcoming fights, ratings).
- [ ] Blog index `/blog` and an article `/blog/<slug>` render.
- [ ] An event page `/events/<id>` and a fight page `/fights/<id>` render.
- [ ] A fighter page `/fighters/<id>` renders.
- [ ] Search `/search` works.
- [ ] `www.goodfights.app` redirects/serves correctly (no cert warning).
- [ ] No mixed-content / CORS errors in console (API calls to Render succeed).

### B. Auth + account flows (these are the high-risk ones — email links)
- [ ] **Register** a new account → triggers verification email.
- [ ] Click the **verify-email** link in that email → lands on
      `goodfights.app/verify-email?token=…` → shows success (not 404, not the
      old static page).
- [ ] **Forgot password** → reset email arrives.
- [ ] Click the **reset-password** link → `goodfights.app/reset-password?token=…`
      → can set a new password → can log in with it.
- [ ] **Login** with existing test account (`avocadomike@hotmail.com`).
- [ ] Legacy **claim-account** email link (`/reset-password?token=…`) still works.
- [ ] **Log out** redirects to home.

### C. Store/legal links (app store + Play console point at these)
- [ ] `/privacy` renders the privacy policy.
- [ ] `/delete-account` renders.

### D. The /download route + CTAs (the core of this change)
- [ ] On **desktop**, `/download` shows the chooser with both store buttons;
      buttons open the correct App Store / Play Store listings.
- [ ] On an **iPhone**, visiting `/download` redirects straight to the App Store.
- [ ] On an **Android phone**, visiting `/download` redirects to Play Store.
- [ ] Top **app-download banner** link → `/download` (same tab), correct UTM.
- [ ] Sidebar **"Get the app"** (FollowedFightersStrip, shown when following and
      not an app user) → `/download`.
- [ ] **Followed Fighters page** both CTAs ("Get the mobile app" inline + the
      "Never miss a Good Fight" card button) → `/download`.
- [ ] Banner is hidden for accounts that already use the app (`useHasApp`).

### E. Deep-link verification files
- [ ] `curl https://goodfights.app/.well-known/assetlinks.json` → returns the
      Android JSON (200, `application/json`).
- [ ] `curl https://goodfights.app/.well-known/apple-app-site-association` →
      returns the AASA JSON with `Content-Type: application/json`.
- [ ] (After TEAM_ID fix) iOS Universal Link: tapping a `reset-password` email
      link on a device with the app installed opens the app, not Safari.
- [ ] Android: confirm the desired link-handling behavior (see Known issues).

### F. SEO / metadata
- [ ] `goodfights.app/sitemap.xml` lists goodfights.app URLs (not vercel.app).
- [ ] `goodfights.app/robots.txt` references `goodfights.app/sitemap.xml`.
- [ ] Open Graph / canonical tags on a few pages point at goodfights.app.
- [ ] Old `web-jet-gamma-12.vercel.app` still serves (or 308s) — confirm it
      doesn't create duplicate-content issues; consider a canonical/redirect.

### G. Regression sweep on the retired landing
- [ ] Nothing else (emails, ads, QR codes, store listings, social bios) links to
      a landing-only path that no longer exists. Known landing-only asset:
      `attribution.js` (referenced by old `download.html`) — confirm nothing
      depends on it post-migration.
