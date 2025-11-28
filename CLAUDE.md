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

## Recent Features

### Google Sign-In (Nov 2025)
**Status**: ✅ WORKING - Tested on Android device
**Branch**: `redesign-fight-card-components`

**Implementation**:
- Native Google Sign-In using `@react-native-google-signin/google-signin`
- Backend Fastify route `POST /api/auth/google` verifies ID token
- Creates new users or links existing email accounts to Google
- Account picker shows every time (signOut before signIn)

**Key Files**:
- `packages/backend/src/routes/auth.fastify.ts` - `/google` endpoint (lines 1184-1400)
- `packages/mobile/hooks/useGoogleAuth.ts` - Native Google Sign-In hook
- `packages/mobile/components/GoogleSignInButton.tsx` - Reusable button component
- `packages/mobile/app.json` - Added `@react-native-google-signin/google-signin` plugin

**Configuration (Already Done)**:
- Google Cloud Console project created
- OAuth credentials: Web, iOS, Android client IDs
- Web Client ID: `499367908516-f5qu2rjeot6iqnhld7o3tg71tqdqlngk.apps.googleusercontent.com`
- Backend `.env`: `GOOGLE_CLIENT_ID` configured
- Mobile `.env`: All three client IDs configured
- EAS development build includes native Google Sign-In module

**Testing Results** (Nov 26, 2025):
- [x] "Continue with Google" button appears on login/register screens
- [x] Tapping opens Google account picker (shows all Google accounts)
- [x] Selecting account authenticates successfully
- [x] New user created with Google profile data
- [x] JWT tokens returned and stored correctly

---

### Apple Sign-In (Nov 2025)
**Status**: ✅ Code Complete - Needs iOS testing
**Branch**: `redesign-fight-card-components`

**Implementation**:
- Native Apple Sign-In using `expo-apple-authentication`
- Backend Fastify route `POST /api/auth/apple` verifies identity token using `apple-signin-auth`
- Creates new users or links existing email accounts to Apple
- Only appears on iOS devices (Apple requirement)

**Key Files**:
- `packages/backend/src/routes/auth.fastify.ts` - `/apple` endpoint
- `packages/mobile/hooks/useAppleAuth.ts` - Apple Sign-In hook
- `packages/mobile/components/AppleSignInButton.tsx` - Reusable button component (iOS only)
- `packages/mobile/store/AuthContext.tsx` - `loginWithApple` function

**Apple Sign-In Specifics**:
- Email and name only provided on FIRST sign-in (Apple privacy feature)
- Subsequent sign-ins only have identity token
- Backend stores Apple ID (`appleId`) to match returning users
- Button follows Apple HIG: black on light mode, white on dark mode

**Testing Checklist**:
- [ ] "Continue with Apple" button appears on iOS login/register screens
- [ ] Button hidden on Android (Apple Sign-In not available)
- [ ] Tapping opens Apple Sign-In UI
- [ ] New user created with Apple profile data
- [ ] Returning Apple user (no email/name) still authenticates
- [ ] JWT tokens returned and stored correctly

---

### Onboarding Flow Screens (Nov 2025)
**Status**: ✅ Complete - Email verification tested and working end-to-end
**Branch**: `redesign-fight-card-components`

**What Was Implemented**:
1. **Welcome Screen** - Landing page with Google + Email sign-up options
2. **Email Verification Flow** - Pending/success screens, verification banner with resend
3. **Forgot Password Flow** - Request reset + password reset screens

**Key Files Created**:
- `packages/mobile/app/(auth)/welcome.tsx` - Landing screen
- `packages/mobile/app/(auth)/verify-email-pending.tsx` - Post-registration screen
- `packages/mobile/app/(auth)/verify-email-success.tsx` - Deep link handler
- `packages/mobile/app/(auth)/forgot-password.tsx` - Password reset request
- `packages/mobile/app/(auth)/reset-password.tsx` - New password entry
- `packages/mobile/components/VerificationBanner.tsx` - Banner with resend button
- `packages/mobile/services/api.ts` - `resendVerificationEmail()` method

