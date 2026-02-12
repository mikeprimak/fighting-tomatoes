# Good Fights - Launch Plan (February 2026)

**Created**: 2026-02-12
**Target Launch**: Week of Feb 23-26, 2026
**Current Status**: iOS live (App Store), Android in internal testing

---

## The Big Picture

Three things must happen before promoting the app and recruiting Reddit testers:

1. **Data Quality** - Users open the app and see accurate, complete fight data with ratings
2. **Bug-Free Core Experience** - Browsing, rating, and reviewing fights works without obvious issues
3. **Live Event Process** - When fights happen, the app reflects reality (upcoming → live → completed)

---

## TRACK 1: Data Quality & Legacy Migration

### Current State
- 48,958 ratings synced from fightingtomatoes.com
- 4,593 fights have correct rating counts
- ~2,000 legacy fights NOT in new DB (old/obscure events - acceptable loss)
- Reviews NOT migrated (too slow over remote MySQL - needs mysqldump approach)
- Some events have duplicate fights (e.g., UFC 322 Della Maddalena vs Makhachev)

### Action Items

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1.1 | **Run fresh ratings sync** - Check if any new legacy ratings since Jan 28 | Medium | TODO |
| 1.2 | **Fix duplicate fights** - Audit and merge/delete duplicates (UFC 322, others) | High | TODO |
| 1.3 | **Verify recent events are complete** - UFC 324, 325, and any events since Jan 28 must show as completed with results | High | TODO |
| 1.4 | **Run update-rating-stats.js** after any data changes | High | TODO |
| 1.5 | **Migrate reviews** (optional) - Use mysqldump to export, then import locally | Low | TODO |
| 1.6 | **Spot-check 10 recent events** - Open app, verify fights have correct status/results/ratings | High | TODO |
| 1.7 | **Update user stats** - Run update-user-stats.js so profiles show correct counts | Medium | TODO |

### Commands Reference
```bash
# Sync ratings from legacy
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js --only=ratings

# Update fight rating stats
cd packages/backend
node update-rating-stats.js

# Update user profile stats
cd packages/backend/scripts/legacy-migration
node update-user-stats.js
```

---

## TRACK 2: Bug Fixes

### Known Issues

| # | Bug | Severity | Status | Notes |
|---|-----|----------|--------|-------|
| 2.1 | **UFC 324 not in completed fights** | High | TODO | `hasStarted: false`, `isComplete: false` - needs to be marked complete with results |
| 2.2 | **Duplicate fights in some events** | Medium | TODO | UFC 322 has two copies of same fight |
| 2.3 | **Reset Password flow** | Low | FIXED | vercel.json cleanUrls + rewrites (Jan 20) |
| 2.4 | **Email deliverability** | Low | FIXED | Switched to Resend, SPF/DKIM/DMARC configured (Jan 20) |
| 2.5 | **Hidden Matchroom events** | Info | DONE | 6 events hidden via `isVisible` flag |
| 2.6 | **BKFC duplicate fighter images** | Medium | FIXED | Scraper bug: event page image extraction grabbed same fight-card image for both fighters. Fixed scraper to search from fighter-specific containers outward. Set 13 affected fighters' images to null (placeholder) until next scraper run provides correct individual headshots. |
| 2.7 | **Jumpy scrolling on fight lists** | Medium | FIXED | Upcoming screen had aggressive virtualization (`removeClippedSubviews={true}`, `windowSize={5}`) causing items to unmount/remount while scrolling. Changed to match completed screen settings (`removeClippedSubviews={false}`, `windowSize={21}`, `maintainVisibleContentPosition`). |

### Bug Hunt Checklist (Before Reddit Launch)

Test these flows on a real Android device:

- [ ] Fresh install → Guest browsing → See events and fights
- [ ] Registration → Email verification → Login
- [ ] Google Sign-In
- [ ] Browse upcoming events → See hype ratings
- [ ] Browse completed events → See fight ratings and results
- [ ] Rate a fight → Rating saves and displays
- [ ] Write a review → Review saves and displays
- [ ] Add tags to a fight → Tags save
- [ ] Search for a fighter → Results show
- [ ] Profile → See rating count and history
- [ ] Delete account flow
- [ ] Pull-to-refresh on all screens
- [ ] Deep link from email (reset password, verify email)

