# Web App Build — Living Tracker

**Started:** 2026-04-02 (sprint), resumed 2026-05-14 (assessment + completion)
**Package:** `packages/web` (Next.js 16.2 + Tailwind v4, React 19.2)
**Live:** https://web-jet-gamma-12.vercel.app
**Vercel project:** `michael-primaks-projects/web` (auto-deploys from `main`)
**Target domain:** `goodfights.app` (not yet pointed)

---

## North Star

The web app's primary job is **discoverability via SEO**. Mobile owns engagement; web owns Google traffic. Every decision should be evaluated against: "does this help us rank or convert search visitors?"

---

## Decisions Locked

| # | Decision | Date | Reason |
|---|---|---|---|
| 1 | No web push / browser notifications | 2026-05-14 | User doesn't use PC notifications, suspects neither do users. Build burden > payoff. Use prominent "LIVE NOW / tonight" UI instead. |
| 2 | No crews, predictions, community, news on web | 2026-04-03 | Abandoned in mobile. |
| 3 | Dark-only theme | 2026-04-03 | Matches mobile, no light theme exists. |
| 4 | Custom domain plan: `goodfights.app` → web, retire `packages/landing` | 2026-05-14 | One web codebase; replaces the 404-prone static landing. |

---

## Feature Parity Inventory (vs. mobile)

Updated 2026-05-14 from code inspection, not yet from runtime QA.

| Feature | Built? | UI tested in prod? | Notes |
|---|---|---|---|
| Email/password login | ✅ | ❌ | `/login` wired to JWT + httpOnly refresh cookie |
| Register | ✅ | ❌ | `/register` |
| Forgot / reset password | ✅ | ❌ | `/forgot-password`, `/reset-password` |
| Verify email | ✅ | ❌ | `/verify-email` |
| **Google Sign-In** | 🟡 half | ❌ | `loginWithGoogle` plumbed in `lib/api.ts` + `lib/auth.tsx`; **no Google button on `/login` page, no GIS script** |
| Pre-fight hype rating (1-10) | ✅ | ❌ | `HypeFightModal.tsx` |
| Pre-fight comments | ✅ | ❌ | `CommentForm` + `createPreFightComment`, upvotes |
| Post-fight rating (1-10) | ✅ | ❌ | `RateFightModal.tsx` with tags + review text |
| Post-fight reviews + upvotes | ✅ | ❌ | `FightDetailClient` reviews list |
| **How to Watch** | ❌ | n/a | Not on web. Mobile component at `packages/mobile/components/HowToWatch.tsx`. Backend `/api/broadcasts` ready. |
| Web push notifications | ❌ Decided out | n/a | See Decision #1 |
| Search | ✅ | ❌ | `/search` |
| Activity hub | ✅ | ❌ | `/activity` |
| Followed fighters | ✅ | ❌ | `/followed-fighters` |
| Spoiler-free mode | ✅ | ❌ | Toggle on edit-profile |
| Footer + legal pages | ✅ | ❌ | Privacy, delete-account, feedback |

---

## SEO Audit (2026-05-14)

### Present
- `metadataBase: https://goodfights.app` + title template (`layout.tsx:18`)
- OG / Twitter card defaults
- Per-route `generateMetadata` for event / fight / fighter — pulls server-side title, desc, OG image
- Dynamic sitemap (50 events + 5 static pages)
- `robots.ts` disallows `/api/`, `/profile/edit`

### Missing / Broken
- ❌ **No JSON-LD structured data anywhere** — biggest single win available. Add `SportsEvent`, `Event`, `Person`, `Review`, `AggregateRating` schemas.
- ❌ **Fighters absent from sitemap** — only events listed.
- ❌ **No canonical URLs**, no `alternates`, no per-page Twitter image
- ❌ **Domain mismatch:** `metadataBase` and sitemap hardcode `goodfights.app`, site lives at `web-jet-gamma-12.vercel.app`. Until DNS moves, OG previews and sitemap URLs are broken. **SEO can't really start until the custom domain is live.**
- ❌ No og:image fallback (only banner-image; events without banner have no preview image)
- ❌ No hreflang, no multi-region — fine for v1, worth noting

---

## QA Pass — Production

**URL:** https://web-jet-gamma-12.vercel.app
**Test accounts:**
- `test@goodfights.app` / `Testpass1!`
- `testdev2@goodfights.app`

### Checklist (mark as we go)

**Auth**
- [ ] Register a new account
- [ ] Verify email (check inbox / link)
- [ ] Email/password login with test account
- [ ] Logout
- [ ] Forgot password → reset link → set new password
- [ ] "Continue as guest" works

**Browse**
- [ ] Home (`/`) — upcoming events list loads
- [ ] `/events/live` — auto-refreshing live events
- [ ] `/events/past` — past events, infinite scroll
- [ ] `/fights/top` — top fights, time-period filter
- [ ] `/search` — fighters, fights, events
- [ ] Org filter pills work (UFC, ONE, PFL, etc.)

**Event detail**
- [ ] `/events/[id]` loads with main card / prelims sections
- [ ] Event banner image renders when present
- [ ] SSR meta tags correct (View Source → check `<title>`, og:image)

