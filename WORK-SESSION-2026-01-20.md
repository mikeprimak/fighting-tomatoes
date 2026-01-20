# Work Session - January 20, 2026

## Tasks Overview

| # | Task | Status | Priority |
|---|------|--------|----------|
| 1 | UFC Bonfim vs Brown Event Image | **DONE** | Quick |
| 2 | Zuffa Boxing Scraper - Fighter Images | **DONE** | Medium |
| 3 | UFC 321/322/323 Duplicates Fix | **DONE** | High |
| 4 | Matchroom Boxing - Duplicate Fighter Images | **DONE** | Medium |
| 5 | Dirty Boxing Scraper (Tapology) | **DONE** | Medium |
| 6 | DB Backup Monitoring in Admin Panel | **DONE** | Medium |
| 7 | App Icon - Final Version | **DONE** (needs build) | Medium |
| 8 | Apple Review: Delete Account Feature | **DONE** | High |
| 9 | Apple Review: Guest Access | **DONE** | High |
| 10 | Fix Reset Password 404 | **DONE** (needs deploy) | Medium |
| 11 | Fix Email SPF/DKIM | Pending | Low |

**Important Rules:**
- **DO NOT start EAS builds without user confirmation** - Build credits limited
- **Always use Render External URL** - Never local DB unless explicitly asked
- **Keep this document updated** as work progresses

---

## Task 1: UFC Bonfim vs Brown Event Image

**Goal**: Add `ufc-bonfim-vs-brown.jpg` from root folder as the event banner image.

### Investigation Notes
- (To be filled)

### Solution Implemented
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 2: Zuffa Boxing Scraper - Fighter Images

**Issue**: The Tapology scraper gets fights but not fighter images like other scrapers do.

### Investigation Notes
- (To be filled)

### Solution Implemented
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 3: UFC 321/322/323 Duplicates Fix

**Issue**: Three legacy UFC events appear to have duplicates. They show out of order on completed fights screen (showing above more recent events like Bonfim vs Brown from Nov 8th).

**Order observed**: UFC 323 → 322 → 321 → Bonfim vs Brown (Nov 8) → Garcia vs Onama (Nov 1)

**Likely cause**: Legacy vs migrated version duplicates.

**Goal**: Remove duplicate events, keep the migrated versions.

### Investigation Notes
- (To be filled)

### Solution Implemented
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 4: Matchroom Boxing - Duplicate Fighter Images

**Issue**: Multiple fighters share the same image on Matchroom events. Example: Jan 24 event has Omari Jones, Jerome Baxter, and Israil Madrimov all showing Omari Jones' image.

### Investigation Notes
- (To be filled)

### Root Cause
- (To be filled)

### Solution Implemented
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 5: Dirty Boxing Scraper (Tapology)

**Goal**: Build scraper for Dirty Boxing Championship using Tapology as source.

**URLs**:
- Events page: https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc
- Example event: https://www.tapology.com/fightcenter/events/137440-dbx-5

### Investigation Notes
- (To be filled)

### Implementation
- (To be filled)

### Files Created
- (To be filled)

---

## Task 6: DB Backup Monitoring in Admin Panel

**Goal**: Show daily backup success/failure status in admin panel (Operations tab).

**Admin Panel URL**: https://fightcrewapp-backend.onrender.com/admin.html

### Implementation Notes
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 7: App Icon - Final Version

**Goal**: Replace app homescreen icon with `GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png` from root folder.

**Note**: Yesterday's testing confirmed the icon change process works. Now implementing the actual final icon.

**IMPORTANT**: Do not start EAS builds without user confirmation.

### Steps
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 8: Apple Review - Delete Account Feature

**Status**: COMPLETED (prior to this session)

---

## Task 9: Apple Review - Guest Access

**Status**: COMPLETED (prior to this session)

---

## Task 10: Fix Reset Password 404

**Issue**: `https://goodfights.app/reset-password?token=...` returns 404.

**Note**: A password-reset file already exists and was working at one point. Do NOT create a new one - find the existing one and fix it.

### Investigation Notes
- Found `packages/landing/reset-password.html` - complete reset password form that calls backend API
- Also exists at root `reset-password.html` (duplicate)
- The landing folder is deployed to Vercel at goodfights.app
- Issue: `vercel.json` had no rewrites configured for clean URLs

