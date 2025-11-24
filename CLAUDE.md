# CLAUDE.md

FightCrewApp: React Native + Node.js combat sports fight rating app.

**📚 Archive**: See `CLAUDE-ARCHIVE.md` for detailed setup guides, troubleshooting, and feature implementation details.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433, Mobile API `http://10.0.0.53:3008/api`

**⚠️ STARTUP DEBUGGING CHECKLIST (Check FIRST)**:
1. **Network connectivity**: Ensure phone and computer are on the SAME WiFi network
2. **Zombie processes**: Check for stale Node processes blocking ports
3. **Firewall**: Windows Firewall may block Metro port 8083

**Killing Zombie Processes (Windows)**:
1. List all Node processes: `powershell -Command "Get-Process node | Select-Object Id, ProcessName, StartTime"`
2. Check port usage: `netstat -ano | findstr ":3008"` (backend) or `findstr ":8083"` (Expo)
3. Identify blocker: `powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = <PID>' | Select-Object CommandLine"`
4. Kill zombie (may need admin): `powershell -Command "Stop-Process -Id <PID> -Force"`
5. **IMPORTANT**: Verify it's a Node.js process before killing - DO NOT kill Claude Code (PID shown in process list)

## Stack

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day)
**Mobile**: iOS/Android/Web, Stack-inside-Tabs pattern

## API Endpoints

**Base**: `http://localhost:3008/api` (web) | `http://10.0.0.53:3008/api` (mobile)
**Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
**Fights**: `GET /fights`, `GET /fights/:id`, `POST /fights/:id/rate|review|tags|pre-fight-comment`
**Fighters**: `GET /fighters`, `GET /fighters/:id`, `POST /fighters/:id/follow`
**Events**: `GET /events`, `GET /events/:id`
**Crews**: `GET /crews`, `POST /crews|/crews/join`, `GET /crews/:id/messages`
**Notifications**: `POST /register-token`, `GET/PUT /preferences`
**Search**: `GET /search?q=query&limit=10`

## Core Systems

### Notification System (Rule-Based)
**Status**: ✅ Complete - Unified system for all fight notifications

**Architecture**:
- `UserNotificationRule`: Stores rules with JSON conditions, priority, timing
- `FightNotificationMatch`: Caches fight-rule matches, allows per-fight overrides
- Rule Engine (`notificationRuleEngine.ts`): Evaluates fights against conditions

**Three Notification Types**:
1. **Manual Fight Follows**: User follows specific fight → 15min before notification
2. **Fighter Follows**: User follows fighter → notified for all their fights
3. **Hyped Fights**: User opts into high-hype fights (≥8.5 hype score)

**Key Files**: `services/notificationRuleEngine.ts`, `services/notificationRuleHelpers.ts`, `routes/notifications.ts`

### Image Storage (Cloudflare R2)
**Status**: ✅ Complete - Free CDN storage for all images

**Implementation**:
- R2 bucket: `fightcrewapp-images` (fighters/, events/, news/)
- Daily scraper auto-uploads images, fallback to UFC.com URLs
- SEO-friendly filenames with collision prevention
- Free tier: 10GB storage, 1M reads/month, unlimited egress

**Key Files**: `services/imageStorage.ts`, `services/ufcDataParser.ts`

### Live Event Tracker
**Status**: ✅ Complete - Real-time fight tracking with daily scraper parity

**Features**:
- Shared utilities: parseFighterName, mapWeightClass, inferGenderFromWeightClass
- Upsert pattern prevents duplicates, preserves existing data
- Dynamic fight card changes: new fights, cancellations, replacements
- 30s polling during active events

**Key Files**: `services/ufcLiveParser.ts`, `services/liveEventTracker.ts`, `services/scrapeLiveEvent.js`

### Push Notifications (FCM V1)
**Status**: ✅ Complete - Working in EAS development builds

**Setup Summary**:
- Firebase project: `fight-app-ba5cd`
- Bare workflow: google-services.json in `android/app/`
- EAS credentials uploaded per build profile (development/production)
- Deep linking support for fight/event notifications

**Files**: `android/app/build.gradle`, `android/build.gradle`, `routes/notifications.ts`

### Automated Pre-Event Notification Scheduler
**Status**: ✅ Complete - Hourly cron job with deduplication tracking