**Web Landing Pages** (deployed to goodfights.app):
- `verify-email.html` - Handles email verification links
- `reset-password.html` - Handles password reset links

**Backend Configuration**:
- SendGrid SMTP configured in Render env vars
- CORS allows `https://goodfights.app` in `server.ts` (NOT `cors.ts`)
- No `SKIP_EMAIL_VERIFICATION` needed (emails always sent)

**Render Environment Variables Required**:
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
SMTP_FROM=noreply@goodfights.app
FRONTEND_URL=https://goodfights.app
```

**IMPORTANT - CORS Configuration**:
- CORS is configured in `packages/backend/src/server.ts` using `@fastify/cors`
- The file `packages/backend/src/middleware/cors.ts` is NOT used (Express middleware)
- To add allowed origins, edit the `origin` array in `server.ts:103-118`

---

### TODO: Remaining Testing

**Email Verification** - ✅ COMPLETE (Nov 28, 2025):
- [x] New registration sends verification email
- [x] "Resend" button in banner works
- [x] Verification link opens success page
- [x] VerificationBanner shows for unverified users
- [x] Banner disappears after verification (on app foreground)

**Forgot Password**:
- [ ] "Forgot password?" link on login goes to forgot-password screen
- [ ] Entering email sends reset link
- [ ] Reset password screen validates password strength
- [ ] Password reset succeeds and redirects to login

**Welcome Screen**:
- [ ] Feature list displays correctly
- [ ] Google sign-up button works
- [ ] "Sign up with Email" goes to register screen
- [ ] "Sign In" link goes to login screen

---

### TODO: Future Enhancements (Nice-to-Haves)

- [x] **Apple Sign-In** - Required for App Store if Google is offered (Done Nov 2025)
- [ ] **Biometric Authentication** - Face ID / Touch ID for returning users
- [ ] **Remember Me** - Auto-login with stored refresh token
- [ ] **Onboarding Tutorial** - Swipeable carousel for first-time users
- [ ] **Follow Fighters on Signup** - Grid of popular fighters to follow
- [ ] **Notification Permission Prompt** - Custom screen explaining benefits
- [ ] **Terms/Privacy Checkbox** - Required on registration form
- [ ] **Remove Dev Login Buttons** - Hide test credentials in production

---

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
- `UpcomingFightDetailScreen.tsx:511-513`: Success toast after saving 5th comment
- `CompletedFightDetailScreen.tsx:708-710`: Success toast after saving 5th comment
- `UpcomingFightDetailScreen.tsx:518-521`: Error toast when attempting 6th comment
- `CompletedFightDetailScreen.tsx:715-718`: Error toast when attempting 6th comment
- Success message: "You have now reached the maximum comments allowed for one fight (5)"
- Error message (when blocked): "You've reached the maximum of 5 comments posted on this fight"
- Error message (reply limit): "This comment has reached the maximum number of replies (10)"

**User Experience**:
- **After saving 5th comment**: Success toast informs user they've reached the limit
- **When attempting 6th comment**: Error toast prevents submission and explains limit
- Backend returns `reachedCommentLimit: true` flag after successful save
- Clear messages explain which limit was reached

**Key Files**:
- `packages/backend/src/routes/fights.ts:1656-1671` (pre-flight reply response with limit flag)
- `packages/backend/src/routes/fights.ts:1163-1178` (fight review reply response with limit flag)
- `packages/backend/src/routes/fights.ts:1611-1624` (pre-flight validation checks)
- `packages/backend/src/routes/fights.ts:1114-1127` (fight review validation checks)
- `packages/mobile/components/UpcomingFightDetailScreen.tsx:505-514` (success + error handling)
- `packages/mobile/components/CompletedFightDetailScreen.tsx:702-711` (success + error handling)

**Testing Checklist**:
- [x] User saves 5th comment (shows success toast: "You have now reached...")
- [ ] User attempts 6th comment (shows error toast: "You've reached...")
- [ ] User tries to reply to comment with 10 replies (shows error toast)
- [ ] Messages are clear and actionable
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