---

## TRACK 3: Live Event Management

### The Problem

When events happen, fights need to transition from "upcoming" to "live" to "completed" with correct results. Automated scrapers exist for some promotions but are still being developed. Meanwhile, users need to see correct data.

### The Solution: Two-Layer Approach

**Layer 1: Manual Admin Controls (NOW - for user-facing production)**
- Admin panel already has fight status controls (commit `60167f2`)
- Admin can manually update fight status, winner, method, round, time
- This is the primary way to keep the app accurate during events RIGHT NOW

**Layer 2: Automated Scrapers (IN DEVELOPMENT - runs in parallel)**
- UFC live tracker on GitHub Actions (10-min polling) - mostly working
- ONE FC live tracker - built, needs more testing
- Zuffa Boxing / Tapology tracker - built
- These write to the SAME production database currently

### Environment Strategy

The app currently has NO staging environment. Both manual admin updates and automated scrapers write to the same production database. This is the key risk.

**Recommended Approach: `trackerMode` Field (Already Partially Built)**

The `trackerMode` field on Event model already exists (commit `28dd201`):
- `"manual"` - Automated systems skip this event; admin controls only
- `"auto"` - Automated scrapers manage this event
- `null`/default - Legacy behavior

**Workflow for live events:**

1. **Before an event starts**: Set `trackerMode = "manual"` for the event
2. **During the event**: Admin manually updates fight results as they happen
3. **After the event**: Results are locked in, users see correct data
4. **For testing scrapers**: Run scrapers against events set to `"manual"` mode - the scraper output can be logged/compared but won't overwrite manual data

**Future (from CLAUDE.md Shadow Fields concept):**
- Add `tracker*` shadow fields so scrapers write to draft fields
- Admin can compare and "publish" when scraper output is correct
- This decouples scraper development from production data entirely

### Event Day Checklist (Manual Process)

**Admin Panel URL**: `https://fightcrewapp-backend.onrender.com/admin.html`
Login with your admin account (avocadomike@hotmail.com).

```
BEFORE EVENT:
□ Open admin panel → find the event
□ Click "Edit Event" → set Tracker Mode to "Manual" → Save
□ Verify all fights are listed (add any missing ones)

DURING EVENT (as each fight ends):
□ Click the pencil icon on the fight that just ended
□ In the "Fight Result" section at the bottom of the edit modal:
  - Select the Winner from the dropdown
  - Select the Method (KO/TKO, Decision, Submission, etc.)
  - Enter the Round number
  - Enter the Time (e.g., "4:59")
□ Click "Save Fight" (auto-marks fight as complete)
□ Verify it looks correct in the app (pull to refresh)

AFTER EVENT:
□ Click the event's "Mark Complete" button
□ Results are now locked - users can rate
```

### What Each trackerMode Does

| Mode | Set When | Effect |
|------|----------|--------|
| (empty/null) | Default | Uses promotion's default automation |
| **manual** | You want full control | ALL automated systems skip this event |
| time-based | Auto for most promos | Marks fights complete at section start times (no results) |
| live | UFC with working tracker | Real-time scraping populates results |

---

## TRACK 4: Android Launch & Reddit Testing

### Current Status
- Internal testing: Started ~Jan 14 with v20, 14-day requirement should be complete
- Latest build: versionCode 30 (Jan 28)
- Need to verify: Is the 14-day clock done? Can we move to open/closed testing?

### Steps to Open Testing

| # | Task | Status |
|---|------|--------|
| 4.1 | Verify 14-day internal testing period is complete | TODO |
| 4.2 | Build fresh Android APK/AAB if needed (may need newer build with recent fixes) | TODO |
| 4.3 | Move from internal testing → closed testing (or open testing) on Play Console | TODO |
| 4.4 | Get the opt-in link for testers | TODO |
| 4.5 | Draft Reddit post for r/MMA, r/boxing, r/ufc (see below) | TODO |
| 4.6 | Post to Reddit with testing link | TODO |

### Reddit Post Draft