**How It Works**:
1. **Hourly Check**: Cron job runs every hour at :00 minutes (e.g., 1:00, 2:00, 3:00)
2. **Time Window**: Looks for events starting between 5-6 hours from current time
3. **Deduplication**: Checks `SentPreEventNotification` table to prevent re-sending
4. **Send Reports**: For each qualifying event (not already sent):
   - Finds all users with active "Pre-Event Report" notification rules
   - Generates personalized report (hyped fights + followed fighters)
   - Sends push notification with deep link to events screen
   - Records send in database to prevent duplicates
5. **Lifecycle**: Initializes on server startup, stops gracefully on shutdown

**Database Schema**:
- `SentPreEventNotification`: Tracks sent notifications
  - `id` (UUID), `eventId` (unique), `sentAt` (timestamp)
  - Foreign key cascade: deletes when parent event is removed
  - Migration: `20251117000000_add_sent_pre_event_notifications`

**Key Implementation Details**:
- **Cron Pattern**: `'0 * * * *'` = At minute 0 of every hour
- **5-6 Hour Window**: Events between 5-6 hours qualify (ensures one send per event)
- **Deduplication**: `prisma.sentPreEventNotification.findUnique({ where: { eventId } })`
- **Recording Sends**: Only records if `result.sent > 0` (at least one notification sent)
- **Log Messages**:
  - Startup: `[Notification Scheduler] Initialized - will check for pre-event reports every hour`
  - Hourly: `[Pre-Event Report] Checking for events starting between [time1] and [time2]`
  - Skip: `[Pre-Event Report] Already sent notifications for event: [name], skipping`

**Key Files**:
- `services/notificationScheduler.ts`: Cron job management, initialization/shutdown
- `services/preEventReportService.ts:242-291`: `checkAndSendPreEventReports()` function
- `server.ts:246`: Scheduler initialization on startup
- `server.ts:46`: Scheduler shutdown on SIGTERM/SIGINT
- `prisma/schema.prisma:1152-1164`: SentPreEventNotification model

**Dependencies**: `node-cron` (^3.0.3), `@types/node-cron` (^3.0.11)

**Manual Testing**:
```javascript
// In server.ts or via API endpoint:
import { manualCheckPreEventReports } from './services/notificationScheduler';
await manualCheckPreEventReports();
```

**Monitoring**:
- Check server logs for hourly execution messages
- Query database: `SELECT * FROM sent_pre_event_notifications ORDER BY "sentAt" DESC;`
- Verify no duplicates: Each eventId should appear only once

## Data Scrapers

### UFC Scraper
**Status**: ✅ Complete - Daily automated scraper
**File**: `services/scrapeAllUFCData.js`

**Features**:
- Scrapes `ufc.com/events` for upcoming events
- Extracts fight cards with fighter details (names, ranks, countries, odds)
- Downloads event banners and fighter headshots
- Saves to `scraped-data/` (events, athletes JSON)
- Images stored in `public/images/events/` and `public/images/athletes/`

**Data Extracted**:
- Events: name, date, venue, location, banner image
- Fights: weight class, title status, card type (Main/Prelims/Early), start times
- Fighters: names, records, ranks, countries, headshot URLs, athlete page URLs

**Automation**: Runs daily at 12pm EST via cron job

### ONE FC Scraper
**Status**: ✅ Complete - Manual/automated scraper
**File**: `services/scrapeAllOneFCData.js`

**Features**:
- Scrapes `onefc.com/events` for upcoming events
- Extracts fight cards from event detail pages
- Downloads athlete images and event banners
- Saves to `scraped-data/onefc/` (events, athletes JSON)
- Images stored in `public/images/events/onefc/` and `public/images/athletes/onefc/`

**Data Extracted**:
- Events: name, date/timestamp, venue, city, country, banner image
- Fights: weight class, discipline (MMA/Muay Thai/Kickboxing/Grappling), championship status
- Fighters: names, records (W-L-D), profile images, athlete page URLs

**Key Differences from UFC**:
- Event selectors: `.simple-post-card.is-event` (vs `.l-listing__item`)
- Fight structure: `.event-matchup` with `.versus` text format
- No prelims split: All fights on "Main Card"
- Weight class includes discipline: "Bantamweight MMA", "Featherweight Muay Thai"
- Timestamp-based dates: Unix timestamps provided directly