**Fight detail (upcoming)**
- [ ] `/fights/[id]` loads for an upcoming fight
- [ ] Hype score and bar chart render
- [ ] **Hype the fight (1-10)** — modal submits, count updates
- [ ] **Leave a pre-fight comment** — appears, upvote toggles
- [ ] Odds visible if present

**Fight detail (completed)**
- [ ] `/fights/[id]` loads for a completed fight
- [ ] Average rating + distribution chart render
- [ ] **Rate the fight (1-10)** + tags + review text — submits, appears
- [ ] **Upvote a review**
- [ ] Spoiler-free mode actually hides the outcome until rated

**Profile**
- [ ] `/profile` shows stats
- [ ] `/profile/edit` — change display name, avatar upload, spoiler-free toggle persists
- [ ] `/activity` — filters (all/reviewed/tagged), sort options
- [ ] `/followed-fighters`

**Footer / legal**
- [ ] `/privacy`
- [ ] `/delete-account`
- [ ] `/feedback`

**Responsive (Chrome DevTools)**
- [ ] 375px (iPhone SE) — nav, fight cards, modals
- [ ] 768px (tablet)
- [ ] 1200px (desktop)

**Performance / SEO sanity**
- [ ] Lighthouse on homepage (Perf, Accessibility, SEO scores)
- [ ] View Source on `/events/[id]` — confirm `<title>`, OG tags, JSON-LD (will fail; tracked above)

---

## Backlog (post-QA)

Ordered by SEO leverage + user-impact:

1. **Custom domain: `goodfights.app` → Vercel web project**, retire `packages/landing` (unlocks SEO; kills the privacy/delete-account 404s)
2. **"How to Watch" SEO content engine** — see "How to Watch hub" section below
3. **JSON-LD structured data** on event, fight, fighter pages
4. **Wire Google Sign-In button** on `/login` (finish the half-built feature)
5. **Port "How to Watch"** widget from mobile to event + fight pages (uses existing `/api/broadcasts`)
6. **Add fighters to sitemap**
7. **OG image fallback** (Good Fights branded card for events without banners)
8. **Canonical URLs** + per-page Twitter image
9. **Upgrade `<img>` → `next/image`**
10. **Lighthouse-driven perf pass**

---

## "How to Watch" Hub — SEO Content Engine

**Premise:** The broadcast discovery system already aggregates per-event, per-card-section, per-country broadcast data. Surface it as auto-generated SEO landing pages targeting long-tail queries like "How to watch PFL in Spain".

### Page tiers (all auto-generated from `/api/broadcasts`)

| Tier | URL pattern | Count | Example |
|---|---|---|---|
| **Leaf** (promo × country) | `/how-to-watch/[promotion]/[country]` | ~168 | "How to Watch PFL in Spain" |
| **Promotion hub** | `/how-to-watch/[promotion]` | ~14 | "How to Watch UFC — Every Country" |
| **Country hub** | `/how-to-watch/from/[country]` | ~12 | "How to Watch Combat Sports from Canada" |

Total: ~194 pages, all generated. Leaf is the SEO workhorse — hubs exist to capture broader queries and provide internal linking.

### Why promo × country at the leaf

Search intent lives at the intersection. "How to watch PFL in Spain" = clear commercial intent, fresh-answer query, low high-quality competition. "How to watch combat sports from Canada" is too broad and over-competed.

### Moat properties

- **UFC.com / PFL.com** show their own promotion only, defaults to their region
- **Reddit / blogs** go stale within 2 weeks of any broadcast deal change
- **Good Fights** has section-aware per-country defaults + per-event discoveries, auto-refreshed
- Every new event = another freshness signal on every relevant leaf page

### Page content recipe (leaf)

- H1: "How to Watch [Promotion] in [Country]" + last-updated date
- Default broadcaster(s) for whole-event card (logo + Watch link)
- Card-section overrides (main / prelims) if they air separately
- Next 3 upcoming events for that promotion with their specific broadcaster — drives traffic to event pages
- FAQ section with `FAQPage` + `BroadcastEvent` JSON-LD schemas

### Critical guardrail

**Do not generate pages for (promo, country) pairs with no data.** Thin content tanks SEO. Generate only where `BroadcastRegion` data exists. Pages appear as data fills in.

### Dependencies

- Custom domain on `goodfights.app` (these pages MUST be on the real domain to do SEO work)
- Country list aligned to actual `BroadcastRegion` codes in production data
- Sitemap updated to include all generated leaf + hub pages

### Open design questions

- URL slug: `/how-to-watch/pfl/spain` vs `/how-to-watch/pfl-in-spain`? Likely the former (hierarchical) for cleaner crumbs and internal linking.
- Last-updated freshness signal: pulled from latest broadcast-discovery write timestamp for that (promo, country)?
- Internal linking: every event detail page should link to its (promo × country) leaf page for the user's region.

---

## Session Log

### 2026-05-14 — Assessment kickoff
- Lifted "web app defunct" memory; resumed active build
- Audited feature parity vs mobile (code inspection only, no runtime test)
- Audited SEO state — strong foundation, missing JSON-LD + domain not live
- Decided: no web push notifications
- Decided: production-URL QA pass before any new feature work
- Created this tracker
