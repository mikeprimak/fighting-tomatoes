# Work Session - January 21, 2026

## Today's Goals

1. **Get All Fights/Events on upcoming fights and completed fights screens accurate**
2. **Get Webpages working (reset-password, verify-email)**
3. **Get Social Media Accounts Initiated**

---

## Carryover from Previous Sessions (Jan 19-20)

| Item | Status | Action Needed |
|------|--------|---------------|
| App Icon | Code ready | EAS build required |
| Reset Password 404 | ✅ Working | Tested and verified |
| Email SPF/DKIM | ✅ Complete | Switched to Resend, DNS configured |
| iOS App Store | IPA built | Use EAS Submit (not Transporter) |

**Note**: None of the Jan 19-20 work has been tested in the production app yet.

---

## Tasks Overview

| # | Task | Status | Priority |
|---|------|--------|----------|
| 1 | Verify Upcoming Fights Screen Accuracy | Not Started | High |
| 2 | Verify Completed Fights Screen Accuracy | Not Started | High |
| 3 | Test Reset Password Page | ✅ Complete | High |
| 4 | Test Verify Email Page | ✅ Complete | High |
| 5 | Social Media Accounts Setup | Not Started | Medium |

---

## Task 1: Verify Upcoming Fights Screen Accuracy

**Goal**: Ensure all upcoming events show correct dates and appear in proper order.

### Known Issues from Previous Sessions
- PFL Madrid (Mar 20) and Pittsburgh (Mar 28) were showing "in 3 weeks" - FIXED in DB
- Golden Boy events were being bumped to wrong years - Scraper FIXED

### Testing Checklist
- [ ] Check date display for all upcoming events
- [ ] Verify chronological order is correct
- [ ] Confirm no past events appear in upcoming
- [ ] Check PFL events specifically (Madrid, Pittsburgh)

### Investigation Notes
- (To be filled)

### Issues Found
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 2: Verify Completed Fights Screen Accuracy

**Goal**: Ensure all past events show correctly and in proper order.

### Known Issues from Previous Sessions
- UFC 321/322/323 were showing as upcoming - FIXED (marked complete, dates corrected)
- UFC duplicates existed - FIXED (legacy events deleted)

### Testing Checklist
- [ ] Check that UFC 321/322/323 appear in completed (not upcoming)
- [ ] Verify no duplicates exist
- [ ] Check chronological order (most recent first)
- [ ] Confirm Golden Boy Jan 15 event appears in completed

### Investigation Notes
- (To be filled)

### Issues Found
- (To be filled)

### Files Changed
- (To be filled)

---

## Task 3: Test Reset Password Page ✅ COMPLETE

**Goal**: Verify https://goodfights.app/reset-password works.

### Testing Checklist
- [x] Verify vercel.json changes were committed/pushed
- [x] Test https://goodfights.app/reset-password loads
- [x] Test actual password reset flow end-to-end

### Investigation Notes
- Page was already working (deployed from Jan 20 changes)
- Initial emails were blocked by Microsoft (Hotmail/Outlook) due to SendGrid shared IP blocklist
- Switched from SendGrid to Resend for email delivery
- Configured SPF/DKIM/DMARC via Cloudflare DNS for goodfights.app

### Issues Found & Resolved
1. **SendGrid IP blocklisted by Microsoft** - Emails to Hotmail/Outlook blocked with error 550 5.7.1
2. **Switched to Resend** - Better deliverability, emails now work to Gmail AND Hotmail
3. **SMTP secure setting** - Code had `secure: false` hardcoded, fixed to be dynamic based on port
4. **Microsoft Safe Links warning** - First-time clicks show "untrusted link" prompt (normal for new domains, improves over time)

### Files Changed
- `packages/backend/src/utils/email.ts` - Dynamic `secure` setting based on SMTP port

### Environment Changes (Render)
- `SMTP_HOST`: `smtp.sendgrid.net` → `smtp.resend.com`
- `SMTP_PORT`: `587` → `465`
- `SMTP_USER`: `apikey` → `resend`
- `SMTP_PASS`: Updated to Resend API key

### DNS Records Added (Cloudflare)
- Resend domain verification records (auto-added via Resend-Cloudflare integration)
- SPF/DKIM/DMARC now properly configured

---

## Task 4: Test Verify Email Page ✅ COMPLETE

**Goal**: Verify https://goodfights.app/verify-email works.

### Testing Checklist
- [x] Test https://goodfights.app/verify-email loads
- [x] Test actual email verification flow

### Investigation Notes
- Page was already working (deployed from Jan 20 changes)
- Tested by deleting test account `fightingtomatoesshop@gmail.com` from DB
- Created new account, received verification email via Resend
- Clicked link, email verified successfully

### Issues Found
- None - worked correctly after Resend email setup from Task 3

### Files Changed
- None (same email infrastructure changes from Task 3 apply)

