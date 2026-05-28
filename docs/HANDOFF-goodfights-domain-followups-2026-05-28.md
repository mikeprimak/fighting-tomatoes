# HANDOFF: goodfights.app migration — follow-ups (2026-05-28)

The domain cutover is **done and live** — `goodfights.app` + `www` serve
`packages/web` on the `web` Vercel project, auto-tracking production deploys.
Full record: `docs/migrations/goodfights-domain-migration-2026-05-28.md` and
`docs/daily/2026-05-28.md`.

These are the **leftover follow-ups** — none are blocking, none are urgent. Check
each off when you get to it.

---

## 1. Update CLAUDE.md (it's now stale) — quick
- [ ] CLAUDE.md still says `packages/landing (static at goodfights.app)` and lists
      web at `web-jet-gamma-12.vercel.app`. Both are outdated.
- Change to: web app (`packages/web`) **is** `goodfights.app`; landing retired.
- **Was deferred because** CLAUDE.md had uncommitted WIP from a concurrent session
  on 2026-05-28 — don't sweep that in. Edit only once it's clean.

## 2. www → apex redirect (SEO tidiness) — optional
- [ ] `www.goodfights.app` currently serves the app directly (200) instead of
      308-redirecting to the apex.
- Not harmful: canonical tags + sitemap are all apex (`SITE_URL=goodfights.app`),
  so Google won't penalize duplicate content. Purely a tidiness item.
- Fix: Vercel dashboard → project `web` → Domains → `www.goodfights.app` →
  "Redirect to `goodfights.app`". (CLI `vercel domains add` can't set redirects.)

## 3. Delete the orphaned landing project — after a few days
- [ ] The apex used to live on the **misnamed `fighting-tomatoes-backend` Vercel
      project** (a static landing deploy — NOT the Render Fastify API). It's now
      orphaned of the apex but still reachable at
      `fighting-tomatoes-backend.vercel.app`.
- Keep it as a **rollback net** for ~a few days. Once the cutover is confirmed
  stable, delete the project in the Vercel dashboard.
- Rollback (if ever needed before deletion): see the migration doc's "Rollback
  procedure" — `vercel domains rm goodfights.app -y` then re-add to that project,
  or `vercel alias set <its-prod-deployment> goodfights.app`.

## 4. iOS Universal Links — TEAM_ID placeholder (pre-existing) — when convenient
- [ ] `apple-app-site-association` ships a literal `TEAM_ID` placeholder (there's
      no real Apple Team ID committed anywhere). iOS Universal Links almost
      certainly **never worked** on goodfights.app — this isn't a regression.
- Fix: get the real 10-char Apple Team ID, substitute it in both `appID` and
  `webcredentials` in `packages/web/public/.well-known/apple-app-site-association`,
  deploy, validate with Apple's AASA CDN validator.

## 5. Android App Links scope — decision, not a bug — when convenient
- [ ] `assetlinks.json` uses `common.handle_all_urls`. Now that goodfights.app is
      a full website, tapping *any* goodfights.app link on an Android device with
      the app installed may open the app instead of the browser.
- Decide: keep all-URL handling, or scope it (iOS AASA is already scoped to
  `/verify-email*` + `/reset-password*`). Scoping needs an app config change +
  store resubmit.

## 6. Human click-test the auth/email flows — recommended soon
- [ ] Everything below is **curl-verified** but not yet click-tested in a browser.
      Run the full **POST-CUTOVER TEST PLAN** in the migration doc — especially
      section B (register → verify-email link → reset-password link → login), since
      those email links are the highest-risk path.