**Usage**:
```bash
# Manual run
cd packages/backend && node src/services/scrapeAllOneFCData.js

# Automated mode (faster)
SCRAPER_MODE=automated node src/services/scrapeAllOneFCData.js
```

**Output Structure**:
- `scraped-data/onefc/events-{timestamp}.json`
- `scraped-data/onefc/athletes-{timestamp}.json`
- `scraped-data/onefc/latest-events.json` (always current)
- `scraped-data/onefc/latest-athletes.json` (always current)

**Test Results**: Successfully scraped 8 events, 10 fights, 20 athletes in 115s

## Planned Features

### Onboarding Flow Improvements (Nov 2025)
**Status**: 📋 Planned - Refining user authentication and first-time experience
**Branch**: TBD (suggest `feature/oauth-onboarding`)

**Goals**:
1. Add Google OAuth sign-in/sign-up
2. Enable email verification for new users
3. Refine onboarding UX for new and existing users
4. Optional: Add biometric auth for returning users

---

#### **Task 1: Email Verification**
**Priority**: HIGH | **Complexity**: Low-Medium | **Estimated**: 4-6 hours

**Backend Changes**:
- **Enable email sending** (`authController.ts:73`):
  - Uncomment `await EmailService.sendVerificationEmail(...)`
  - Configure SMTP credentials in `.env`:
    ```
    SMTP_HOST=smtp.sendgrid.net
    SMTP_PORT=587
    SMTP_USER=apikey
    SMTP_PASS=<your-sendgrid-api-key>
    SMTP_FROM=noreply@fightcrewapp.com
    ```
  - Recommended services: SendGrid (free 100 emails/day), Mailgun, AWS SES
- **Add resend verification endpoint** (`routes/auth.ts`):
  - `POST /auth/resend-verification` - finds user by email, generates new token
  - Rate limit: 3 requests per 15 minutes
- **Optional enforcement** (`middleware/auth.ts`):
  - Use existing `requireEmailVerification` middleware on critical routes
  - Example: require verification for creating crews, posting reviews

**Frontend Changes**:
- **Verification pending screen** (`app/(auth)/verify-email-pending.tsx`):
  - Show after registration: "We sent you an email!"
  - Display user's email with option to edit
  - "Resend Email" button (with cooldown timer)
  - "Skip for now" button (navigates to main app)
- **Verification success screen** (`app/(auth)/verify-email-success.tsx`):
  - Handle deep link: `fightcrewapp://verify-email?token=xxx`
  - Call `GET /auth/verify-email?token=xxx`
  - Show success animation + "Email Verified!" message
  - Auto-navigate to main app after 2s
- **Verification banner** (persistent component):
  - Show in tab bar/header if `user.isEmailVerified === false`
  - Yellow banner: "Verify your email to unlock all features"
  - Tap to open email app or resend verification

**Testing Checklist**:
- [ ] Registration sends verification email
- [ ] Email contains correct verification link
- [ ] Deep link opens app and verifies email
- [ ] Expired tokens show error message
- [ ] Resend verification works and updates token
- [ ] Unverified users see banner in app
- [ ] Verified users don't see banner

**Files to Create/Modify**:
- `packages/backend/src/controllers/authController.ts:73` (enable sending)
- `packages/backend/src/routes/auth.ts` (add resend endpoint)
- `packages/mobile/app/(auth)/verify-email-pending.tsx` (new)
- `packages/mobile/app/(auth)/verify-email-success.tsx` (new)
- `packages/mobile/components/VerificationBanner.tsx` (new)

---

#### **Task 2: Google OAuth Sign-In**
**Priority**: HIGH | **Complexity**: Medium | **Estimated**: 8-10 hours

**Backend Changes**:
- **Install dependencies**:
  ```bash
  cd packages/backend
  pnpm add google-auth-library
  ```
- **Add Google OAuth route** (`routes/auth.ts`):
  - `POST /auth/google` - accepts `{ idToken: string }`
  - Verify token with Google's API: `OAuth2Client.verifyIdToken()`
  - Extract user info: email, firstName, lastName, avatar
  - Upsert user in database:
    ```typescript
    const user = await prisma.user.upsert({
      where: { email },
      update: { lastLoginAt: new Date() },
      create: {
        email,
        googleId: payload.sub,
        authProvider: 'GOOGLE',
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatar: payload.picture,
        displayName: `${payload.given_name}${Math.floor(Math.random() * 1000)}`,
        isEmailVerified: true, // Google accounts are pre-verified
      }
    });
    ```
  - Handle email conflicts: If email exists with `authProvider: EMAIL`, return error
  - Generate JWT tokens and return to client