### Solution Implemented
- Added `cleanUrls: true` and explicit rewrites to `packages/landing/vercel.json`
- Rewrites added for: `/reset-password`, `/verify-email`, `/privacy`, `/delete-account`
- **Requires Vercel redeploy** - changes will auto-deploy when pushed to GitHub

---

## Task 11: Fix Email SPF/DKIM

**Issue**: Emails from goodfights.app show "unverified" warning in recipients' inboxes.

**Need**: Configure SPF, DKIM, and DMARC records for goodfights.app domain.

### Solution Implemented
- (To be filled)

---

## Session Summary

### Work Completed

| Task | Status | Notes |
|------|--------|-------|
| 1. UFC Bonfim Event Image | DONE | Banner image added to DB |
| 2. Zuffa Fighter Images | DONE | Fixed letterbox_images selector |
| 3. UFC Duplicates Fix | DONE | Fixed dates, deleted legacy events |
| 4. Matchroom Image Fix | DONE | Name-based image matching |
| 5. Dirty Boxing Scraper | DONE | Adapted from Zuffa scraper |
| 6. DB Backup Monitoring | DONE | Admin panel + workflow updated |
| 7. App Icon Final | DONE | Needs EAS build to deploy |
| 8. Delete Account | DONE | Completed prior |
| 9. Guest Access | DONE | Completed prior |
| 10. Reset Password 404 | DONE | Needs Vercel deploy |
| 11. Email SPF/DKIM | Pending | Requires DNS configuration |

### Files Created
- `packages/backend/src/scripts/updateEventImage.ts`
- `packages/backend/src/scripts/fixUfcDuplicates.ts`
- `packages/backend/src/services/scrapeDirtyBoxingTapology.js`
- `packages/backend/src/services/dirtyBoxingDataParser.ts`

### Files Modified
- `packages/backend/src/services/scrapeZuffaBoxingTapology.js` - Fighter image extraction
- `packages/backend/src/services/scrapeAllMatchroomData.js` - Name-based image matching
- `packages/backend/public/admin.html` - DB backup monitoring UI
- `.github/workflows/database-backup.yml` - Backup status logging
- `packages/mobile/assets/homescreen-icon.png` - New outline icon
- `packages/mobile/assets/adaptive-icon-foreground-new.png` - New outline icon
- `packages/landing/vercel.json` - Clean URLs and rewrites

---

## Session Log

### 2026-01-20 - Session Start
- Created this tracking document
- 11 tasks identified from user request + CLAUDE.md TODOs
- Tasks 8 & 9 (Delete Account, Guest Access) already completed
- Task 10: Existing password-reset file needs fixing, not new creation

### 2026-01-20 - Tasks 1-6 Completed
- Task 1: Created updateEventImage.ts script, copied image, updated DB
- Task 2: Fixed Zuffa scraper to use `letterbox_images` selector for fighter photos
- Task 3: Fixed UFC 321/322/323 dates (2026→2025), deleted legacy duplicates
- Task 4: Fixed Matchroom scraper to prioritize name-based image matching
- Task 5: Created Dirty Boxing scraper by adapting Zuffa scraper
- Task 6: Added DB backup monitoring UI to admin panel, updated GitHub workflow

### 2026-01-20 - Tasks 7-10 Completed
- Task 7: Copied new outline-only icon to iOS and Android asset locations (needs EAS build)
- Task 10: Added cleanUrls and rewrites to vercel.json (needs Vercel deploy)

### Remaining
- Task 11: Email SPF/DKIM - still pending, requires DNS configuration

### Scraper Results (Background Tasks)

**Zuffa Boxing Scraper** (completed in 164s):
- Event: Zuffa Boxing 1: Walsh vs. Ocampo (Jan 23, 2026)
- Venue: UFC APEX, Las Vegas
- 9 fights, 18 athletes
- 17/18 fighter images found (1 timeout for Radzhab Butaev)
- Data saved to `scraped-data/zuffa-boxing/`

**Dirty Boxing Scraper** (completed in 172s):
- Event: DBX 5 (Jan 30, 2026)
- 12 fights, 24 athletes
- 20/24 fighter images found
- Data saved to `scraped-data/dirty-boxing/`
