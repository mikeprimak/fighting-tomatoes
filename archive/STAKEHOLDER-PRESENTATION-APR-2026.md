# Good Fights: Mid-Project Stakeholder Update
### April 2026

---

## SLIDE 1: Executive Summary

**Good Fights** is a "Rotten Tomatoes for combat sports" — a platform where fans rate fights, hype upcoming events, and engage with the global combat sports community.

**Where we are:** Halfway through development, the app is **live on iOS, Android, and Web** with automated data coverage for **15 fighting organizations** worldwide.

**Key headline:** We've built a production-grade, multi-platform combat sports platform in 6.5 months — from first commit to live in app stores and on the web.

---

## SLIDE 2: By the Numbers

| Metric | Count |
|--------|-------|
| **Platforms** | 3 (iOS, Android, Web) |
| **Mobile Screens** | 50 |
| **Web Routes** | 29 |
| **API Endpoints** | 100+ |
| **Database Models** | 35 |
| **Automated Scrapers** | 14 daily + 7 live trackers |
| **GitHub Workflows** | 24 automated pipelines |
| **Fight Organizations** | 15 (UFC, BKFC, ONE FC, PFL, RIZIN, Oktagon, and more) |
| **Total Commits** | 1,135+ |
| **Development Time** | ~6.5 months (Sept 2025 - Present) |

---

## SLIDE 3: What We've Built — Core Features

**For Fans:**
- Rate completed fights (1-10 scale) and see community consensus
- Hype upcoming fights with a flame-based excitement meter
- Write reviews, add fight tags (139+ descriptors like "War", "Upset", "Masterpiece")
- Pre-fight discussion with upvotes and replies
- Follow favorite fighters and get push notifications when they compete
- Spoiler-free mode — outcomes hidden until you rate
- Search across fighters, fights, and events
- Browse upcoming, live, and completed events

**For Guests:**
- Full browse access without creating an account
- Seamless upgrade path when ready to engage

---

## SLIDE 4: What We've Built — Platform & Infrastructure

**Multi-Platform:**
- Native mobile app (React Native/Expo) on iOS and Android app stores
- Web app (Next.js) with full SSR and SEO optimization, live on Vercel
- Shared backend API serving all platforms

**Automated Data Pipeline:**
- 14 daily scrapers pull event/fighter data from 15 promotions
- 7 live event trackers update fight results in real-time during events
- Event lifecycle engine automatically manages event states (Upcoming -> Live -> Completed)
- Runs 24/7 with zero manual intervention

**Admin Tooling:**
- Full admin dashboard for event management and fight controls
- Manual override capability for any automated decision
- Per-organization notification controls
- Analytics dashboard for user behavior insights

---

## SLIDE 5: Development Timeline — Key Milestones

| Phase | Timeline | What Was Delivered |
|-------|----------|-------------------|
| **1. Foundation** | Sept - Dec 2025 | Core architecture, auth system, rating/review engine, search, profiles |
| **2. Data & Migration** | Dec 2025 - Feb 2026 | Database migration from legacy system, scraper infrastructure, 5,400+ historical fights recovered |
| **3. Live Tracking** | Feb - Mar 2026 | Real-time live event tracking across 7+ organizations, push notifications, spoiler-free mode |
| **4. Scale & Web** | Mar - Apr 2026 | Web app launch (29 routes), expanded to 15 organizations, UI/UX redesign, social media tools |

---

## SLIDE 6: Challenges We Faced & How We Solved Them

### Challenge 1: Timezone Data Accuracy
**Problem:** UFC.com dynamically adjusts event times based on the viewer's timezone. Our scrapers (running in cloud servers set to UTC) were importing incorrect times.
**Solution:** Configured timezone emulation in our scraping infrastructure so it consistently reads Eastern Time, matching our parser expectations. Applied the fix across all timezone-sensitive scrapers.
**Result:** 100% accurate event times across all organizations.

### Challenge 2: App Store Compliance
**Problem:** Apple Review required account deletion capability and guest access — two features not in our initial scope.
**Solution:** Implemented both features (delete account + full guest browsing mode) and submitted an updated build.
**Result:** Both requirements met. Build submitted and in review.

### Challenge 3: Live Event Reliability Across 15 Organizations
**Problem:** Each fighting organization presents data differently. Scrapers would break when source websites changed layouts. Some organizations had no structured data at all.
**Solution:** Built a modular scraper architecture with organization-specific parsers. Created a generic Tapology-based tracker that covers 6+ organizations through a single reliable data source. Added fallback logic and error recovery so individual failures don't cascade.
**Result:** Automated live tracking across 15 organizations with minimal maintenance.

### Challenge 4: Legacy Data Migration
**Problem:** Migrating from the predecessor app (Fighting Tomatoes) required recovering historical fight data, user ratings, and reviews without data loss.
**Solution:** Built migration scripts that recovered 1,380 missing fights and preserved all user-generated content. Implemented upsert logic with conflict resolution to prevent duplicate data.
**Result:** Complete data continuity — users kept all their ratings and reviews.

---