- **Environment variables** (`.env`):
  ```
  GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=<your-google-client-secret>
  ```
- **Update AuthController** (`controllers/authController.ts`):
  - Add `static async googleAuth(req, res)` method
  - Add validation schema for Google token

**Frontend Changes**:
- **Install dependencies**:
  ```bash
  cd packages/mobile
  npx expo install expo-auth-session expo-web-browser
  ```
- **Configure Google OAuth** (`app.json`):
  - Add iOS/Android client IDs from Google Cloud Console
  - Configure redirect URIs: `fightcrewapp://google-auth`
- **Update login screen** (`app/(auth)/login.tsx`):
  - Add "Continue with Google" button (Google logo + text)
  - Implement OAuth flow:
    ```typescript
    const [request, response, promptAsync] = Google.useAuthRequest({
      iosClientId: 'YOUR_IOS_CLIENT_ID',
      androidClientId: 'YOUR_ANDROID_CLIENT_ID',
      webClientId: 'YOUR_WEB_CLIENT_ID',
    });

    useEffect(() => {
      if (response?.type === 'success') {
        const { id_token } = response.params;
        loginWithGoogle(id_token);
      }
    }, [response]);
    ```
- **Update register screen** (`app/(auth)/register.tsx`):
  - Add same "Continue with Google" button at top
  - Add divider: "or sign up with email"
- **Update AuthContext** (`store/AuthContext.tsx`):
  - Add `loginWithGoogle(idToken: string)` method:
    ```typescript
    const loginWithGoogle = async (idToken: string) => {
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      // Handle response same as regular login
    };
    ```

**Google Cloud Console Setup**:
1. Create project at https://console.cloud.google.com
2. Enable Google+ API
3. Create OAuth 2.0 credentials:
   - **Web client**: For backend verification
   - **iOS client**: Bundle ID `com.fightcrewapp.mobile`
   - **Android client**: Package name + SHA-1 certificate fingerprint
4. Configure consent screen with app logo and privacy policy
5. Add authorized redirect URIs: `fightcrewapp://google-auth`

**Testing Checklist**:
- [ ] "Continue with Google" button shows on login/register
- [ ] Tapping button opens Google sign-in sheet
- [ ] Selecting account sends idToken to backend
- [ ] New users are created with Google profile data
- [ ] Existing Google users can log in
- [ ] Email conflict shows friendly error message
- [ ] Avatar from Google is displayed in app
- [ ] Test on iOS, Android, and web

**Files to Create/Modify**:
- `packages/backend/src/routes/auth.ts` (add /auth/google endpoint)
- `packages/backend/src/controllers/authController.ts` (add googleAuth method)
- `packages/backend/.env` (add Google credentials)
- `packages/mobile/app/(auth)/login.tsx` (add Google button)
- `packages/mobile/app/(auth)/register.tsx` (add Google button)
- `packages/mobile/store/AuthContext.tsx` (add loginWithGoogle)
- `packages/mobile/app.json` (add Google OAuth config)

**Edge Cases to Handle**:
- User signs up with email, later tries Google with same email → Link accounts or show error?
- User deletes Google account → How to handle orphaned account?
- Google token verification fails → Show "Sign in with Google failed" error
- Network timeout during OAuth flow → Show retry button

---

#### **Task 3: Refine Onboarding Flow**
**Priority**: MEDIUM | **Complexity**: Medium-High | **Estimated**: 10-12 hours

**New User Journey**:
1. **Welcome/Landing Screen** (`app/(auth)/welcome.tsx`):
   - App logo + tagline: "Rate Fights. Predict Winners. Join Crews."
   - 3-4 feature highlights with icons:
     - "Rate every UFC fight from 1-10"
     - "Predict winners and earn points"
     - "Follow your favorite fighters"
     - "Join crews and compete with friends"
   - Two CTA buttons:
     - "Continue with Google" (primary, yellow)
     - "Sign up with Email" (secondary, outlined)
   - Bottom link: "Already have an account? Sign In"
   - Optional: "Skip for now" (guest mode - browse only, no actions)