---

## Task 5: Social Media Accounts Setup ✅ COMPLETE

**Goal**: Initialize social media presence for Good Fights app.

### Platforms to Set Up
- [x] Instagram
- [x] Twitter/X
- [x] TikTok
- [x] Facebook

### Notes
- All accounts set up by user on Jan 21

---

## Session Summary

### Work Completed

| Task | Status | Notes |
|------|--------|-------|
| 1. Upcoming Fights Accuracy | Partial | Matchroom scraper fixed, Golden Boy duplicate fixed |
| 2. Completed Fights Accuracy | Partial | UFC Royval vs Kape fixed, need to verify others |
| 3. Reset Password Page | ✅ Complete | Page works, switched to Resend for email |
| 4. Verify Email Page | ✅ Complete | Page works, tested end-to-end |
| 5. Social Media Setup | Not Started | |
| DB Backups | ✅ Complete | Workflow fixed, logs working |
| Zuffa Boxing Images | ✅ Complete | 18 fighters now have images |
| Matchroom Scraper | ✅ Complete | Root cause fix: always re-download + clear invalid images |
| Email Provider | ✅ Complete | Switched SendGrid → Resend, SPF/DKIM configured |
| Golden Boy Duplicate | ✅ Complete | Deleted "fight week schedule" event, fixed dates |

### Files Created
- None