## SLIDE 7: Current Status

| Area | Status | Detail |
|------|--------|--------|
| **iOS App** | Live (in review for update) | v2.0.1 + OTA updates, Build 11 in Apple Review |
| **Android App** | Live | v2.0.2 built, pending Play Store upload |
| **Web App** | Live | 29 routes, SSR, SEO-optimized, deployed on Vercel |
| **Backend API** | Live | 100+ endpoints, running on Render |
| **Daily Scrapers** | Fully Automated | 14 scrapers running on cron schedules |
| **Live Trackers** | Fully Automated | 7 trackers dispatched automatically during events |
| **Admin Panel** | Operational | Full event/fight management + analytics |

---

## SLIDE 8: What's Next — Immediate Priorities

### Must-Do (Next 2-4 Weeks)
1. **Complete App Store Review** — iOS build currently in Apple Review
2. **Android Play Store Upload** — Built and ready, needs manual submission
3. **Fix Password Reset Flow** — Reset password page needs web route (404 issue)
4. **Email Authentication** — Configure SPF/DKIM/DMARC for goodfights.app domain so emails don't show "unverified"
5. **Web App QA** — Visual testing, responsive audit, production auth flow verification

### Should-Do (Next 1-2 Months)
6. **Custom Domain for Web** — Point goodfights.app to the Vercel web app
7. **Image Optimization** — Implement next/image for faster web load times
8. **Mobile Responsive Testing** — Full audit from 375px to 1200px+
9. **Expand Scraper Coverage** — Add emerging promotions as they gain traction

---

## SLIDE 9: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple Review rejection | Medium | High | Test account provided, all requirements met, guest mode + delete account implemented |
| Scraper breakage (site layout changes) | High | Medium | Modular architecture allows quick fixes; Tapology fallback covers 6+ orgs |
| Live tracker data gaps | Medium | Medium | Admin panel allows manual override; section-based completion as fallback |
| EAS build credits depleted (91% used) | Low | Medium | OTA updates for JS-only changes; plan build credits carefully |
| Email deliverability issues | High | Low | SPF/DKIM configuration is a known fix — scheduled in immediate priorities |

---

## SLIDE 10: Why This Project Is on Track

1. **All three platforms are live** — iOS, Android, and Web are deployed and functional
2. **Automation is mature** — 24 GitHub workflows handle data ingestion and live tracking without manual effort
3. **Architecture is scalable** — Modular scraper design means adding a new organization takes days, not weeks
4. **User-facing features are complete** — Rating, reviewing, hyping, following, notifications, spoiler-free mode all working
5. **Infrastructure is production-grade** — JWT auth, PostgreSQL, R2 image storage, push notifications, SSR web app
6. **Team has shipped consistently** — 1,135+ commits over 6.5 months, no major stalls

---

## SLIDE 11: How You Can Help

- **Test the app** — Download on iOS/Android or visit the web app. Rate some fights!
- **Provide feedback** — In-app feedback button sends directly to the team
- **Spread the word** — Share with combat sports fans in your network
- **Flag priority shifts** — If business priorities change, early communication helps us adapt the roadmap

---

## Appendix A: Tech Stack Overview

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native, Expo, Expo Router, React Query |
| **Web** | Next.js 16.2, Tailwind CSS v4, React Query, Vercel |
| **Backend** | Node.js, Fastify, Prisma ORM |
| **Database** | PostgreSQL (Render) |
| **Auth** | JWT dual-token (15min access / 7day refresh), Google OAuth, Apple Sign-In |
| **Image Storage** | Cloudflare R2 |
| **Push Notifications** | Firebase Cloud Messaging v1 |
| **CI/CD** | GitHub Actions (24 workflows), EAS Build (mobile), Vercel (web) |
| **Scraping** | Puppeteer, REST APIs, Tapology generic tracker |

## Appendix B: Organizations Covered

| Organization | Sport | Daily Scraper | Live Tracker |
|-------------|-------|--------------|-------------|
| UFC | MMA | Yes | Yes |
| BKFC | Bare Knuckle | Yes | Yes |
| ONE Championship | MMA/Muay Thai/Kickboxing | Yes | Yes |
| Oktagon | MMA | Yes | Yes |
| PFL | MMA | Yes | Yes (Tapology) |
| RIZIN | MMA | Yes | Yes (Tapology) |
| Karate Combat | Karate | Yes | Yes (Tapology) |
| Dirty Boxing | Boxing | Yes | Yes (Tapology) |
| Zuffa Boxing | Boxing | Yes | Yes (Tapology) |
| RAF | Wrestling | Yes | Yes |
| Matchroom | Boxing | Yes | Yes (Tapology) |
| Top Rank | Boxing | Yes | — |
| Golden Boy | Boxing | Yes | — |
| MVP | MMA | Yes | — |

## Appendix C: Test Accounts

| Account | Purpose |
|---------|---------|
| avocadomike@hotmail.com | Power user (1,234 ratings, 72 reviews) |
| applereview@goodfights.app | Apple Review test account |
| test@goodfights.app | General testing |
