# HANDOFF — Home-screen reorder shipped to `main`, OTA HELD for store review (2026-06-29)

## TL;DR
The mobile Home screen was reorganized and committed to `main` (`d4095d05`), but the **production OTA was deliberately NOT published**. There are new builds in review at both the Google Play Store and Apple App Store, and we don't want to OTA the current runtimes while those are pending. **Publish the OTA only after the in-review store builds are reviewed and accepted.**

## What shipped in the commit (`d4095d05`)
Files: `packages/mobile/app/(tabs)/home.tsx`, `packages/mobile/services/api.ts`, `packages/mobile/assets/spotlights/{puncher,fan-cheering-tv}.png`, `packages/backend/src/routes/community.ts`.

New Home section order:
1. Event Last Night
2. This Week (events by day)
3. Top Upcoming Fights
4. Recent Good Fights
5. **Comments on recent fights** (moved up, just below Recent Good Fights)
6. **Read About** (renamed from "The Latest")
7. **Most Followed** (moved above Recently Booked)
8. **Recently Booked**
9. **Highlighted Fighters** (moved below Recently Booked; was one big 240px card, now a side-scroll rail of a few smaller 168px portrait cards)
10. **Classics to Watch** (the classic throwback comment is now embedded *within* this section; standalone "Classic Throwback" section removed)
11. Did You Know? — `puncher.png` art on "Know What's Worth Watching", `fan-cheering-tv.png` on "Follow Your Favorites"

Backend: `/community/highlighted-fighter` now also returns a lightweight `fighters` array (a slice of the pool it already builds — no extra queries). `data` is unchanged, so the web single-fighter card is unaffected. This is additive and **safe to let auto-deploy on Render** — current store builds ignore the extra field. Mobile falls back to the single chosen fighter when `fighters` is absent (pre-deploy clients).

## How to publish the OTA later (after store builds are LIVE)
1. The new store builds ship with **new runtime versions** (new iOS `app.json` version; likely a new Android versionCode/runtime). The *current* production OTA targets only Android `1.0.0` / iOS `2.1.2`.
2. Confirm the live runtimes empirically first:
   `cd packages/mobile && npx eas-cli update:list --branch production --limit 3`
3. Then publish (auto-targets both runtimes):
   `npx eas-cli update --branch production --message "Home: reorder feed, Highlighted Fighters rail, Read About, spotlight art"`

Do NOT publish before the store builds clear review.

See memory `followup_pending_home_reorder_ota`.
