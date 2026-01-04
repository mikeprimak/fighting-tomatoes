# Launch Preparation

**Created**: 2025-12-26
**Last Updated**: 2026-01-03
**Status**: Final stretch

---

## Launch Blockers (5 Items)

These MUST be done before launch:

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **Apple Setup** | ⏳ Pending | TestFlight configured, need final test on device |
| 2 | **Logo/Splash** | ⏳ Pending | Add GOOD-FIGHTS-ICON-LOGO.png to splash, header |
| 3 | **Test Core Flow** | ⏳ Pending | Sign up → Rate fight → See rating (iOS + Android) |
| 4 | **Onboarding** | ⏳ Pending | New user flow, legacy user claim flow |
| 5 | **Switch to Production** | ⏳ Pending | Point app at Render backend |

---

## Already Done (Don't Redo These)

| Task | Status | Evidence |
|------|--------|----------|
| **Scrapers** | ✅ Complete | All 8 orgs configured (UFC, BKFC, PFL, ONE, Matchroom, Golden Boy, Top Rank, OKTAGON) |
| **Live Event Trackers** | ✅ Complete | UFC, Matchroom, OKTAGON have live tracking; others use time-based fallback |
| **Legacy Migration** | ✅ Complete | ~1,300 events, ~6,800 fighters, ~13,500 fights, 1,928 users, ~65,000 ratings, ~770 reviews |
| **Security Audit** | ✅ Complete | All 5 critical issues fixed |
| **Rate Limiting** | ✅ Complete | @fastify/rate-limit implemented |
| **Token Strategy** | ✅ Complete | 15min access, 90-day refresh with sliding expiration |
| **Account Claim Flow** | ✅ Complete | Legacy users can claim accounts via email verification |
| **Apple Developer** | ✅ Complete | $99/year enrolled, App Store Connect configured |
| **TestFlight Build** | ✅ Complete | First build uploaded |

---

## Post-Launch (Do After Live)

These are nice-to-haves, NOT launch blockers:

| Task | Priority | Notes |
|------|----------|-------|
| GitGuardian security issues | Medium | Credentials already rotated, just cleanup |
| Efficiency audit | Low | App works fine, optimize later |
| Admin event editing UI | Low | Use Prisma Studio or direct DB for now |
| Auto database backups | Medium | Render has manual backup option |
| Website/landing page | Low | Just app store links needed |
| GitHub copies | Low | Git is already a backup |
| Monitoring/alerting | Medium | Render has basic logs |
| More live trackers | Ongoing | Build during events as needed |

---

## Comprehensive Test Checklist

Test on Android (now) and iOS (when device available).

---

### PART A: AUTHENTICATION & ONBOARDING

#### A1. New User Registration
- [ ] Open app fresh (logged out)
- [ ] Tap "Sign Up"
- [ ] Enter email, password (12+ chars with uppercase, lowercase, number, special char)
- [ ] Submit registration
- [ ] Receive verification email (check spam)
- [ ] Click verification link
- [ ] See "Email verified" confirmation
- [ ] Log in with new account
- [ ] Verify you're logged in (profile shows your email)

#### A2. Legacy User Claim Flow
**Test User**: `borjosh103@gmail.com` (has 232 ratings, 16 reviews)
- [ ] Open app fresh (logged out)
- [ ] Tap "Log In"
- [ ] Enter: `borjosh103@gmail.com`
- [ ] See "Welcome Back" claim account screen (NOT password field)
- [ ] Tap to send verification email
- [ ] Check email for "Welcome Back! Set Up Your Good Fights Account"
- [ ] Click link in email
- [ ] Set new password (12+ chars with complexity)
- [ ] Log in with new password
- [ ] Go to Profile → verify ratings count shows (should be ~232)

#### A3. Google Sign-In
- [ ] Open app fresh (logged out)
- [ ] Tap "Continue with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify logged in successfully
- [ ] Profile shows Google account email

#### A4. Password Reset (Existing User)
- [ ] Log out
- [ ] Tap "Forgot Password"
- [ ] Enter your email
- [ ] Receive reset email
- [ ] Click link, set new password
- [ ] Log in with new password

#### A5. Logout
- [ ] While logged in, go to Settings/Profile
- [ ] Tap Logout
- [ ] Confirm logged out (see login screen)

---

### PART B: BROWSING & NAVIGATION

#### B1. Events List
- [ ] Open "Events" or "Upcoming" tab
- [ ] See list of upcoming events with dates, promotions
- [ ] Scroll to load more events
- [ ] Filter by promotion (UFC, ONE, etc.) if available

