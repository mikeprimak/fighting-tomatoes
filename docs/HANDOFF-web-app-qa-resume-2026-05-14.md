# Handoff — Resume Web App QA + Build

**Date paused:** 2026-05-14
**Branch:** `main`
**Last commit:** `9663349` (web: fix UpcomingFightCard field names to match list API)
**Tracker:** `docs/web-app-build.md` (living)
**Live:** https://web-jet-gamma-12.vercel.app

---

## Where we are

Resumed work on `packages/web` (Next.js web app) after a multi-week pause. Today was the kickoff of an **assessment + completion sprint** — verifying feature parity with mobile, fixing look/feel, and laying out the SEO content engine plan. Web freeze memory has been lifted.

QA was in progress when paused. Upcoming-events visual layout pass is complete; the rest of the QA checklist (auth, interactions, other tabs, responsive, performance) is still open.

---

## What shipped today

### Decisions locked
- **No web push / browser notifications.** Combat fans on desktop are passive; build burden > payoff. Coverage gap closed by prominent "LIVE NOW / tonight" surfaces.
- **Custom domain + landing replacement** is the #1 unblocker post-QA. SEO can't really begin until `goodfights.app` points at the web project.
- **Production-URL QA** is the path, not local dev — drives the same backend users hit.

### Code (5 commits)
1. `79c24ee` — Narrow main column (`max-w-7xl` → `max-w-4xl`); EventCard fights as single-column divided list (no more 1/2/3 col responsive grid); UpcomingFightCard rebuilt to mobile layout (hype square left | fighters facing inward | user-hype flame right).
2. `0c12e26` — Bigger event banner text (event name `text-3xl`, date `text-base`, time-badge `text-base` uppercase); hype square shows `(N) 💬M` like mobile; OrgFilterTabs flex-wrap instead of horizontal scroll; default page size 2 → 5 on home + past.
3. `9663349` — **Bug fix**: web was reading `totalHypePredictions` / `totalPreFightComments` / `userHypeScore`. API actually returns `hypeCount` / `commentCount` / `userHypePrediction`. All three were `undefined` → the counts and the user-hype flame number never rendered. Manual `vercel --prod` deploy needed because the auto-deploy queue lagged.

### Tracker / planning doc
- `docs/web-app-build.md` created as living tracker. Has: decisions, feature parity table, SEO audit, full QA checklist, backlog, "How to Watch" SEO content engine plan.
- "How to Watch" SEO plan: **~194 auto-generated pages** from existing `/api/broadcasts` data:
  - **Leaf (~168):** `/how-to-watch/[promotion]/[country]` — e.g., "How to Watch PFL in Spain"
  - **Promotion hubs (~14):** `/how-to-watch/[promotion]`
  - **Country hubs (~12):** `/how-to-watch/from/[country]`
  - Guardrail: skip generating pages for (promo, country) pairs with no data — thin content tanks SEO.

### Memory updated
- Removed `project_web_app_defunct.md` (freeze lifted)
- `MEMORY.md` index updated

---

## Feature parity status (vs mobile)

From `docs/web-app-build.md`. Code inspection only — runtime QA still pending for most rows.

| Feature | Built? | Runtime QA'd? |
|---|---|---|
| Email/password login | ✓ | ✗ |
| Register | ✓ | ✗ |
| Forgot / reset password | ✓ | ✗ |
| Verify email | ✓ | ✗ |
| **Google Sign-In** | 🟡 plumbed but no button on `/login` | ✗ |
| Pre-fight hype rating | ✓ | ✗ |
| Pre-fight comments | ✓ | ✗ |
| Post-fight rating | ✓ | ✗ |
| Post-fight reviews + upvotes | ✓ | ✗ |
| **How to Watch widget** | ✗ Not on web | n/a |
| Web push | ✗ Decided out | n/a |
| Search, activity, followed fighters, spoiler-free | ✓ | ✗ |

---

## QA — what's done vs what's left

**Done:** Upcoming events page visual layout (column width, fight card structure, hype square counts, banner text, org filter wrap, default page size).

**Open** (see full checklist in `docs/web-app-build.md` → "QA Pass — Production"):

1. **Block 1 — Anonymous browse** (in progress on upcoming, untouched on live/past/top)
   - Live tab visual review (still has old single-column scroll, fight cards not yet restructured)
   - Past tab visual review (same)
   - Top fights tab visual review
   - Event detail page load + section grouping
   - Fighter detail page load + history sort
2. **Block 2 — Auth**: register / verify / login / logout / forgot-password / reset / continue-as-guest
3. **Block 3 — Fight detail interactions**: hype submit, pre-fight comment + upvote, post-fight rate + tags + review, review upvote, spoiler-free toggle
4. **Block 4 — Profile + activity**: stats, edit profile, avatar upload, activity filters, followed fighters
5. **Block 5 — Footer / legal**: privacy, delete-account, feedback
6. **Block 6 — Responsive**: 375 / 768 / 1200
7. **Block 7 — Lighthouse + view-source SEO sanity**

---

## Known issues / open threads

- **Auto-deploy lag.** Vercel queue was running ~20 minutes behind pushes at the end of the session. Latest deploy is now current (commit `9663349`) via manual `vercel --prod`. Future pushes should auto-deploy normally, but if it lags again, manually deploy from `packages/web`.
- **Field-name discipline.** The `hypeCount` / `commentCount` / `userHypePrediction` bug suggests the web has likely been written against guessed API field names without curling the actual response. Worth a one-shot grep of all `(fight as any).*` reads in `packages/web` and verifying against a real list-endpoint response.
- **Fight card structure is only fixed for UpcomingFightCard.** `LiveFightCard` and `CompletedFightCard` still have the old web design (fighters on the sides, info-stack in middle). Mirror the mobile pattern on both after the QA pass confirms upcoming is right.
- **Banner text sizing** was bumped large — user hadn't confirmed final feel before pausing. May need to dial back if it now feels too big.
- **Domain mismatch.** `metadataBase` and sitemap still hardcode `https://goodfights.app` but the site lives at `web-jet-gamma-12.vercel.app`. Until DNS moves, OG previews + sitemap URLs are broken. This is the #1 unblocker for SEO.

---

## Next session — recommended order

1. **Continue the QA walk** at https://web-jet-gamma-12.vercel.app. Anonymous browse first (Block 1). User drives, agent captures defects into `docs/web-app-build.md` checklist.
2. **Mirror UpcomingFightCard pattern to LiveFightCard + CompletedFightCard** so live and past tabs look right too.
3. **Auth + interactions QA** (Block 2 + 3).
4. **Then decide order of:** custom domain rollout, Google Sign-In wiring, How to Watch port from mobile, JSON-LD structured data. Domain first — it unblocks SEO measurement.

---

## How to access

- **Production (QA target):** https://web-jet-gamma-12.vercel.app
- **Local dev:** `cd packages/web && pnpm dev` → http://localhost:3000
- **Test accounts:** `test@goodfights.app` / `Testpass1!`, `testdev2@goodfights.app`
- **Vercel project:** `michael-primaks-projects/web` (auto-deploys from `main`)
- **Manual deploy:** `cd packages/web && vercel --prod`