2. **Simplified Registration** (`app/(auth)/register.tsx`):
   - **Remove firstName/lastName fields** or make them truly optional
   - Keep only: Email, Password, Confirm Password
   - Add password strength indicator (weak/medium/strong)
   - Add "Show Password" toggle button
   - Move "Already have an account?" link to bottom
   - Add terms/privacy checkbox:
     - "I agree to the Terms of Service and Privacy Policy"
     - Required before enabling "Create Account" button

3. **Onboarding Tutorial** (`app/(auth)/onboarding-tutorial.tsx`):
   - Optional: Show only on first launch after registration
   - Swipeable carousel with 3-4 slides:
     - Slide 1: "Rate Fights" - screenshot of rating UI
     - Slide 2: "Make Predictions" - screenshot of prediction UI
     - Slide 3: "Follow Fighters" - screenshot of fighter follow
     - Slide 4: "Join Crews" - screenshot of crew chat
   - Skip button in top-right corner
   - Progress dots at bottom
   - Final slide: "Get Started" button → main app

4. **First-Time Setup** (optional steps after tutorial):
   - **Notification Permission Prompt**:
     - Custom screen explaining why notifications are useful
     - "Enable Notifications" button → triggers system permission
     - "Not Now" button → can enable later in settings
   - **Follow Favorite Fighters** (optional):
     - Show grid of 20 popular fighters with headshots
     - Tap to select, counter at top: "3 selected"
     - "Continue" button → follows selected fighters
     - "Skip" button → can follow later

**Existing User Improvements**:
1. **Enhanced Login Screen** (`app/(auth)/login.tsx`):
   - Add "Continue with Google" at top
   - Add divider: "or sign in with email"
   - Add "Forgot Password?" link below password field
   - Remove dev credential buttons for production
   - Add "Remember Me" checkbox (optional):
     - Stores refresh token in secure storage
     - Auto-logs in on app restart

2. **Forgot Password Flow** (backend already supports!):
   - **Reset Request Screen** (`app/(auth)/forgot-password.tsx`):
     - Email input field
     - "Send Reset Link" button
     - Calls `POST /auth/request-password-reset`
     - Success: "Check your email for reset instructions"
   - **Reset Password Screen** (`app/(auth)/reset-password.tsx`):
     - Handle deep link: `fightcrewapp://reset-password?token=xxx`
     - New password + confirm password fields
     - Password strength indicator
     - Calls `POST /auth/reset-password` with token + new password
     - Success: "Password updated!" → redirect to login

3. **Biometric Authentication** (optional, nice-to-have):
   - Install `expo-local-authentication`
   - Add opt-in prompt after first login:
     - "Enable Face ID / Touch ID for faster login?"
     - Store encrypted refresh token in Keychain
   - On app restart:
     - Show biometric prompt instead of login screen
     - On success, use stored refresh token to get access token
   - Settings toggle to disable biometric auth

**UI/UX Polish**:
- **Loading States**:
  - Skeleton screens while loading (fighters, events)
  - Spinner on auth buttons during API calls
  - Disable buttons to prevent double-tap
- **Error Handling**:
  - Toast notifications for network errors
  - Inline validation errors (red text under inputs)
  - Retry buttons for failed requests
- **Animations**:
  - Fade transitions between auth screens
  - Slide-up animation for modals
  - Success checkmark animation after verification
- **Accessibility**:
  - High contrast mode support
  - Screen reader labels for all buttons
  - Larger touch targets (min 44x44 points)

**Testing Checklist**:
- [ ] Welcome screen shows on first launch
- [ ] Tutorial can be skipped or completed
- [ ] Google sign-up creates account and skips email verification
- [ ] Email sign-up goes through verification flow
- [ ] Forgot password sends email and resets password
- [ ] Biometric auth works on supported devices
- [ ] Follow fighters on first launch (if implemented)
- [ ] Notification permission prompt shows (if implemented)
- [ ] Remember me keeps user logged in
- [ ] All screens work in light and dark mode
- [ ] Keyboard behavior works correctly on all forms

**Files to Create**:
- `packages/mobile/app/(auth)/welcome.tsx`
- `packages/mobile/app/(auth)/onboarding-tutorial.tsx`
- `packages/mobile/app/(auth)/forgot-password.tsx`
- `packages/mobile/app/(auth)/reset-password.tsx`
- `packages/mobile/components/PasswordStrengthIndicator.tsx`
- `packages/mobile/hooks/useBiometricAuth.ts` (if implemented)