#### B2. Past Events
- [ ] Navigate to "Past Events" tab
- [ ] See completed events
- [ ] Events show completion status

#### B3. Event Detail
**Test Event**: Look for "OKTAGON 81: FLEURY vs. BUDAY" (Dec 28, 2025)
- [ ] Tap an event card
- [ ] See event detail screen with fight list
- [ ] Fights show fighter names, weight class
- [ ] Main event appears at top (or clearly marked)

#### B4. Fight Detail (Completed Fight)
**Test Fight**: Miloš Petrášek vs Mateusz Strzelczyk (OKTAGON 81)
- [ ] From event detail, tap a completed fight
- [ ] See fight detail screen
- [ ] See community rating average (if ratings exist)
- [ ] See rating distribution chart
- [ ] See reviews section
- [ ] See tags section

#### B5. Fight Detail (Upcoming Fight)
- [ ] Open an upcoming event
- [ ] Tap an upcoming fight
- [ ] See hype meter instead of rating
- [ ] Can add hype rating (1-10)
- [ ] Pre-fight comments visible (if any)

---

### PART C: CORE INTERACTIONS

#### C1. Rate a Fight
- [ ] Open a completed fight you haven't rated
- [ ] Tap to rate (1-10 slider or stars)
- [ ] Submit rating
- [ ] See your rating saved (shows "Your Rating: X")
- [ ] Log out → Log back in → Rating still there

#### C2. Write a Review
- [ ] Open a completed fight
- [ ] Scroll to reviews section
- [ ] Tap "Write a Review"
- [ ] Enter review text
- [ ] Submit
- [ ] See your review appear in the list

#### C3. Add Tags
- [ ] Open a completed fight
- [ ] Find tags section
- [ ] Tap to add a tag (FOTY, FOTN, Brawl, etc.)
- [ ] See tag count update
- [ ] Tap again to remove tag
- [ ] See tag count decrease

#### C4. Add Hype (Upcoming Fight)
- [ ] Open an upcoming fight
- [ ] Add hype rating (1-10)
- [ ] Submit
- [ ] See hype saved

#### C5. Add Pre-Fight Comment
- [ ] Open an upcoming fight
- [ ] Find pre-fight comments section
- [ ] Add a prediction/comment
- [ ] Submit
- [ ] See comment appear

---

### PART D: SEARCH

#### D1. Search for Fighter
**Test Fighter**: Search for "Michael Morales"
- [ ] Tap search icon/bar
- [ ] Type "Michael Morales"
- [ ] See search results
- [ ] Tap fighter result
- [ ] See fighter profile with image (should load UFC headshot)

#### D2. Search for Event
- [ ] Search for "UFC 300"
- [ ] See event result
- [ ] Tap to open event detail

#### D3. Search for Fight
- [ ] Search for "Volkanovski vs Makhachev"
- [ ] See fight result
- [ ] Tap to open fight detail

---

### PART E: FIGHTER PROFILES

#### E1. View Fighter Profile
**Test Fighter**: Michael Morales (has profile image)
- [ ] Navigate to a fighter profile
- [ ] See fighter image loads
- [ ] See record (W-L-D)
- [ ] See weight class
- [ ] See fight history

#### E2. Follow Fighter (if feature visible)
- [ ] On fighter profile, tap "Follow" button
- [ ] See confirmation
- [ ] Go to profile/settings → see followed fighters
- [ ] Unfollow

---

### PART F: USER PROFILE & SETTINGS

#### F1. View Profile
- [ ] Navigate to Profile tab
- [ ] See your display name/email
- [ ] See your stats (ratings count, reviews count)

#### F2. Settings
- [ ] Navigate to Settings
- [ ] See notification preferences
- [ ] Toggle a setting
- [ ] Verify it saves

---

### PART G: MIGRATION DATA VERIFICATION

These verify that legacy data from fightingtomatoes.com migrated correctly.

#### G1. Verify Ratings Migrated
**Test**: UFC 300 - Volkanovski vs Makhachev
- [ ] Search for "Volkanovski vs Makhachev"
- [ ] Open the UFC 300 fight
- [ ] Verify community rating shows (should have many ratings)
- [ ] Rating should be reasonable (likely 8-10 range for this fight)

#### G2. Verify Reviews Migrated
**Test**: UFC 300 - Volkanovski vs Makhachev
- [ ] Same fight as above
- [ ] Scroll to reviews section
- [ ] Look for review by "MMAExpert" with 38 upvotes
- [ ] Content starts with: "Technical grappling showcase..."
- [ ] Review should appear with correct upvote count

