# Good Fights - Launch Documentation

**Last Updated**: 2026-01-14

---

## Current Status

| Platform | Status | Notes |
|----------|--------|-------|
| **iOS** | REJECTED | Apple review flagged 2 issues - must fix and resubmit |
| **Android** | In Internal Testing | v18 building - all major issues fixed |

---

## Must Fix Before Resubmission

### Apple Review Issues (Both Platforms)

These were flagged by Apple and should be fixed for both iOS and Android:

| Issue | Description | Status |
|-------|-------------|--------|
| **Delete Account** | Must provide a way to delete account from within the app | DONE |
| **Guest Access** | Must allow users to enter app without logging in or creating account | DONE |

### Android-Specific Issues

| Issue | Description | Status |
|-------|-------------|--------|
| **Google Sign-In** | DEVELOPER_ERROR - SHA-1 mismatch with Play Store signing cert | Pending retest |
| **App Name** | Was "FightCrewApp", now "Good Fights" | FIXED |
| **App Icon** | Centered hand icon on home screen | FIXED (v18) |
| **Splash Screen** | Hand-only icon for Android 12+ | FIXED (v18) |

---

## Build Commands

```bash
# iOS Production Build
cd packages/mobile && eas build --platform ios --profile production

# Android Production Build
cd packages/mobile && eas build --platform android --profile production

# Submit to App Store
cd packages/mobile && eas submit --platform ios

# Submit to Play Store
cd packages/mobile && eas submit --platform android

# OTA Update (JS-only fixes, no rebuild needed)
cd packages/mobile && eas update --branch production --message "Fix description"

# Check build status
eas build:list
```

---

## App Store Listing Info

### App Description

**Short (80 chars)**:
See which fights are hyped, make predictions, then rate the action.

**Full**:
**Good Fights** tells the story of every fight - what fans thought before, what happened, and how they reacted after.

**SEE WHAT'S HYPED**
Don't know which fights to watch this weekend? Check the community hype ratings. Users rate upcoming fights 1-10 based on anticipation, so you instantly know which matchups have fans buzzing.

**UNDERSTAND WHY**
Read pre-fight comments to see what's driving the hype. Is it a rematch? A striker vs grappler clash? A rising contender? Get the storylines that make fights worth watching.

**MAKE YOUR PICK**
Predict who wins and how - KO, submission, or decision. See how the community leans. Is this a toss-up or does everyone see a finish coming?

**RATE THE ACTION**
After the fight, rate it 1-10. Was it a banger or a dud? Your ratings help other fans discover the fights worth going back to watch.

**SHARE YOUR REACTION**
Write reviews and see how other fans reacted. Did the underdog pull it off? Did it live up to the hype?

Browse UFC, ONE Championship, boxing, and more.

**Keywords**:
mma, ufc, boxing, fight hype, combat sports, fight predictions, mma predictions, fight ratings, martial arts, one championship, ufc predictions, fight reviews

**Promotional Text (iOS, 170 chars)**:
See which fights fans are hyped for, make your predictions, then rate the action after. The complete fight night companion for MMA and boxing fans.

---

## Store Assets Checklist

### Both Stores
- [x] App icon (1024x1024 PNG)
- [x] Screenshots
- [x] App description
- [x] Keywords
- [x] Privacy Policy URL: `https://goodfights.app/privacy.html`

### iOS Specific
- [x] Screenshots: iPhone 6.7" (1290x2796)
- [x] Age rating questionnaire
- [x] Export compliance (uses HTTPS - exempt)
- [x] App Review test account configured

### Android Specific
- [x] Screenshots
- [ ] Feature graphic (1024x500) - optional
- [x] Content rating questionnaire
- [x] Data Safety form
- [x] Target audience

---

## Test Accounts

### Apple Reviewer
- **Email**: `applereview@goodfights.app`
- **Password**: `AppleTest2026!`

### Dev Accounts
- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`

---

## URLs & Resources

| Resource | URL |
|----------|-----|
| Website | https://goodfights.app |
| Privacy Policy | https://goodfights.app/privacy.html |
| Backend API | https://fightcrewapp-backend.onrender.com/api |
| App Store Connect | https://appstoreconnect.apple.com/apps/6757172609 |
| Play Console | https://play.google.com/console |
| EAS Dashboard | https://expo.dev |
| Render Dashboard | https://dashboard.render.com |

---

## Recent Build History

| Build | Platform | Artifact | Notes |
|-------|----------|----------|-------|
| 18 | Android | (building) | Recentered app icon, hand-only splash |
| 16 | Android | (internal test) | Modal close fix, splash/icon updates |
| 10 | iOS | qwMALBMWpbRToV73AS7vW8.ipa | iPhone-only, rejected by Apple |
| 9 | Android | naFpmPAUJiajy7Sa4gXMgh.apk | Closed testing |

---

## Testing Completed

All core functionality has been tested on Android:

- [x] Authentication (registration, login, Google Sign-In, password reset)
- [x] Browsing (events, fights, fighters)
- [x] Core interactions (ratings, reviews, tags, hype, comments)
- [x] Search (fighters, events, fights)
- [x] User profile
- [x] Error handling

### Still Needs Testing
- [ ] Google Sign-In after SHA-1 fix (Android)
- [x] Guest mode - working (login screen has "Continue as Guest")
- [x] Delete account flow - working (Edit Profile > Danger Zone)

---

## Post-Launch Tasks

| Task | Priority |
|------|----------|
| Monitor crash reports | High |
| Respond to reviews | Medium |
| Update landing page with store links | Medium |
| Social media announcement | Medium |
| GitGuardian cleanup | Low |
| More live event trackers | Ongoing |

---

## Emergency Fixes

| Problem | Solution | Time |
|---------|----------|------|
| JS bug (logic, styling) | `eas update --branch production` | Minutes |
| API bug | Push to main, Render auto-deploys | Minutes |
| Native crash | New EAS build + store review | 1-2 days |
| Database issue | Fix via Prisma Studio | Minutes |

---

## Session Notes

### 2026-01-14 - Android Fixes

**Completed:**
- **Delete Account**: Added to Fastify routes (production uses Fastify, not Express). Fixed `user.id` vs `user.userId` bug. Working on production.
- **Guest Access**: Added "Continue as Guest" button to login screen. Removed separate welcome screen. Profile screen shows login prompt for guests.
- **App Icon**: Using recentered hand-only icon for Android adaptive icon (home screen).
- **Splash Screen**: Android 12+ has strict 240dp icon limit. Using hand-only image that fills the icon area.
- **Auth Modal**: Now closes when tapping outside the modal.

**Key Learnings:**
- Production backend uses Fastify (`auth.fastify.ts`), not Express (`auth.ts`)
- Android 12+ splash screen API limits icon to ~240dp - design around it
- EAS builds require `--clear-cache` and `expo prebuild --clean` to pick up new assets
- Always bump `versionCode` in BOTH `app.json` AND `android/app/build.gradle`

**Test Accounts:**
- `one@fightingtomatoes.com` through `six@fightingtomatoes.com` - Password: `Password1!`