**Files to Modify**:
- `packages/mobile/app/(auth)/login.tsx` (add forgot password link, Google button)
- `packages/mobile/app/(auth)/register.tsx` (simplify, add terms checkbox)
- `packages/mobile/app/_layout.tsx` (handle first-launch routing)
- `packages/mobile/store/AuthContext.tsx` (add biometric auth methods)

---

#### **Implementation Order (Recommended)**

**Phase 1: Quick Wins (1-2 days)**
1. ✅ Simplify registration form (remove/make optional firstName/lastName)
2. ✅ Add "Forgot Password?" link to login screen (backend ready!)
3. ✅ Uncomment email verification sending in authController
4. ✅ Configure SMTP credentials (SendGrid free tier)
5. ✅ Test email verification end-to-end

**Phase 2: OAuth Integration (2-3 days)**
1. ✅ Set up Google Cloud Console project
2. ✅ Implement backend `/auth/google` endpoint
3. ✅ Install expo-auth-session in mobile
4. ✅ Add "Continue with Google" buttons to login/register
5. ✅ Test on iOS and Android devices

**Phase 3: Onboarding Flow (3-4 days)**
1. ✅ Create welcome/landing screen
2. ✅ Build forgot password flow screens
3. ✅ Add email verification pending/success screens
4. ✅ Create onboarding tutorial carousel (optional)
5. ✅ Add first-time setup screens (notifications, fighters)
6. ✅ Polish UI with loading states and animations

**Phase 4: Nice-to-Haves (optional)**
1. ⭕ Biometric authentication
2. ⭕ Remember me functionality
3. ⭕ Account linking (Google + Email)
4. ⭕ Social sign-in with Apple (required for App Store if Google is offered)

**Total Estimated Time**: 6-9 days (1-2 weeks with testing/polish)

---

## Recent Features

### Nested Comments System (Nov 2025)
**Status**: 🚧 In Progress - Backend complete, frontend complete, testing in progress
**Branch**: `feature/nested-comments`

**Implementation Summary**:
- One-level nested comments for pre-fight comments and fight reviews
- Users can reply to any comment, replies appear underneath parent
- Visual nesting with 40px left margin indicates reply relationship