**Subreddits**: r/MMA, r/boxing, r/ufc, r/combatsports

**Title**: "I built an app for rating fights - looking for Android beta testers"

**Body** (adapt per subreddit):
```
Hey everyone - I've been building Good Fights, an app where you can:

- See which upcoming fights fans are hyped for (community hype ratings)
- Make predictions (winner + method)
- Rate fights after they happen (1-10)
- Write reviews and read fan reactions

It covers UFC, ONE Championship, boxing (Golden Boy, Top Rank, PFL), and more.

Looking for Android beta testers to help find bugs before public launch.
The iOS version is already live on the App Store.

[Link to join Android beta]

Would love any feedback - thanks!
```

---

## TRACK 5: iOS Status Check

| # | Task | Status |
|---|------|--------|
| 5.1 | Check App Store Connect - is the app approved and live? | TODO |
| 5.2 | If live, verify it works on a real iOS device | TODO |
| 5.3 | Check if an update is needed (last submitted build was 14, Jan 22) | TODO |

---

## Two-Week Timeline

### Week 1 (Feb 12-18): Fix & Verify

| Day | Focus | Tasks |
|-----|-------|-------|
| **Feb 12-13** | Data audit | 1.1, 1.2, 1.3, 1.4, 1.6, 2.1, 2.2 |
| **Feb 14-15** | Bug hunt | Full test checklist on Android device, fix anything found |
| **Feb 16-17** | Live event test | If any events this weekend, practice the manual update workflow |
| **Feb 18** | Buffer | Fix anything that came up |

### Week 2 (Feb 19-25): Launch

| Day | Focus | Tasks |
|-----|-------|-------|
| **Feb 19-20** | Android release | 4.1-4.4, build if needed, move to open testing |
| **Feb 21** | Final check | Spot-check data, test all flows one more time |
| **Feb 22-23** | Reddit launch | 4.5-4.6, post to subreddits |
| **Feb 24-25** | Monitor | Watch for crash reports, respond to feedback, hot-fix if needed |

---

## Quick Reference: What Goes Where

| Action | Where | How |
|--------|-------|-----|
| Update fight results | Admin panel | Browser → admin routes |
| Fix data issues | Prisma Studio or scripts | `npx prisma studio` or node scripts |
| Push JS-only fix | EAS Update | `eas update --branch production` |
| Push native fix | EAS Build + Store | `eas build` → submit |
| Fix API bug | Git push | Push to main → Render auto-deploys |
| Run scraper manually | GitHub Actions | Trigger workflow manually |
| Check scraper logs | GitHub Actions | Check workflow runs |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Feb 12 | Use `trackerMode="manual"` for live events during launch period | Keeps user-facing data accurate while scrapers are still being developed |
| Feb 12 | Skip reviews migration for now | Low priority - most value is in ratings. Can migrate later |
| Feb 12 | Target Feb 23-26 for Reddit testing recruitment | Gives 1 week to fix data/bugs, 1 week to prepare Android release |

---

## Files Referenced

| File | Purpose |
|------|---------|
| `LAUNCH-DOC.md` | Original launch doc (store listings, build history) |
| `CLAUDE.md` | Dev quick reference, shadow fields concept |
| `CLAUDE-ARCHIVE.md` | Detailed setup guides and troubleshooting history |
| `MIGRATION-NOTES.md` | Legacy migration schema and bug fixes |
| `WORK-SESSION-2026-01-28.md` | Most recent work session |
| `ONE-FC-LIVE-TRACKER-PROJECT.md` | ONE FC tracker implementation details |
| `packages/backend/scripts/legacy-migration/` | All migration scripts |

---

## What "Launch Ready" Looks Like

Before recruiting Reddit testers, ALL of these must be true:

- [ ] Every completed UFC event from 2025 shows correct results in the app
- [ ] Recent events (last 3 months) have accurate fight data and ratings
- [ ] No obvious duplicate fights visible to users
- [ ] Guest browsing works smoothly (no crashes, no empty screens)
- [ ] Rating and reviewing a fight works end-to-end
- [ ] The admin can manually update fight results during a live event
- [ ] Android is available via a testing link (Play Console)
- [ ] iOS is live and working on the App Store