### Files Modified
- `packages/backend/src/services/scrapeAllMatchroomData.js` - Always re-download images (don't trust existing files)
- `packages/backend/src/services/matchroomDataParser.ts` - Clear profileImage when no valid source URL
- `packages/backend/src/services/parsers/zuffaBoxingDataParser.ts` - Added `normalizeName()` function
- `packages/backend/src/services/parsers/dirtyBoxingDataParser.ts` - Added `normalizeName()` function
- `.github/workflows/database-backup.yml` - Fixed PostgreSQL 17 path
- `packages/backend/src/utils/email.ts` - Dynamic SMTP `secure` setting for Resend compatibility
- `packages/backend/public/images/athletes/matchroom/*.png` - 25 correct images, deleted 9 orphaned files

---

## Session Log

### 2026-01-21 - Session Start
- Created this tracking document
- Reviewed Jan 19-20 session summaries
- 5 main tasks identified for today

### Progress Updates

**Issue 1: DB Backups** ✅ FIXED
- Workflow existed but wasn't on GitHub (main vs master branch issue)
- User switched GitHub default branch from master to main
- Fixed PostgreSQL version mismatch (server v17, pg_dump v16) - now uses explicit `/usr/lib/postgresql/17/bin/pg_dump`
- Fixed admin panel logging - payload was missing `startedAt` field
- Created `scraper_logs` table in production DB (was never migrated)
- Backup confirmed working: 4MB file in R2, admin panel now shows status

**Issue 2: UFC Royval vs Kape Missing** ✅ FIXED
- Event existed but `isComplete` was false
- Marked event + 9 fights as complete
- Now appears in Completed Fights screen

**Issue 3: Zuffa Boxing Fighter Images** ✅ FIXED
- Scraped data had images, but parser was never run against production
- Ran `zuffaBoxingDataParser.ts` - 18 fighters now have images
- Found duplicate Emiliano Cardenas/Cárdenas (accent issue) causing duplicate fight
- Deleted duplicate fighter and fight from DB
- Added `normalizeName()` function to both Zuffa and Dirty Boxing parsers to prevent future accent-related duplicates

**Issue 4: Matchroom Boxing Scraper** ✅ FIXED (multiple rounds of fixes)
- Root cause: Multiple issues with fight extraction and image assignment
  1. Main event selector was wrong (`section.hero-event` → `section.single-event-hero`)
  2. `directMatchedFights` variable was referenced but never defined (causing crash)
  3. TBA detection was marking fighters as TBA if they had silhouette images (even with names)
  4. Fallback sequential image assignment was assigning WRONG images to fighters
  5. Duplicate "Luis David Salazar" fighter created, causing duplicate Madrimov vs Salazar fight
- Fixed scraper to properly extract:
  - Main event from `section.single-event-hero` with `.boxer-1` and `.boxer-2` divs
  - Undercard fights from `section.undercard div.fight`
  - Fighter names from `h2 > .first-name + .last-name` spans
  - Records from `.record` div text (W/KO/L/D pattern)
- TBA now only set when fighter has no name (not based on silhouette image)
- **Removed fallback sequential image assignment** - was causing identical wrong images for multiple fighters (Jones, Baxter, Madrimov all had same image file)
- Deleted duplicate Salazar fighter and associated wrong fights
- Cleared profileImage for fighters without proper images (Baxter, Hart, Madrimov)

**Issue 4b: Matchroom Image Matching Improvements** ✅ FIXED
- Problem: Some fighters with legitimate images on Matchroom website showed no image in app
  - Example: Khalil Coe had `khalil.png` but wasn't matched (only last name matching existed)
  - Example: Madrimov had `Cutout-3.png` but was rejected (generic filename)
- Solution: Enhanced `extractBoxerFromDiv` function in scraper:
  1. **Added first name matching** - filenames like `khalil.png` now match "Khalil Coe"
  2. **Added image reuse detection** - Matchroom reuses images for fighters without photos
     - Scraper now collects ALL fighter names first (STEP 0)
     - Only rejects images that match ANOTHER fighter's name
     - Generic filenames like `Cutout-3.png` are kept if they don't match anyone else
  3. **DOM position-based assignment** - image in fighter's div is assigned to that fighter
- Results after fix:
  - 6 upcoming events scraped
  - 35 total fights extracted (no duplicates)
  - Madrimov, Coe, and other fighters now have correct images
  - Fighters without unique images show NO image instead of wrong image

**Issue 4c: Matchroom Duplicate Images - ROOT CAUSE FIX** ✅ FIXED
- Problem persisted: Multiple fighters showing same image (Madrimov/Jones, Elif/Jaouad, Stevenson/Davis, etc.)
- Root cause identified: TWO bugs in scraper/parser
  1. **Scraper bug**: If local image file already existed, scraper assumed it was correct and skipped re-download
  2. **Parser bug**: Used `profileImage: profileImageUrl || undefined` - when null, used `undefined` which means "don't update", so old wrong images persisted
- Fixes applied:
  1. **Scraper**: Now ALWAYS re-downloads when fighter has valid imageUrl (doesn't trust existing files)
  2. **Parser**: Now explicitly sets `profileImage: null` when fighter has no valid source URL (clears stale images)
- Database cleanup performed:
  - Deleted 8 erroneous fights from Jan 24 event (legacy wrong pairings)
  - Deleted duplicate "Luis David Salazar" fighter (wrong name parsing: "Luis" + "David Salazar")
  - Deleted duplicate "Molly Mccann" fighter (case variation)
  - Deleted 24 cancelled legacy fights across all events
  - Deleted 7 legacy events with no fights (dated Dec 2026)
  - Cleared orphaned profileImage paths for fighters without valid source URLs
- Fresh scraper run:
  - Downloaded 25 unique images (verified by MD5 hash - all different)
  - 25 fighters now have correct profileImage paths
  - 33 fighters correctly have null profileImage (no image on Matchroom site)
- Deployed to production: Commit `7425c11`

**Issue 5: Golden Boy Duplicate Event** ✅ FIXED
- Duplicate event "Golden Boy: Rocha vs. Curiel.../fight Week Schedule" existed with wrong date (2027-01-16)
- Root cause: Scraper filter for "fight-week-schedule" was added AFTER bad data was imported
- Fixes applied:
  1. Deleted duplicate "fight Week Schedule" event and its fight
  2. Fixed date on main event (2027-01-16 → 2026-01-26)
  3. Added missing main event fight: Alexis Rocha vs Raul Curiel (title fight)
  4. Removed bogus "Raul Curiel vs Jordan Panthen" fight
  5. Deleted empty-name duplicate fighter ("" Rocha)
- Event now has 8 correct fights

**Issue 6: Email Deliverability (SPF/DKIM)** ✅ FIXED
- Initial problem: Emails to Microsoft (Hotmail/Outlook) blocked - SendGrid shared IP on blocklist
- Solution: Switched from SendGrid to Resend
- Steps completed:
  1. Created Resend account, verified goodfights.app domain
  2. DNS records auto-added to Cloudflare via Resend integration
  3. Updated Render environment variables (SMTP_HOST, PORT, USER, PASS)
  4. Fixed code: `secure` setting now dynamic based on port (465=true, 587=false)
- Result: Emails now deliver to both Gmail AND Hotmail successfully
- Note: Microsoft Safe Links shows one-time "untrusted link" warning (normal for new domains)

**Issue 7: Reset Password & Verify Email Pages** ✅ TESTED
- Both pages at goodfights.app working correctly
- End-to-end flows tested:
  - Password reset: Request → Email → Click link → Reset → Success
  - Email verify: Register → Email → Click link → Verified
- Test account `fightingtomatoesshop@gmail.com` deleted and recreated for testing

### Session End (Updated)
- **Matchroom scraper duplicate images issue RESOLVED** - Root cause fixed, deployed to production
- Pending for next session:
  - [ ] Dirty Boxing DBX5 event not showing (mentioned earlier)
  - [ ] Social media accounts setup
  - [ ] Verify upcoming/completed fights screens accuracy
  - [ ] Test Matchroom images display correctly in app after Render deploy

---

## Important Rules

- **DO NOT start EAS builds without user confirmation** - Build credits limited
- **Always use Render External URL** - Never local DB unless explicitly asked
- **Keep this document updated** as work progresses