**Database Schema** (Migration: `20251123012300_add_nested_comments_support`):
- `PreFightComment.parentCommentId` → self-referencing foreign key
- `FightReview.parentReviewId` → self-referencing foreign key
- Removed unique constraints on `userId + fightId` (allows top-level + replies)
- Made `FightReview.rating` nullable (replies don't need ratings)

**Backend API** (`routes/fights.ts`):
- `POST /api/fights/:id/pre-fight-comments/:commentId/reply` - Create reply
- `POST /api/fights/:id/reviews/:reviewId/reply` - Create review reply
- `GET /api/fights/:id/pre-fight-comments` - Returns nested structure with replies
- `GET /api/fights/:id/reviews` - Returns nested structure with replies
- Replies include: user info, hype ratings, upvote status, flag status

**Frontend UI** (Mobile):
- **PreFightCommentCard**: Reply button in bottom right corner
  - Only shows for other users' comments (not "My Comment")
  - FontAwesome reply icon + "Reply" text label
- **UpcomingFightDetailScreen**: Full reply workflow
  - Reply form appears inside comment boundary with 40px left margin
  - TextInput (500 char max) + Submit/Cancel buttons
  - Submit button turns yellow when text entered
  - Auto-focus on form open
  - Submitted replies display underneath parent with 40px left margin
  - Replies support upvoting and flagging
- **API Service**: `createPreFightCommentReply()` method

**Key Files**:
- Database: `prisma/schema.prisma`, `migrations/20251123012300_add_nested_comments_support/`
- Backend: `routes/fights.ts:1396-1477` (reply creation), `routes/fights.ts:1479-1607` (nested fetching)
- Frontend: `components/PreFightCommentCard.tsx:26,143-164,238-254`, `components/UpcomingFightDetailScreen.tsx:133-135,496-510,1536-1656`, `services/api.ts:1007-1030`

**Commits**:
- `8651a92` - Backend: Add nested comments support (schema + API)
- `ae1c814` - Frontend: Add nested comments reply functionality to mobile UI

**Next Steps to Complete**:
1. **Testing & Validation**:
   - Test reply creation on mobile device (tap Reply on Derp's "test" comment)
   - Verify replies display with correct 40px left margin
   - Test upvoting replies
   - Test flagging replies
   - Ensure reply form closes after successful submission

2. **Comment Limits & Validation**:
   - ✅ Backend validation: max 10 replies per parent comment
   - ✅ Backend validation: max 5 total comments/replies per user per fight
   - ✅ Frontend toast messages for both limit types
   - Show reply count on parent comments (optional)

3. **User Experience Improvements**:
   - Add "Replying to @username" indicator in reply form header
   - Consider collapsible replies if >3 replies on a comment
   - Add scroll-to-reply behavior when reply form opens

4. **Post-Fight Reviews**:
   - Apply same reply functionality to CompletedFightDetailScreen
   - Reuse reply form pattern for fight reviews
   - Ensure consistency between pre-fight and post-fight comment systems

5. **Edge Cases**:
   - Handle deleted parent comments (cascade delete or orphan prevention)
   - Prevent replying to replies (enforce 1-level depth)
   - Handle long reply threads (UI performance)

6. **Testing Checklist**:
   - [ ] Create reply as authenticated user
   - [ ] View replies as unauthenticated user
   - [ ] Upvote a reply
   - [ ] Flag a reply
   - [ ] Cancel reply form without submitting
   - [ ] Submit empty reply (should be disabled)
   - [ ] Verify replies persist after app restart
   - [ ] Test on both iOS and Android

**Known Limitations**:
- Only one level of nesting (replies cannot have replies)
- No reply count indicator on parent comments yet
- No notification system for reply activity yet

### Quality Thread Scoring for Comments (Nov 2025)
**Status**: ✅ Complete - Algorithm implemented and working
**Branch**: `feature/nested-comments`

**Implementation Summary**:
Comments and reviews with nested replies are now sorted by a quality thread score that considers both the parent comment and its replies. This surfaces the most valuable discussions to the top.

**Algorithm Details**:
- **Base score**: Parent comment upvotes
- **Reply quality**: Square root of total reply upvotes × 2 (diminishing returns prevents spam)
- **Engagement bonus**: Log(reply count + 1) × 1.5 (rewards active discussion)
- **Exceptional multiplier**: 1.5x boost if any reply has 3x more upvotes than parent (surfaces hidden gems)
- **No time decay**: Most comments happen within days of fight announcement

**Key Files**:
- `packages/backend/src/utils/commentSorting.ts` - Core algorithm
- `packages/backend/src/routes/fights.ts:6` - Import statement
- `packages/backend/src/routes/fights.ts:1589-1594` - Pre-fight comments sorting
- `packages/backend/src/routes/fights.ts:1805-1810` - Fight reviews sorting

**Testing Checklist**:
- [ ] Verify high-quality threads (good parent + good replies) rank at top
- [ ] Verify threads with exceptional replies surface even with weak parent comments
- [ ] Verify engagement (many replies) provides reasonable boost
- [ ] Compare ordering with simple upvote count to validate improvement

### Dynamic Rating/Hype Display in Comments (Nov 2025)
**Status**: ✅ Complete - User's comments now update in real-time
**Branch**: `feature/nested-comments`

**Problem**:
User's own comments and replies were showing static hype/rating values from the database instead of updating dynamically when the user changed their prediction or rating.

**Solution**:
- **UpcomingFightDetailScreen**: User's replies now use `selectedHype` (dynamic state) instead of static `reply.hypeRating`
- **CompletedFightDetailScreen**: User's reviews and replies now use `rating` (dynamic state) instead of static `fight.userReview.rating` or `reply.rating`
- Non-user comments continue to use static database values (correct behavior)

**Implementation**:
- Check if comment/reply belongs to current user (`isMyReply` flag)
- If user's own: display current state value (e.g., `rating`, `selectedHype`)
- If other user's: display static database value (e.g., `reply.rating`, `reply.hypeRating`)

**Key Files**:
- `packages/mobile/components/UpcomingFightDetailScreen.tsx:1821` - Reply hype rating uses `isMyReply ? selectedHype : reply.hypeRating`
- `packages/mobile/components/CompletedFightDetailScreen.tsx:1830` - User's top-level review uses `rating` state
- `packages/mobile/components/CompletedFightDetailScreen.tsx:2028` - Reply rating uses `isMyReply ? rating : (reply.rating || 0)`

**Result**: User's comments now accurately reflect their current predictions/ratings in real-time without page refresh.

### Comment and Reply Limits (Nov 2025)
**Status**: ✅ Complete - Spam prevention for comments and replies
**Branch**: `feature/nested-comments`

**Implementation Summary**:
To prevent spam and ensure no single user dominates the discussion on any fight, two limits have been implemented:

**Limits Enforced**:
1. **Max 10 replies per parent comment** - Prevents any single comment thread from becoming unwieldy
2. **Max 5 total comments/replies per user per fight** - Prevents one user from replying to every comment

**Backend Validation** (`routes/fights.ts`):
- Pre-flight comments (upcoming fights):
  - Lines 1568-1580: Check reply count on parent comment (max 10)
  - Lines 1582-1595: Check user's total comments on fight (max 5)
- Fight reviews (completed fights):
  - Lines 1100-1112: Check reply count on parent review (max 10)
  - Lines 1114-1127: Check user's total reviews on fight (max 5)

**Error Codes**:
- `MAX_REPLIES_REACHED`: Parent comment/review has 10 replies
- `USER_MAX_COMMENTS_REACHED`: User has 5 comments/replies on fight

**Frontend Toast Messages**:
- `UpcomingFightDetailScreen.tsx:514-517`: Displays toast when limit reached
- `CompletedFightDetailScreen.tsx:711-714`: Displays toast when limit reached
- Message: "You've reached the maximum of 5 comments posted on this fight"
- Message: "This comment has reached the maximum number of replies (10)"

**User Experience**:
- Toast appears when user attempts to save their Nth (limit) comment/reply
- Clear error message explains which limit was reached
- Prevents form submission when limit is reached

**Key Files**:
- `packages/backend/src/routes/fights.ts:1568-1595` (pre-fight limits)
- `packages/backend/src/routes/fights.ts:1100-1127` (post-fight limits)
- `packages/mobile/components/UpcomingFightDetailScreen.tsx:510-521` (error handling)
- `packages/mobile/components/CompletedFightDetailScreen.tsx:707-718` (error handling)

**Testing Checklist**:
- [ ] User reaches 5 total comments on a fight (shows toast)
- [ ] User tries to reply to comment with 10 replies (shows toast)
- [ ] Error messages are clear and actionable
- [ ] Form submission is prevented when limit reached
- [ ] Works on both upcoming and completed fights

### Search (Nov 2025)
- Global search: fighters, fights, events, promotions
- Multi-word matching: "Jon Jones", "Jon UFC"
- Event sorting: upcoming first, then past (most recent)
- Dedicated `/search-results` screen with reusable components

### Pre-Fight Comments (Nov 2025)
- Users comment on upcoming fights (max 500 chars)
- Upsert pattern: one comment per user per fight
- API: `POST /api/fights/:id/pre-fight-comment`, `GET /api/fights/:id/pre-fight-comments`
- **Now supports nested replies** (see Nested Comments System above)

### Performance Optimizations (Nov 2025)
- Combined stats API calls using `Promise.all`
- 50% fewer requests: 160→80 on lists, 2→1 on details

### UI Improvements (Nov 2025)
- Fighter cards: replaced W-L-D with avg rating
- Fight cards: heatmap squares, yellow underline for predictions
- Navigation: Stack-inside-Tabs, root-level event route
- Custom alerts: styled modals with auto-dismiss

## Development Guidelines

### TypeScript
- **Generic syntax in .tsx**: Use trailing comma `<T,>` not `<T>`
- **Type-check**: Run `pnpm type-check` before major changes

### Debugging Protocol
1. **Config audit**: Check `USE_PRODUCTION_API`, `API_BASE_URL`, `DATABASE_URL`
2. **Add logging**: Mobile → Backend → Database
3. **Verify DB**: Check for multiple `PrismaClient()` instances
4. **Evidence-based**: Test with curl, check Render logs - don't guess
5. **Common issues**: Multiple auth middleware, mismatched API settings, stale Metro cache

**Rule**: If 3+ fixes fail → STOP → Audit all config files

### Code Quality
- **Comments required**: Function headers, complex logic (WHY not WHAT), section markers
- **Commit process**: Update CLAUDE.md first, commit code + docs together
- **File operations**: Prefer editing existing files over creating new ones

**See CLAUDE-ARCHIVE.md for detailed troubleshooting and setup guides**