#### G3. Verify Tags Migrated
**Test Fights with Tags**:
- Kutateladze vs Fernandes → should have "One-sided" tag
- Gaethje vs Fiziev → should have "Brawl" tag
- Mendes vs McGregor → should have "Competitive" tag
- [ ] Open one of these fights
- [ ] Verify tag appears in tag section with count > 0

#### G4. Verify Fighter Images
**Test Fighter**: Michael Morales
- [ ] Search for "Michael Morales"
- [ ] Open fighter profile
- [ ] Image should load from UFC.com
- [ ] No broken image placeholder

#### G5. Verify Event Banners
**Test Event**: ONE Fight Night 49 (look in upcoming)
- [ ] Find event in events list
- [ ] Banner image should load (from cdn.onefc.com)
- [ ] No broken image placeholder

#### G6. Verify Legacy User Data After Claim
**If you claimed a legacy account**:
- [ ] Check your profile stats (ratings count)
- [ ] Open fights you previously rated on fightingtomatoes.com
- [ ] Your old rating should appear
- [ ] Your old reviews should appear under your name

---

### PART H: ERROR HANDLING

#### H1. Network Error
- [ ] Turn off WiFi/data
- [ ] Try to load events
- [ ] See appropriate error message (not crash)
- [ ] Turn network back on
- [ ] Pull to refresh → data loads

#### H2. Invalid Login
- [ ] Try to log in with wrong password
- [ ] See error message
- [ ] App doesn't crash

---

### TEST SUMMARY

| Section | Tests | Pass | Fail |
|---------|-------|------|------|
| A. Auth & Onboarding | 5 flows | | |
| B. Browsing & Navigation | 5 screens | | |
| C. Core Interactions | 5 actions | | |
| D. Search | 3 searches | | |
| E. Fighter Profiles | 2 tests | | |
| F. Profile & Settings | 2 screens | | |
| G. Migration Verification | 6 data tests | | |
| H. Error Handling | 2 tests | | |

### Not Critical for Launch
- Push notifications (test post-launch)
- Crews feature (can soft-launch disabled)
- Web version (focus on mobile)
- Apple Sign-In (test when iOS device available)

---

## Production Switch Checklist

When ready to go live:

### 1. Update API URLs in Mobile App

**File 1**: `packages/mobile/services/api.ts` (~line 20)
```typescript
// Change from:
return 'http://192.168.x.x:3008/api';
// To:
return 'https://your-render-backend.onrender.com/api';
```

**File 2**: `packages/mobile/store/AuthContext.tsx` (~line 76)
```typescript
// Same change as above
```

### 2. Set USE_PRODUCTION_API Flag (if exists)
Check for any `USE_PRODUCTION_API` or similar flags and set to `true`.

### 3. Build Production App
```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

### 4. Verify Backend is Ready
- [ ] Render backend is deployed and healthy
- [ ] Database has all migrated data
- [ ] Environment variables set (JWT_SECRET, DATABASE_URL, etc.)
- [ ] Check `/health` endpoint responds

### 5. Submit to App Stores
```bash
# iOS - submit to App Store
eas submit --platform ios

# Android - submit to Play Store
eas submit --platform android
```

---

## Quick Commands Reference

```bash
# Start local dev
cd packages/backend && PORT=3008 pnpm dev
cd packages/mobile && npx expo start --port 8083 --lan

# Build for TestFlight
eas build --platform ios --profile preview

# Push OTA update (for JS-only fixes after launch)
eas update --branch production --message "Fix description"

# Check Render logs
# Go to: https://dashboard.render.com → Your service → Logs

# Re-run legacy migration sync (if needed before launch)
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js
```

---

## Emergency Fixes After Launch

| Problem | Solution | Time to Fix |
|---------|----------|-------------|
| JS bug (logic, styling) | `eas update --branch production` | 2-5 minutes |
| API bug | Push to main, Render auto-deploys | 1-2 minutes |
| Native crash | New EAS build + app store review | 1-2 days |
| Database issue | Fix via Prisma Studio or psql | Minutes |

**Remember**: Most bugs can be fixed with OTA updates. You have a safety net.

---

## Contacts & Resources

| Resource | URL/Info |
|----------|----------|
| Render Dashboard | https://dashboard.render.com |
| EAS Dashboard | https://expo.dev |
| App Store Connect | https://appstoreconnect.apple.com |
| Play Console | https://play.google.com/console |
| Legacy MySQL | 216.69.165.113:3306 (user: fotnadmin) |
