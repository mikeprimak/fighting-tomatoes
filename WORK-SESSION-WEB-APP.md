# Web App Build — Work Session Log

**Started:** 2026-04-02
**Goal:** Build the Good Fights web app (Next.js) in a 36-hour sprint
**Reference doc:** `WEB-APP-PLAN.md`

---

## Decisions Log

| # | Decision | Why |
|---|----------|-----|
| 1 | No crews feature | Abandoned in mobile app, removed from UI |
| 2 | No winner/method predictions | Abandoned in mobile app |
| 3 | No community tab | Hidden in mobile app, not active |
| 4 | No news tab | Hidden in mobile app, not active |
| 5 | No push notification bell on web | Mobile-only feature; can add browser notifications later |
| 6 | 5 nav items: Live, Upcoming, Past, Good Fights, Profile | Matches mobile's 5 tabs |
| 7 | Next.js App Router + Tailwind CSS | SSR for SEO, React-based, deploys to existing Vercel |
| 8 | Dark-only theme | Matches mobile app (no light theme exists) |

---

## Progress

### Phase 1: Foundation (Hours 1-4) -- COMPLETE
- [x] Init `packages/web` with Next.js 16.2 + Tailwind v4
- [x] Tailwind theme via CSS `@theme` (v4 syntax, no tailwind.config.ts)
- [x] API client ported (~40 methods, skipped crews/predictions)
- [x] Auth system (httpOnly cookie for refresh, in-memory access token)
- [x] API route proxies: /api/auth/{login,register,refresh,logout}
- [x] Root layout with Navbar (desktop + mobile hamburger)
- [x] React Query provider + Auth + OrgFilter + SpoilerFree contexts
- [x] Upcoming Events page (home, infinite scroll, org filter)
- [x] Past Events page (infinite scroll)
- [x] Live Events page (auto-refresh 60s)
- [x] Good Fights / Top Fights page (time period filter)
- [x] Profile page (stats display, auth gate)
- [x] Login page (email/password, guest mode)
- [x] Heatmap + date formatter utils ported
- [x] Fight cards: Upcoming, Completed, Live
- [x] EventCard with section grouping (MAIN CARD / PRELIMS)
- [x] Build passes cleanly (12 routes)

### Phase 2: Browse Experience (Hours 5-12) -- COMPLETE
- [x] Event Detail page (SSR + generateMetadata for SEO, live polling)
- [x] Fight Detail page (upcoming: hype/odds/comments + completed: ratings/tags/reviews)
- [x] Fighter Detail page (SSR, fight history, sort by date/rating)
- [x] Search page (fighters, fights, events results)
- [x] DistributionChart component (1-10 bar chart with heatmap colors)
- [x] Comments/Reviews section on fight detail
- [x] All 3 detail pages have SSR with Open Graph metadata
- [x] 17 routes building cleanly

### Phase 3: User Interactions (Hours 13-20) -- COMPLETE
- [x] Auth screens: login, register, forgot-password, reset-password, verify-email
- [x] RateFightModal (1-10 slider + tags + review text)
- [x] HypeFightModal (1-10 slider)
- [x] CommentForm (reusable for reviews and pre-fight comments)
- [x] Upvote toggle on comments/reviews
- [x] Fight tags (60+ tags in categories)
- [x] Profile page with stats + links
- [x] Edit profile (display name, avatar upload, spoiler-free toggle)
- [x] Privacy page (replaces landing HTML)
- [x] Delete account page (replaces landing HTML, fixes the 404!)
- [x] Rate/Hype action buttons on fight detail wired to modals
- [x] 23 routes building cleanly

### Phase 4: Activity & Polish (Hours 21-30) -- COMPLETE
- [x] Activity hub (my ratings with filters: all/reviewed/tagged + sort options)
- [x] Followed fighters page
- [x] Send feedback page (type selector + text)
- [x] Spoiler-free mode working (toggle on edit profile, hides outcomes)
- [x] 26 routes building cleanly

### Phase 5: SEO & Launch (Hours 31-36) -- COMPLETE
- [x] SEO metadata (title template, Open Graph, Twitter card, metadataBase)
- [x] generateMetadata for events, fights, fighters (SSR + OG)
- [x] sitemap.xml (static + dynamic event URLs, 1hr revalidation)
- [x] robots.txt (disallow /api/ and /profile/edit)
- [x] next.config: remote image patterns (Render, R2, UFC, Tapology)
- [x] Footer (copyright, privacy, delete-account, feedback links)
- [x] claim-account page
- [x] 29 routes total, all building cleanly

---

## Commits

| Time | Commit | What |
|------|--------|------|
| Phase 1 | (pending) | Foundation: Next.js scaffold, API client, auth, all 5 nav pages, fight cards |

---

## Notes

- Backend needs zero changes (API is web-ready, CORS configured)
- `packages/landing` will be replaced by `packages/web` at launch
- Push notification bell is mobile-only, not porting to web
- Test accounts: `testdev2@goodfights.app`, `test@goodfights.app` / `Testpass1!`

---

## Deployment — April 3, 2026

### Vercel Deployment — DONE
- [x] Vercel CLI installed and logged in
- [x] Project created: `michael-primaks-projects/web`
- [x] Env vars set: `API_URL` and `NEXT_PUBLIC_API_URL` (both point to Render backend)
- [x] Production deployment live at: **https://web-jet-gamma-12.vercel.app**
- [x] Backend CORS updated to allow all `.vercel.app` origins (regex in Fastify, string check in Express)
- [x] All changes committed and pushed to main

### Commits
| Commit | What |
|--------|------|
| `6d559c1` | Add Good Fights web app (Next.js) and update backend CORS for Vercel |

### Completed (Apr 3, 2026):
- [x] Added event banner images to EventCard — shows bannerImage with gradient overlay, event name, date badge, and time badge on all event list pages (upcoming/live/past)
- [x] Fallback to plain text header when no bannerImage exists

### Still TODO:
- [ ] Visual testing — open the live site, check each page, fix CSS issues
- [ ] Test auth flow on production (login, rate a fight, comment)
- [ ] Custom domain — point `goodfights.app` or a subdomain to Vercel
- [ ] Replace `packages/landing` with redirect to web app
- [ ] Upgrade `<img>` tags to `next/image` for optimization
- [ ] Mobile responsive verification at 375px/768px/1200px
