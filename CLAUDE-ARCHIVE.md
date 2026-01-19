# CLAUDE-ARCHIVE.md

Detailed setup guides, troubleshooting procedures, and feature implementation details for FightCrewApp.

**Main docs**: See `CLAUDE.md` for quick reference and active development info.

---

## Table of Contents
1. [Server Startup Procedures](#server-startup-procedures)
2. [Push Notifications Setup (FCM V1)](#push-notifications-setup-fcm-v1)
3. [Cloudflare R2 Image Storage Setup](#cloudflare-r2-image-storage-setup)
4. [Notification System Implementation](#notification-system-implementation)
5. [Live Event Tracker Implementation](#live-event-tracker-implementation)
6. [Data Scrapers](#data-scrapers)
7. [Recent Features (Detailed)](#recent-features-detailed)
8. [Performance Optimizations (Dec 2025)](#performance-optimizations-dec-2025)
9. [Feature History](#feature-history)
10. [Guest Access Implementation (Jan 2026)](#guest-access-implementation-jan-2026)

---

## Server Startup Procedures

### Full Startup Sequence

**CRITICAL PORTS**:
- Backend: **PORT 3008** (NOT 3001!)
- Expo/Metro: **PORT 8083** (NOT 8081!)
- Docker PostgreSQL: **PORT 5433** (NOT 5432!)
- Mobile API: `http://10.0.0.53:3008/api`

**Step-by-Step Procedure**:
```bash
# 1. Start Docker Desktop
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# Wait 30 seconds for Docker to initialize
# Verify: docker ps (should show PostgreSQL container)

# 2. Start Backend Server
cd packages/backend && PORT=3008 pnpm dev
# Wait for: "Server listening at http://10.0.0.53:3008"
# Verify: curl http://localhost:3008/health

# 3. Start Expo/Metro Bundler (NO --dev-client flag!)
cd packages/mobile && npx expo start --port 8083 --lan
# Scan QR code in Expo Go app on physical device

# 4. Verify API Connection
curl http://localhost:3008/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Troubleshooting Common Startup Issues

**Port Already in Use**:
```bash
# Find process using port 3008
netstat -ano | findstr ":3008"
# Output: TCP 0.0.0.0:3008 0.0.0.0:0 LISTENING 12345

# Kill the process
powershell Stop-Process -Id 12345 -Force

# Or nuclear option (kills all Node processes)
taskkill /F /IM node.exe
```

**Docker PostgreSQL Not Starting**:
```bash
# Check Docker status
docker ps -a

# Restart PostgreSQL container
docker restart fight-mobile-app-postgres-1

# Check logs if issues persist
docker logs fight-mobile-app-postgres-1
```

**Metro Bundler Cache Issues**:
```bash
# Clear Metro cache and restart
cd packages/mobile
npx expo start --port 8083 --lan --clear

# If that doesn't work, delete cache manually
rm -rf .expo
rm -rf node_modules/.cache
```

**Database Connection Errors**:
```bash
# Verify PostgreSQL is running on correct port
docker ps | grep 5433

# Test connection
cd packages/backend
pnpm prisma db pull

# If connection fails, check DATABASE_URL in .env
# Should be: postgresql://postgres:postgres@localhost:5433/fightcrewapp
```

---

## Push Notifications Setup (FCM V1)

**Status**: ✅ Complete - Working in EAS development builds (Build 11)

### Overview
Complete guide to setting up Firebase Cloud Messaging V1 for push notifications in a bare workflow React Native app. This setup requires BOTH client-side (Android native files) AND server-side (EAS credentials) configuration.

### Problem This Solves
Push notifications were failing with error: **"is not a registered push notification recipient or it is associated with a project that does not exist"**

**Root Cause**:
- App uses **bare workflow** (has `android` directory), so Firebase must be configured in native Android files
- FCM V1 credentials must be uploaded to EAS for **each build profile** separately (development, production, etc.)
- Simply adding `googleServicesFile` to app.json doesn't work for bare workflow apps

### Step 1: Firebase Console Setup

#### Enable Firebase Cloud Messaging API
1. Go to https://console.cloud.google.com/
2. Select project: "fight-app-ba5cd"
3. In the search bar, type: **"Firebase Cloud Messaging API"**
4. Click on the API result
5. Click **"ENABLE"** button
6. Wait for confirmation that API is enabled

#### Create FCM V1 Service Account
1. Go to https://console.firebase.google.com/
2. Select project: "fight-app-ba5cd"
3. Go to **Project Settings** (gear icon) → **Cloud Messaging** tab
4. Under "Cloud Messaging API (V1)" section, click **"Manage Service Accounts"**
5. This opens Google Cloud Console → IAM & Admin → Service Accounts
6. Click **"Create Service Account"** button
7. Enter service account details:
   - **Name**: "fcm-push-notifications"
   - **Description**: "Service account for FCM V1 push notifications"
8. Click **"Create and Continue"**
9. Grant role: Select **"Firebase Cloud Messaging API Admin"**
10. Click **"Continue"** → **"Done"**
11. Click on the newly created service account email
12. Go to **"Keys"** tab
13. Click **"Add Key"** → **"Create new key"**
14. Select **JSON** format
15. Click **"Create"**
16. Save the downloaded JSON file as `fcm-service-account.json`

**Important Notes**:
- **Legacy FCM API is deprecated** - use V1 API only
- **Don't use Account API tokens** - those are bearer tokens for API calls, NOT S3-compatible credentials
- The service account JSON contains private keys - **keep it secure**, don't commit to git
- The JSON file will be named something like `fight-app-ba5cd-a1b2c3d4e5f6.json`

### Step 2: Android Native Configuration

#### Copy google-services.json
```bash
# From packages/mobile/ directory
cp google-services.json android/app/google-services.json
```

**Verify the file is in the correct location**:
```
packages/mobile/
├── android/
│   └── app/
│       ├── google-services.json  ← Should be here
│       └── build.gradle
│   └── build.gradle
└── google-services.json  ← Original location
```

#### Add Google Services Plugin to app/build.gradle

File: `packages/mobile/android/app/build.gradle`

**Add this line at the TOP** (after existing `apply plugin` lines):
```gradle
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"
apply plugin: "com.google.gms.google-services"  // ← ADD THIS LINE
```

#### Add Google Services Classpath to build.gradle

File: `packages/mobile/android/build.gradle`

**Add this line in buildscript dependencies**:
```gradle
buildscript {
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
    classpath('com.google.gms:google-services:4.4.0')  // ← ADD THIS LINE
  }
}
```

### Step 3: Upload FCM Credentials to EAS

**CRITICAL**: You must upload FCM credentials to **EACH build profile separately**.

If you have `development`, `production`, and `preview` profiles, you must run this process 3 times (once per profile).

#### Command
```bash
cd packages/mobile
eas credentials
```

#### Steps (Repeat for EACH Profile)
1. Platform: Select **Android**
2. Build profile: Select **development** (or production, preview, etc.)
3. Select: **Google Service Account**
4. Select: **Manage your Google Service Account Key for Push Notifications (FCM V1)**
5. Select: **Set up a Google Service Account Key for Push Notifications (FCM V1)**
6. When prompted for JSON file: Choose **fcm-service-account.json** (the file you downloaded in Step 1)
7. Wait for "Credentials uploaded successfully" confirmation

#### Verify Credentials Are Uploaded
```bash
cd packages/mobile
eas credentials -p android
# Select your build profile (e.g., development)
# Look for: "Push Notifications (FCM V1): Google Service Account Key For FCM V1"
# Should show: ✅ Configured
```

**Common Mistake**: Uploading credentials to `production` profile but building with `development` profile. The credentials are **per-profile**, not global!

### Step 4: Build and Test

#### Build Development APK
```bash
cd packages/mobile
eas build --profile development --platform android
```

**Wait for build to complete** (10-15 minutes). You'll get a download link when done.

#### Install and Test
1. Download APK from build link
2. Install on Android device
3. Log in to the app
4. Go to: **Settings → Notifications → "Send Test Notification"**
5. You should receive a notification with:
   - App name and icon
   - Test message: "kooky butt butt" (as configured in backend)
   - Deep link to relevant screen

#### Test Notification Manually via Expo API
```bash
# Replace ExponentPushToken[xxx] with actual token from your device
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxxxxxxxx]",
    "title": "Manual Test",
    "body": "Testing push notifications",
    "data": {
      "screen": "events"
    }
  }'
```

### Troubleshooting

#### Error: "Unable to retrieve the FCM server key"
**Cause**: FCM credentials not uploaded for that specific build profile.
**Solution**: Run `eas credentials` and upload to the CORRECT profile (development vs production).

#### Error: "is not a registered push notification recipient"
**Cause**: FCM credentials uploaded to wrong profile (e.g., uploaded to production but built with development).
**Solution**: Upload credentials to the profile you're actually building with.

#### Error: Firebase initialization error
**Cause**: google-services.json not in `android/app/` directory.
**Solution**: Copy `google-services.json` to `packages/mobile/android/app/google-services.json`.

#### Notification not arriving on device
1. **Check Expo push token**: Go to Settings → Notifications in app, verify token shows up
2. **Test directly**: Use curl command above to test Expo's push service
3. **Check backend logs**: Verify notification was sent from backend
4. **Check device settings**: Ensure notifications are enabled for the app

### Files Modified

**Android Native**:
- `packages/mobile/android/app/google-services.json` (copied from root)
- `packages/mobile/android/app/build.gradle` (added Google Services plugin)
- `packages/mobile/android/build.gradle` (added Google Services classpath)

**App Configuration** (no changes needed):
- `packages/mobile/app.json` (already had googleServicesFile reference - ignored in bare workflow)
- `packages/mobile/eas.json` (credentials uploaded via CLI, not stored in file)

**Backend** (no changes needed):
- `packages/backend/src/routes/notifications.ts` (push logic already working)

### Project Details

**Firebase Project**:
- Project ID: `fight-app-ba5cd`
- Project Number: `1082468109842`
- Package Name: `com.fightcrewapp.mobile`

**EAS Project**:
- Project ID: `4a64b9f8-325e-4869-ab78-9e0674d18b32`
- Owner: `mikeprimak`

**Service Account**:
- Email: `fcm-push-notifications@fight-app-ba5cd.iam.gserviceaccount.com`
- Role: Firebase Cloud Messaging API Admin

### Build History

- **Build 1-7**: Various attempts with incomplete Firebase configuration
- **Build 8**: Added google-services.json and Gradle plugins (still failed - credentials uploaded to production profile)
- **Build 9-10**: Configuration errors with eas.json
- **Build 11**: ✅ **SUCCESS** - FCM V1 credentials properly uploaded to development profile

### Next Steps

**For Production Builds**:
1. Upload FCM credentials to `production` profile using same process as above
2. Build production APK: `eas build --profile production --platform android`
3. Test notifications work in production build
4. Submit to Google Play Store

**For iOS** (future work):
1. Configure APNs (Apple Push Notification service) in Firebase
2. Generate APNs authentication key in Apple Developer Console
3. Upload APNs certificates/keys to EAS
4. Build iOS development builds: `eas build --profile development --platform ios`
5. Test on iOS device

---

## Cloudflare R2 Image Storage Setup

**Status**: ✅ Complete - Configured 2025-11-12

### Why Cloudflare R2?

**Advantages**:
- **100% Free** for our scale (10GB storage, 1M reads/month free tier)
- **Global CDN** built-in for fast worldwide delivery
- **No egress fees** (unlike AWS S3 which charges for data transfer)
- **S3-compatible API** (easy to use, industry standard)
- **Reliable** - backed by Cloudflare's global infrastructure

**Cost Analysis**:
- Storage: 10 GB/month (enough for ~50,000 fighter images at 50KB each)
- Class A operations (uploads): 1M/month
- Class B operations (reads): 10M/month
- Egress: **Unlimited FREE** ← Biggest advantage over S3

**Our Usage**:
- ~500 fighters × 50KB = 25 MB
- ~50 events × 200KB = 10 MB
- **Total: ~35 MB** (well within 10 GB limit)
- **Monthly reads**: ~100K (well within 10M limit)

**Conclusion**: $0/month forever for our use case

### Complete Setup Guide

#### Step 1: Sign Up for Cloudflare
1. Go to https://www.cloudflare.com/
2. Click **"Sign Up"** (free account)
3. Complete email verification
4. No credit card required for free tier

#### Step 2: Create R2 Bucket
1. Log in to Cloudflare Dashboard
2. In left sidebar, click **"R2"** under "Storage & Databases"
3. Click **"Create bucket"** button
4. Bucket name: **"fightcrewapp-images"**
5. Location: Auto (Cloudflare chooses optimal location)
6. Click **"Create bucket"**

#### Step 3: Generate R2 API Token

**CRITICAL**: You must create an **R2 API Token**, NOT an Account API Token. These are different!

**Correct Path**:
1. In Cloudflare Dashboard, go to **R2** section (in sidebar)
2. Click **"Manage R2 API Tokens"** button (top right)
3. Scroll to **"Account API Tokens"** section (confusing name, but correct location)
4. Click **"Create API Token"** button
5. Configure token:
   - **Token name**: "fightcrewapp-backend"
   - **Permissions**: Select **"Workers R2 Storage: Edit"**
   - **TTL**: 1 year (or maximum allowed)
6. Click **"Create Token"**
7. **IMMEDIATELY COPY** both values (shown only once!):
   - **Access Key ID**: Copy to `R2_ACCESS_KEY` env var
   - **Secret Access Key**: Copy to `R2_SECRET_KEY` env var

**Wrong Path (DON'T DO THIS)**:
- ❌ Profile → API Tokens → Create Custom Token
- ❌ Looking for "R2" permission in Account API tokens (it's called "Workers R2 Storage")

**Common Mistakes**:
- Creating Account API Token (bearer token) instead of R2 API Token (S3 credentials)
- Trying to find "R2" permission in regular API tokens (it's called "Workers R2 Storage")
- Closing token creation page before copying keys (they're only shown once!)
- Sharing token credentials publicly (regenerate immediately if exposed)

#### Step 4: Get S3 Endpoint
1. Go to your R2 bucket (fightcrewapp-images)
2. Click **"Settings"** tab
3. Look for **"S3 API"** or **"Endpoint for S3 clients"** section
4. Copy the endpoint URL
5. Format: `https://XXXXXXXXXX.r2.cloudflarestorage.com`
6. Save to `R2_ENDPOINT` env var

#### Step 5: Enable Public Access
1. Still in bucket Settings tab
2. Find **"Public Development URL"** section
3. Click **"Enable"** button
4. Copy the generated URL
5. Format: `https://pub-xxxxxxxxxxxxx.r2.dev`
6. Save to `R2_PUBLIC_URL` env var

**Note**: This makes all objects in the bucket publicly readable via the .r2.dev URL. Perfect for fighter images and event banners.

#### Step 6: Add Environment Variables to Render

1. Log in to Render Dashboard
2. Navigate to your backend service
3. Click **"Environment"** tab (left sidebar)
4. Add the following 5 environment variables:

```bash
R2_ENDPOINT="https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com"
R2_ACCESS_KEY="your-access-key-id-from-step-3"
R2_SECRET_KEY="your-secret-access-key-from-step-3"
R2_BUCKET="fightcrewapp-images"
R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"
```

5. Click **"Save Changes"**
6. Render will automatically redeploy your backend with new env vars

### Implementation Details

#### Storage Structure
```
fightcrewapp-images/  (R2 bucket)
├── fighters/
│   ├── jon-jones-abc123.jpg
│   ├── alex-pereira-def456.jpg
│   ├── israel-adesanya-ghi789.jpg
│   └── ...
├── events/
│   ├── ufc-320-banner-jkl012.jpg
│   ├── ufc-319-banner-mno345.jpg
│   └── ...
└── news/
    └──  (future: news article images)
```

#### Core Service Functions

File: `packages/backend/src/services/imageStorage.ts`

```typescript
// Main upload function - downloads from UFC.com, uploads to R2
uploadImageToR2(sourceUrl: string, destinationPath: string): Promise<string>

// Convenience wrappers
uploadFighterImage(fighterName: string, sourceUrl: string): Promise<string>
uploadEventImage(eventName: string, sourceUrl: string): Promise<string>
```

**Features**:
- **Automatic fallback**: If R2 not configured (missing env vars), uses UFC.com URLs directly
- **Duplicate prevention**: Checks if image exists in R2 before re-uploading
- **SEO-friendly filenames**: "jon-jones-abc123.jpg" with hash for uniqueness
- **Cache headers**: Sets 1-year cache for optimal CDN performance
- **Error handling**: Graceful degradation on upload failures, logs errors but doesn't crash

#### Integration with Daily Scraper

File: `packages/backend/src/services/ufcDataParser.ts`

```typescript
// Fighter headshots
if (imageUrl && imageUrl.startsWith('http')) {
  const r2Url = await uploadFighterImage(fighterName, imageUrl);
  imageUrl = r2Url; // Use R2 URL if upload succeeded
}

// Event banners
if (bannerUrl && bannerUrl.startsWith('http')) {
  const r2Url = await uploadEventImage(eventName, bannerUrl);
  bannerUrl = r2Url;
}
```

### Testing R2 Integration

#### After Render Deployment

Once Render finishes deploying with the R2 environment variables, test the integration:

**Manual Scraper Test**:
```bash
curl -X POST https://fightcrewapp-backend.onrender.com/api/admin/scrape-daily
```

**Watch Render Logs** for R2 activity:
```
[R2] Downloading image: https://dmxg5wxfqgb4u.cloudfront.net/styles/r1_768x384/s3/2024-11/Jones_Jon_L_10-19.png
[R2] Uploading to: fighters/jon-jones-abc123.jpg (45.23 KB)
[R2] Upload successful: https://pub-xxxxx.r2.dev/fighters/jon-jones-abc123.jpg
```

**Verify Images in R2 Dashboard**:
1. Go to Cloudflare → R2 → fightcrewapp-images bucket
2. Browse to `fighters/` and `events/` folders
3. Click on an image → Copy URL
4. Paste URL in browser to verify it loads

**Verify Images in Database**:
```sql
-- Check fighter images
SELECT firstName, lastName, imageUrl FROM Fighter LIMIT 10;
-- Should show https://pub-xxxxx.r2.dev/fighters/... URLs

-- Check event images
SELECT name, bannerImageUrl FROM Event LIMIT 10;
-- Should show https://pub-xxxxx.r2.dev/events/... URLs
```

**Fallback Behavior** (if R2 fails):
- App automatically uses UFC.com URLs
- Check Render logs for: `[R2] Upload failed, using UFC.com URL`
- No impact on user experience

### Files Modified

**Backend Services**:
- `packages/backend/src/services/imageStorage.ts`: New R2 upload service (296 lines)
- `packages/backend/src/services/ufcDataParser.ts`: Integrated R2 uploads for fighters and events

**Configuration**:
- `packages/backend/.env.example`: Added R2 configuration documentation
- `packages/backend/package.json`: Added `@aws-sdk/client-s3` dependency

**No changes to mobile app** - images are served via URLs, so mobile app doesn't care where they're hosted.

---

## Notification System Implementation

**Status**: ✅ Complete - Single unified rule-based system (2025-11-08)

### Overview
The app uses a **single, extensible rule-based notification system** for ALL fight notifications. There is NO legacy code - everything from manual fight follows to fighter follows to hyped fights uses the same underlying architecture.

### Core Architecture

#### Database Tables

**UserNotificationRule**:
```prisma
model UserNotificationRule {
  id                   String   @id @default(uuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name                 String   // e.g., "Manual Fight Follow: {fightId}", "Fighter Follow: {fighterId}", "Hyped Fights"
  conditions           Json     // JSONB: { fightIds?, fighterIds?, minHype?, promotions?, etc. }
  notifyMinutesBefore  Int      // 15 for most, customizable per rule
  priority             Int      // Higher priority wins if multiple rules match (manual=10, fighter=5, hyped=0)
  isActive             Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  matches FightNotificationMatch[]
}
```

**FightNotificationMatch**:
```prisma
model FightNotificationMatch {
  id               String   @id @default(uuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fightId          String
  fight            Fight    @relation(fields: [fightId], references: [id], onDelete: Cascade)
  ruleId           String
  rule             UserNotificationRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  isActive         Boolean  @default(true)  // Allows per-fight notification override
  notificationSent Boolean  @default(false)
  matchedAt        DateTime @default(now())

  @@unique([userId, fightId, ruleId])
}
```

#### Rule Engine

File: `packages/backend/src/services/notificationRuleEngine.ts` (240 lines)

**Core Functions**:

```typescript
// Checks if a fight matches rule conditions
evaluateFightAgainstConditions(fightId: string, conditions: NotificationRuleConditions): Promise<boolean>

// Returns ALL reasons why user will be notified about a fight
getNotificationReasonsForFight(userId: string, fightId: string): Promise<{
  willBeNotified: boolean;
  reasons: Array<{
    type: 'manual' | 'fighter' | 'rule';
    source: string;  // Rule name
    ruleId: string;
    isActive: boolean;  // Can be disabled per-fight
  }>;
}>

// Updates cached matches when rules change or new fights are added
syncRuleMatches(ruleId: string): Promise<number>
```

**Available Condition Types**:
```typescript
interface NotificationRuleConditions {
  fightIds?: string[];      // Manual fight follows (exact match)
  fighterIds?: string[];    // Fighter follows (either fighter in fight)
  minHype?: number;         // Hyped fights filter (≥8.5)
  maxHype?: number;         // Hype ceiling filter
  promotions?: string[];    // UFC, Bellator, PFL, ONE, etc.
  daysOfWeek?: number[];    // 0=Sunday, 6=Saturday
  notDaysOfWeek?: number[]; // Exclude specific days
  // Easily extensible: add isMainEvent?, weightClasses?, etc.
}
```

### Three Notification Flows

#### 1. Manual Fight Follows

**User Flow**: Fight Detail Screen → Three-Dots Menu → "Notify when fight starts"

**Backend Flow**:
```
POST /api/fights/:id/follow
  ↓
manageManualFightRule(userId, fightId, true)
  ↓
Creates UserNotificationRule:
{
  name: "Manual Fight Follow: {fightId}",
  conditions: { fightIds: [fightId] },
  priority: 10,  // Highest priority
  notifyMinutesBefore: 15
}
  ↓
syncRuleMatches(ruleId) → Creates FightNotificationMatch
```

**Unfollowing**:
```
DELETE /api/fights/:id/unfollow
  ↓
manageManualFightRule(userId, fightId, false)
  ↓
Updates UserNotificationRule: isActive = false
```

**Files**: `routes/index.ts:1342-1420`, `services/notificationRuleHelpers.ts:8-38`

#### 2. Fighter Follows

**User Flow**: Fighter Screen → Follow Button → "Notify for upcoming fights" toggle

**Backend Flow**:
```
POST /api/fighters/:id/follow
  ↓
Creates UserFighterFollow record
  ↓
manageFighterNotificationRule(userId, fighterId, true)
  ↓
Creates UserNotificationRule:
{
  name: "Fighter Follow: {fighterId}",
  conditions: { fighterIds: [fighterId] },
  priority: 5,  // Medium priority
  notifyMinutesBefore: 15
}
  ↓
syncRuleMatches(ruleId) → Creates FightNotificationMatch for ALL fights with this fighter
```

**Notification Toggle**:
```
PATCH /api/fighters/:id/notification-preferences
  ↓
Updates UserNotificationRule: isActive = true/false
  ↓
Enables/disables notifications for all fights with this fighter
```

**Files**: `routes/index.ts:1014-1024,1256-1260`, `services/notificationRuleHelpers.ts:40-70`

#### 3. Hyped Fights

**User Flow**: Settings → Notifications → "Notify for hyped fights" toggle

**Backend Flow**:
```
PUT /api/notifications/preferences
  ↓
manageHypedFightsRule(userId, enabled)
  ↓
Creates UserNotificationRule:
{
  name: "Hyped Fights",
  conditions: { minHype: 8.5 },
  priority: 0,  // Lowest priority
  notifyMinutesBefore: 15
}
  ↓
syncRuleMatches(ruleId) → Creates FightNotificationMatch for ALL fights with hype ≥8.5
```

**Reading State**:
```
GET /api/notifications/preferences
  ↓
Queries UserNotificationRule where name = "Hyped Fights"
  ↓
Returns isActive status in response
```

**Files**: `routes/notifications.ts:23-68,169-218`

### Helper Functions Pattern

File: `packages/backend/src/services/notificationRuleHelpers.ts` (70 lines)

All notification types use the same pattern:

```typescript
async function manageXRule(userId: string, entityId: string, enabled: boolean) {
  const RULE_NAME = 'Rule Name';
  const RULE_CONDITIONS = { /* conditions */ };
  const NOTIFY_MINUTES_BEFORE = 15;

  // Find existing rule
  const existingRule = await prisma.userNotificationRule.findFirst({
    where: { userId, name: RULE_NAME }
  });

  if (existingRule) {
    // Update existing rule
    await prisma.userNotificationRule.update({
      where: { id: existingRule.id },
      data: { isActive: enabled }
    });
    if (enabled) {
      // Rebuild matches when re-enabled
      await notificationRuleEngine.syncRuleMatches(existingRule.id);
    }
  } else if (enabled) {
    // Create new rule
    const newRule = await prisma.userNotificationRule.create({
      data: {
        userId,
        name: RULE_NAME,
        conditions: RULE_CONDITIONS,
        notifyMinutesBefore: NOTIFY_MINUTES_BEFORE,
        priority: X,
        isActive: true
      }
    });
    // Create matches for all fights that match conditions
    await notificationRuleEngine.syncRuleMatches(newRule.id);
  }
}
```

### Fight Notification Data in API Responses

**Fight List Endpoints** (`GET /api/fights`, `/api/community/top-upcoming-fights`, etc.):

```typescript
// Each fight includes:
{
  ...fightData,
  isFollowing: boolean,                    // True if user has manual fight follow rule
  isFollowingFighter1: boolean,            // True if user follows fighter 1
  isFollowingFighter2: boolean,            // True if user follows fighter 2
  notificationReasons: {                   // ALL reasons user will be notified
    willBeNotified: boolean,               // Overall flag
    reasons: [
      {
        type: 'manual',
        source: 'Manual Fight Follow: uuid',
        ruleId: 'uuid',
        isActive: true  // Can be disabled per-fight
      },
      {
        type: 'fighter',
        source: 'Fighter Follow: uuid',
        ruleId: 'uuid',
        isActive: true
      },
      {
        type: 'rule',
        source: 'Hyped Fights',
        ruleId: 'uuid',
        isActive: true
      }
    ]
  }
}
```

**Query Pattern** (used in routes/fights.ts, routes/community.ts):

```typescript
// 1. Get followed fighters for UI display
const followedFighters = await prisma.userFighterFollow.findMany({
  where: { userId, fighterId: { in: uniqueFighterIds } },
  select: { fighterId: true }  // NO notification fields - those are in rules
});
const followedFighterIds = new Set(followedFighters.map(ff => ff.fighterId));

// 2. Get comprehensive notification data from unified rule system
const notificationReasons = await notificationRuleEngine.getNotificationReasonsForFight(userId, fightId);

// 3. Populate response
transformed.isFollowingFighter1 = followedFighterIds.has(fight.fighter1Id);
transformed.isFollowingFighter2 = followedFighterIds.has(fight.fighter2Id);
transformed.isFollowing = notificationReasons.reasons.some(r => r.type === 'manual' && r.isActive);
transformed.notificationReasons = notificationReasons;
```

### Per-Fight Notification Overrides

**Use Case**: User follows Jon Jones but doesn't want notification for a specific fight.

**Implementation**:
- Updates `FightNotificationMatch.isActive = false` for that specific fight+rule combination
- Fight remains matched to rule (doesn't delete the match)
- Notification won't be sent because `isActive = false`
- User can re-enable later without re-creating the rule

**UI Location**: Fight Detail Screen → Three-Dots Menu → Toggle notification for that fight

**Backend**:
```typescript
PATCH /api/fighters/:id/notification-preferences
{
  "fightId": "uuid",  // Optional: if provided, only affects this specific fight
  "enabled": false
}
  ↓
Updates FightNotificationMatch where userId + fightId + ruleId:
  isActive = false
```

### Adding New Notification Types

**Example**: "Main Events Only" notification type

**Step 1**: Create Helper Function

File: `packages/backend/src/services/notificationRuleHelpers.ts`

```typescript
export async function manageMainEventsRule(userId: string, enabled: boolean) {
  const RULE_NAME = 'Main Events Only';
  const RULE_CONDITIONS = { isMainEvent: true };
  const NOTIFY_MINUTES_BEFORE = 15;
  const PRIORITY = 3;  // Between fighter follows (5) and hyped fights (0)

  // ... follow pattern above
}
```

**Step 2**: Add Condition Type

File: `packages/backend/src/services/notificationRuleEngine.ts`

```typescript
interface NotificationRuleConditions {
  fightIds?: string[];
  fighterIds?: string[];
  minHype?: number;
  maxHype?: number;
  promotions?: string[];
  daysOfWeek?: number[];
  notDaysOfWeek?: number[];
  isMainEvent?: boolean;  // ← ADD THIS
}
```

**Step 3**: Add Evaluation Logic

File: `packages/backend/src/services/notificationRuleEngine.ts`

```typescript
async evaluateFightAgainstConditions(fightId: string, conditions: NotificationRuleConditions): Promise<boolean> {
  const fight = await prisma.fight.findUnique({ where: { id: fightId } });

  // ... existing checks ...

  // Check isMainEvent condition
  if (conditions.isMainEvent !== undefined) {
    if (fight.orderOnCard !== 1) {  // Main event is orderOnCard=1
      return false;
    }
  }

  return true;
}
```

**Step 4**: Expose in API

File: `packages/backend/src/routes/notifications.ts`

```typescript
// GET /api/notifications/preferences
// Add to response:
const mainEventsRule = await prisma.userNotificationRule.findFirst({
  where: { userId, name: 'Main Events Only' }
});
response.notifyMainEvents = mainEventsRule?.isActive ?? false;

// PUT /api/notifications/preferences
// Add to request body:
if (typeof notifyMainEvents === 'boolean') {
  await manageMainEventsRule(userId, notifyMainEvents);
}
```

### Migration History

**2025-11-08** (`20251108010000_remove_all_legacy_notification_system`):
- **Removed**: `FightAlert` table entirely (old system)
- **Removed**: `User.notifyFollowedFighterFights`, `User.notifyPreEventReport`, `User.notifyHypedFights` (moved to rules)
- **Removed**: `UserFighterFollow.dayBeforeNotification`, `UserFighterFollow.startOfFightNotification` (moved to rules)
- **Updated**: ALL backend code to use unified rule system
- **Files modified**: 6 route files, 1 controller, 2 service files

**Result**: Single cohesive notification system with NO legacy code fragments.

### UI Implementation

#### Notification Indicators

**Yellow Bell Icon** (`#F5C518`):
- Appears on `UpcomingFightCard` when `notificationReasons.willBeNotified = true`
- Replaces "vs" text in fight card
- Appears in header of `UpcomingFightDetailScreen`

**Files**: `components/fight-cards/UpcomingFightCard.tsx`, `components/UpcomingFightDetailScreen.tsx`

#### FightDetailsMenu Component

**Location**: Top-right of fight detail screens (three-dots vertical ellipsis icon)

**Shows**:
- "Notify when fight starts" toggle for direct fight follows
- "Following [Fighter Name]" sections for each followed fighter with notification toggle
- Toggle allows disabling fight notification without unfollowing fighter

**Files**: `components/FightDetailsMenu.tsx`

#### Toast Notifications

**Implementation**: Green bell icon with "You will be notified before this fight." message

**Behavior**:
- Slides up from bottom
- 2 second auto-dismiss
- Matches fighter screen notification pattern for consistency

**Files**: `components/CustomToast.tsx`

#### Query Invalidation

**Problem**: Fight cards not updating when notifications toggled from child screens

**Solution** (2025-11-08):
- Added `useFocusEffect` to upcoming events screen to invalidate queries on focus
- Added `refetchOnMount: 'always'` and `refetchOnWindowFocus: true` to fight queries
- Bell icon now uses ONLY `notificationReasons.willBeNotified` as source of truth

**Files**: `app/(tabs)/events/index.tsx`, `components/fight-cards/UpcomingFightCard.tsx`

### Key Files

**Database**:
- `prisma/schema.prisma`: UserNotificationRule + FightNotificationMatch tables

**Backend Services**:
- `services/notificationRuleEngine.ts`: Core evaluation engine (240 lines)
- `services/notificationRuleHelpers.ts`: Helper functions for each notification type (70 lines)

**Backend Routes**:
- `routes/notifications.ts`: Notification preferences API (262 lines)
- `routes/notificationRules.ts`: Advanced rule management API (future)
- `routes/fights.ts`: Fight endpoints with notification data (244-278, 474-513)
- `routes/index.ts`: Fighter/fight follow endpoints (1014-1024, 1256-1260, 1342-1420)

**Mobile UI**:
- `components/FightDetailsMenu.tsx`: Three-dots menu for fight detail screens
- `components/UpcomingFightCard.tsx`: Bell icon indicator
- `components/UpcomingFightDetailScreen.tsx`: Header bell icon
- `app/(tabs)/events/index.tsx`: Query invalidation logic

---

## Live Event Tracker Implementation

**Status**: ✅ Complete - Daily scraper parity (2025-11-12)

### Overview
Real-time fight tracking system that uses the exact same data handling utilities and patterns as the extensively-tested daily UFC scraper, ensuring consistency and robustness.

### Problem This Solved
Live tracker and daily scraper were using different approaches, risking:
- Inconsistent fighter data (gender, weight class, nicknames)
- Duplicate fighter records
- Missing fight metadata
- Name parsing errors (breaking on nicknames)

### Solution: Shared Utility Functions

**Three Core Utilities** (copied from daily scraper):

```typescript
// 1. Parse fighter names with nickname handling
parseFighterName(fullName: string): {
  firstName: string;
  lastName: string;
  nickname: string | null;
}
// Example: "Jon 'Bones' Jones" → { firstName: "Jon", lastName: "Jones", nickname: "Bones" }

// 2. Convert UFC weight class strings to database enums
mapWeightClass(ufcWeightClass: string): WeightClass | null
// Example: "Lightweight" → LIGHTWEIGHT, "Women's Bantamweight" → WOMENS_BANTAMWEIGHT

// 3. Infer gender from weight class division
inferGenderFromWeightClass(weightClass: WeightClass | null): Gender
// Example: WOMENS_BANTAMWEIGHT → FEMALE, LIGHTWEIGHT → MALE
```

### Fighter Upsert Pattern

**Same as daily scraper** - uses `firstName_lastName` unique constraint:

```typescript
async function findOrCreateFighter(fullName: string, weightClass: WeightClass | null) {
  const { firstName, lastName, nickname } = parseFighterName(fullName);
  const gender = inferGenderFromWeightClass(weightClass);

  // Try to find existing fighter
  let fighter = await prisma.fighter.findUnique({
    where: { firstName_lastName: { firstName, lastName } }
  });

  if (fighter) {
    // UPDATE MODE: Preserve W-L-D record and images, update gender/weight class/nickname
    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        nickname: nickname || fighter.nickname,
        weightClass: weightClass || fighter.weightClass,
        gender: gender
      }
    });
  } else {
    // CREATE MODE: Minimal record with defaults (0-0-0, inferred gender, active)
    fighter = await prisma.fighter.create({
      data: {
        firstName,
        lastName,
        nickname,
        weightClass,
        gender,
        wins: 0,
        losses: 0,
        draws: 0,
        isActive: true
      }
    });
  }

  return fighter;
}
```

**Key Points**:
- Updates preserve existing data (W-L-D record, images)
- Daily scraper fills in complete details later
- Prevents duplicate fighter records
- Correctly handles women's divisions

### Fight Metadata Handling

**Matches daily scraper fields exactly**:

```typescript
interface LiveFightUpdate {
  // Basic info
  fighter1Name: string;
  fighter2Name: string;

  // Metadata (same as daily scraper)
  cardType: 'Main Card' | 'Prelims' | 'Early Prelims';
  weightClass: WeightClass | null;
  isTitle: boolean;
  titleName: string | null;  // Auto-generated: "UFC Lightweight Championship"
  scheduledRounds: number;   // 5 for title fights, 3 for regular
  orderOnCard: number;       // 1 = main event, higher = earlier prelim

  // Live tracking
  currentRound: number;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  // ... other live fields
}
```

**Fight Creation**:

```typescript
const fight = await prisma.fight.create({
  data: {
    eventId,
    fighter1Id,
    fighter2Id,
    cardType: update.cardType,
    weightClass: update.weightClass,
    isTitle: update.isTitle,
    titleName: update.isTitle ? `UFC ${update.weightClass} Championship` : null,
    scheduledRounds: update.isTitle ? 5 : 3,
    orderOnCard: update.orderOnCard,
    status: update.status,
    currentRound: update.currentRound,
    // ... other fields
  }
});
```

### Dynamic Fight Card Changes

#### New Fights Added Mid-Event

```typescript
// Scenario: Fighter replacement announced 2 hours before event
if (!existingFight && eventHasStarted) {
  console.log(`[LiveTracker] New fight detected: ${fighter1.firstName} ${fighter1.lastName} vs ${fighter2.firstName} ${fighter2.lastName}`);

  // Create fight with full metadata
  const newFight = await prisma.fight.create({
    data: {
      eventId,
      fighter1Id: fighter1.id,
      fighter2Id: fighter2.id,
      cardType: update.cardType,
      weightClass: update.weightClass,
      isTitle: update.isTitle,
      titleName: update.isTitle ? generateTitleName(update.weightClass) : null,
      scheduledRounds: update.isTitle ? 5 : 3,
      orderOnCard: update.orderOnCard,
      status: 'Scheduled'
    }
  });
}
```

#### Fight Cancellations

**Signature-based tracking** detects missing fights:

```typescript
// Generate unique signature for each fight
const signature = `${fighter1Id}_${fighter2Id}`;

// Compare current scraped fights to database fights
const dbFights = await prisma.fight.findMany({
  where: { eventId, isCancelled: false }
});

const dbSignatures = dbFights.map(f => `${f.fighter1Id}_${f.fighter2Id}`);
const scrapedSignatures = scrapedFights.map(f => generateSignature(f));

// Find missing fights
const cancelledFights = dbFights.filter(f => {
  const sig = `${f.fighter1Id}_${f.fighter2Id}`;
  return !scrapedSignatures.includes(sig);
});

// Only mark as cancelled if event has started (safety check)
if (eventHasStarted) {
  for (const fight of cancelledFights) {
    await prisma.fight.update({
      where: { id: fight.id },
      data: { isCancelled: true }
    });
    console.log(`[LiveTracker] Fight cancelled: ${fight.id}`);
  }
}
```

**Safety Check**: Only marks fights as cancelled if `eventHasStarted = true` to avoid false positives from incomplete scrapes.

### Example Scenarios

#### Scenario 1: New Fighter Appears Mid-Event

**Situation**:
- Scraped data: "Conor McGregor" fighting at Lightweight
- Daily scraper ran yesterday but McGregor wasn't on card (injured fighter replacement)

**Live Tracker Response**:
1. Calls `parseFighterName("Conor McGregor")` → { firstName: "Conor", lastName: "McGregor", nickname: null }
2. Calls `inferGenderFromWeightClass(LIGHTWEIGHT)` → MALE
3. Creates minimal fighter record: `{ firstName: "Conor", lastName: "McGregor", weightClass: LIGHTWEIGHT, gender: MALE, wins: 0, losses: 0, draws: 0, isActive: true }`
4. Creates fight with full metadata
5. Daily scraper fills in complete details (W-L-D record, image, nickname) on next run

#### Scenario 2: Title Fight Added Last Minute

**Situation**:
- Scraped data: New fight marked as title bout in Women's Bantamweight
- Both fighters already in database

**Live Tracker Response**:
1. Finds existing fighters via `firstName_lastName` unique constraint
2. Calls `inferGenderFromWeightClass(WOMENS_BANTAMWEIGHT)` → FEMALE
3. Updates both fighters: `{ gender: FEMALE, weightClass: WOMENS_BANTAMWEIGHT }`
4. Creates fight: `{ isTitle: true, titleName: "UFC Women's Bantamweight Championship", scheduledRounds: 5, orderOnCard: 1 }`

#### Scenario 3: Fight Cancelled After Event Starts

**Situation**:
- DB has "Jones vs Miocic" on main card
- Live scraper runs, fight missing from UFC.com
- Event status: `hasStarted: true`

**Live Tracker Response**:
1. Generates signatures for all scraped fights
2. Compares to database fights
3. "Jones vs Miocic" signature not found in scraped data
4. Checks `eventHasStarted = true` (safety)
5. Marks fight: `{ isCancelled: true }`
6. Logs: `[LiveTracker] Fight cancelled: {fightId}`

### Before vs After Comparison

**Before (Custom Logic)**:
- ❌ Simple name splitting (broke on nicknames like "Jon 'Bones' Jones")
- ❌ Hardcoded MALE gender for all fighters
- ❌ Missing fight metadata (cardType, weight class, title status)
- ❌ Basic create() calls (risk of duplicate fighters)

**After (Daily Scraper Parity)**:
- ✅ Proper nickname parsing via `parseFighterName()`
- ✅ Gender inferred from weight class division
- ✅ Full fight metadata from scraped data
- ✅ Upsert pattern prevents duplicates, preserves existing data

### Technical Benefits

1. **Consistency**: Same name parsing rules across daily and live scrapers
2. **Data Preservation**: Upsert doesn't overwrite fighter records/images from daily scraper
3. **Completeness**: All fight metadata captured (card type, weight, title status)
4. **Gender Accuracy**: Correctly identifies women fighters from division
5. **Duplicate Prevention**: Unique constraints prevent multiple records for same fighter

### Files Modified

**Live Event Parser**:
- `packages/backend/src/services/ufcLiveParser.ts`
  - Added shared utilities from daily scraper (parseFighterName, mapWeightClass, inferGenderFromWeightClass)
  - Updated `LiveFightUpdate` interface with cardType, weightClass, isTitle fields
  - Refactored `findOrCreateFighter()` to use upsert pattern with weight class parameter
  - Updated fight creation to include full metadata (cardType, titleName, scheduledRounds)
  - Enhanced cancellation detection with event start check

**Live Event Tracker**:
- `packages/backend/src/services/liveEventTracker.ts`
  - Updated `convertScrapedToLiveUpdate()` to pass cardType, weightClass, isTitle from scraped data

### Polling Configuration

**During Active Events**:
- **Interval**: 30 seconds
- **Scraper**: Puppeteer headless browser
- **Change Detection**: Compares new data to cached state, only updates database on changes
- **Round Tracking**: Updates `currentRound` field when round changes detected

**API Endpoints**:
```bash
# Start live tracking
POST /api/live-events/start
{ "eventId": "uuid" }

# Stop live tracking
POST /api/live-events/stop
{ "eventId": "uuid" }

# Get current status
GET /api/live-events/status/:eventId
```

**Files**: `services/scrapeLiveEvent.js`, `services/ufcLiveParser.ts`, `services/liveEventTracker.ts`

---

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

---

## Recent Features (Detailed)

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

### Email Verification Enforcement System (Nov 28, 2025)
**Status**: ✅ Complete - Frontend modal + Backend middleware
**Branch**: `redesign-fight-card-components`

**Purpose**: Prevent unverified email users from taking community actions (spam prevention, accountability)

**Frontend Implementation**:
- `VerificationRequiredModal` - Reusable modal explaining verification is required
- `useRequireVerification` hook - Wraps actions, shows modal if unverified
- Applied to: ratings, reviews, comments, follows, predictions

**Backend Enforcement** (`requireEmailVerification` middleware):
- Returns 403 with `EMAIL_NOT_VERIFIED` code for unverified users
- Uses `preHandler` array: `[authenticateUser, requireEmailVerification]`

**Protected Endpoints**:
- **fights.ts**: DELETE rating, POST upvote/flag review
- **index.ts**: POST/DELETE fighter follow, PATCH fighter notifications, POST/DELETE fight follow, PATCH fight notifications
- **crews.ts**: POST create/join crew, POST messages, POST predictions

**Key Files**:
- `packages/mobile/components/VerificationRequiredModal.tsx` - Modal UI
- `packages/mobile/hooks/useRequireVerification.ts` - Verification gate hook
- `packages/backend/src/middleware/auth.ts` - `requireEmailVerification` middleware
- `packages/backend/src/routes/fights.ts` - Fight action endpoints
- `packages/backend/src/routes/index.ts` - Fighter/fight follow endpoints
- `packages/backend/src/routes/crews.ts` - Crew action endpoints

**Error Response**:
```json
{ "error": "Email verification required", "code": "EMAIL_NOT_VERIFIED" }
```

---

### Email Feature Production Deployment Checklist (Dec 2025)

**Problem Discovered**: Mobile app and web reset page must hit the SAME backend. During testing, the app was hitting local backend while reset-password.html hit production - causing password resets to "not work."

**Root Cause**: `USE_PRODUCTION_API` in `api.ts` controls which backend the mobile app uses. EAS builds bake this value in at build time.

**Production Deployment Steps**:

1. **Set Mobile to Production API**:
   ```typescript
   // packages/mobile/services/api.ts line 6
   const USE_PRODUCTION_API = true;
   ```

2. **Verify reset-password.html Points to Production**:
   ```javascript
   // reset-password.html line 401
   const API_BASE_URL = 'https://fightcrewapp-backend.onrender.com/api';
   ```

3. **Deploy reset-password.html to goodfights.app**:
   - Upload `reset-password.html` to your web hosting
   - URL should be: `https://goodfights.app/reset-password.html`

4. **Verify Render Environment Variables**:
   ```
   FRONTEND_URL=https://goodfights.app
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=<your-sendgrid-api-key>
   SMTP_FROM=noreply@goodfights.app
   JWT_SECRET=<consistent-secret>
   ```

5. **Build New EAS Build** (required - JS is bundled at build time):
   ```bash
   npx eas build --profile production --platform android
   ```

6. **Test Full Flow**:
   - Request password reset in app → email arrives
   - Click email link → goodfights.app/reset-password.html opens
   - Enter new password → success message
   - Login with new password in app → works

**Local Development Testing**:
- Set `USE_PRODUCTION_API = false` in `api.ts`
- Modify `reset-password.html` to point to local: `http://10.0.0.53:3008/api`
- Add `'null'` to CORS origins in `server.ts` (allows file:// requests)
- Test entire flow against local backend

**Key Files**:
- `packages/mobile/services/api.ts:6` - USE_PRODUCTION_API flag
- `reset-password.html:401` - API_BASE_URL for web page
- `packages/backend/src/server.ts:103-118` - CORS allowed origins
- `packages/backend/src/utils/email.ts:70` - Reset link URL generation

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

---

## Performance Optimizations (Dec 2025)

**Status**: ✅ Complete - Major optimization session
**Date**: December 8, 2025
**Branch**: `condensedevent1`

**⚠️ ROLLBACK REFERENCE**: This section documents all changes made during a major performance optimization session. If issues arise, use this to identify and revert specific changes.

---

### 1. Eliminated N+1 API Calls in Fight Cards
**Problem**: Each fight card was calling `useFightStats(fightId)` hook individually, causing 26+ API calls per event page.

**Solution**: Removed `useFightStats` hook from all fight cards. Instead, cards now use data directly from the `fight` object passed as props.

**Files Changed**:
- `packages/mobile/components/fight-cards/UpcomingFightCard.tsx`
- `packages/mobile/components/fight-cards/CompletedFightCard.tsx`
- `packages/mobile/components/fight-cards/LiveFightCard.tsx`

**Code Pattern (in each card)**:
```typescript
// BEFORE (N+1 problem):
const { predictionStats, aggregateStats } = useFightStats(fight.id);

// AFTER (uses fight object directly):
const predictionStats = useMemo(() => ({
  averageHype: fight.averageHype || 0,
  totalPredictions: 0,
}), [fight.averageHype]);

const aggregateStats = useMemo(() => {
  let winnerName: string | null = null;
  if ((fight as any).userPredictedWinner) {
    if ((fight as any).userPredictedWinner === fight.fighter1.id) {
      winnerName = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
    } else if ((fight as any).userPredictedWinner === fight.fighter2.id) {
      winnerName = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
    }
  }
  return {
    userPrediction: (fight.userHypePrediction || winnerName) ? {
      winner: winnerName,
      method: (fight as any).userPredictedMethod || null,
    } : null,
    communityPrediction: null,
  };
}, [fight.userHypePrediction, ...dependencies]);
```

**To Revert**: Restore `useFightStats` hook usage (search git history for `useFightStats` imports)

---

### 2. Added React.memo to Fight Card Components
**Problem**: Fight cards re-rendered unnecessarily when parent components re-rendered.

**Solution**: Wrapped all three fight card components with `React.memo()`.

**Files Changed**:
- `packages/mobile/components/fight-cards/UpcomingFightCard.tsx:1110-1111`
- `packages/mobile/components/fight-cards/CompletedFightCard.tsx:1349-1350`
- `packages/mobile/components/fight-cards/LiveFightCard.tsx:1062-1063`

**Code Pattern**:
```typescript
// At end of file:
export default memo(UpcomingFightCard);
```

**To Revert**: Change `export default memo(ComponentName)` back to `export default ComponentName`

---

### 3. Backend: Added averageHype to /fights Endpoint
**Problem**: `averageHype` was only calculated in `/fights/my-fights` endpoint, causing empty hype boxes on event screens.

**Solution**: Added batch calculation of `averageHype` to the main `/fights` endpoint.

**File**: `packages/backend/src/routes/fights.ts:283-315`

**Code Added**:
```typescript
// Calculate aggregate hype for all fights in batch (performance optimization)
const fightIds = fights.map((f: any) => f.id);
const allPredictions = await fastify.prisma.fightPrediction.findMany({
  where: {
    fightId: { in: fightIds },
    predictedRating: { not: null },
  },
  select: {
    fightId: true,
    predictedRating: true,
  },
});

// Group predictions by fight and calculate averages
const hypeByFight = new Map<string, { total: number; count: number }>();
for (const pred of allPredictions) {
  const existing = hypeByFight.get(pred.fightId) || { total: 0, count: 0 };
  existing.total += pred.predictedRating || 0;
  existing.count += 1;
  hypeByFight.set(pred.fightId, existing);
}

// In transformation:
const hypeData = hypeByFight.get(fight.id);
if (hypeData && hypeData.count > 0) {
  transformed.averageHype = Math.round((hypeData.total / hypeData.count) * 10) / 10;
} else {
  transformed.averageHype = 0;
}
```

**To Revert**: Remove the batch calculation code block (lines 283-315 approximately)

---

### 4. Backend: Added userPredictedWinner to /fights Endpoint
**Problem**: User's predicted winner indicator wasn't showing because `/fights` endpoint didn't include `userPredictedWinner`, `userPredictedMethod`, `userPredictedRound`.

**Solution**: Added these fields to the `/fights` endpoint transformation (matching `/fights/:id` behavior).

**File**: `packages/backend/src/routes/fights.ts:340-349`

**Code Changed**:
```typescript
// Transform user prediction (take the first/only prediction)
if (fight.predictions && fight.predictions.length > 0) {
  transformed.userHypePrediction = fight.predictions[0].predictedRating;
  transformed.userPredictedWinner = fight.predictions[0].predictedWinner;  // ADDED
  transformed.userPredictedMethod = fight.predictions[0].predictedMethod;  // ADDED
  transformed.userPredictedRound = fight.predictions[0].predictedRound;    // ADDED
  transformed.hasRevealedHype = fight.predictions[0].hasRevealedHype;
  transformed.hasRevealedWinner = fight.predictions[0].hasRevealedWinner;
  transformed.hasRevealedMethod = fight.predictions[0].hasRevealedMethod;
}
```

**To Revert**: Remove the three ADDED lines

---

### 5. Converted Event Screens to FlatList with Virtualization
**Problem**: ScrollView rendered all events at once, causing slow initial load.

**Solution**: Converted to FlatList with virtualization settings.

**Files Changed**:
- `packages/mobile/app/(tabs)/events/index.tsx`
- `packages/mobile/app/(tabs)/past-events/index.tsx`

**Code Pattern**:
```typescript
<FlatList
  data={upcomingEvents}
  renderItem={renderEventSection}
  keyExtractor={keyExtractor}
  contentContainerStyle={styles.scrollContainer}
  showsVerticalScrollIndicator={false}
  // Performance optimizations
  removeClippedSubviews={true}
  maxToRenderPerBatch={3}
  windowSize={5}
  initialNumToRender={2}
/>
```

**Also Added**: `memo()` wrapper to `EventSection` component in both files.

**CRITICAL FIX**: Moved `useCallback` hooks BEFORE early returns to fix "rendered more hooks" error (Rules of Hooks).

**To Revert**:
1. Change `FlatList` back to `ScrollView`
2. Remove `renderEventSection` and `keyExtractor` useCallback hooks
3. Remove `memo()` from EventSection

---

### 6. Pre-computed Heatmap Color Lookup Table
**Problem**: `getHypeHeatmapColor()` was interpolating colors at runtime on every render.

**Solution**: Pre-computed all 101 colors (0.0-10.0 in 0.1 increments) at module load time.

**File**: `packages/mobile/utils/heatmap.ts`

**Code Structure**:
```typescript
// Pre-compute all 101 colors at module load
const HEATMAP_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const score = i / 10;
  if (score < 1) {
    HEATMAP_COLORS.push('#808080'); // Grey
  } else if (score >= 10) {
    HEATMAP_COLORS.push('#ff0000'); // Red
  } else {
    HEATMAP_COLORS.push(interpolateColor(score));
  }
}

// O(1) lookup instead of runtime calculation
export const getHypeHeatmapColor = (hypeScore: number): string => {
  if (hypeScore < 0) return HEATMAP_COLORS[0];
  if (hypeScore >= 10) return HEATMAP_COLORS[100];
  const index = Math.round(hypeScore * 10);
  return HEATMAP_COLORS[index];
};

// Also added pre-parsed RGB values for flame color mixing
const HEATMAP_RGB: RGBColor[] = HEATMAP_COLORS.map(color => parseToRGB(color));
```

**To Revert**: Restore original `getHypeHeatmapColor` that called `interpolateColor()` directly

---

### 7. Reduced LiveFightCard forceUpdate Interval
**Problem**: LiveFightCard had a 1-second `forceUpdate` interval for status updates.

**Solution**: Changed to 30-second interval since status only changes after ~5 minutes.

**File**: `packages/mobile/components/fight-cards/LiveFightCard.tsx:97-102`

**Code Changed**:
```typescript
// BEFORE:
const interval = setInterval(forceUpdate, 1000);

// AFTER:
const interval = setInterval(forceUpdate, 30000); // 30 seconds instead of 1 second
```

**To Revert**: Change `30000` back to `1000`

---

### 8. Memoized Color Calculations in Fight Cards
**Problem**: Heatmap color functions called on every render.

**Solution**: Wrapped color calculations in `useMemo`.

**Files**: All three fight card components

**Code Pattern**:
```typescript
const hypeBorderColor = useMemo(
  () => getHypeHeatmapColor(predictionStats?.averageHype || 0),
  [predictionStats?.averageHype]
);

const userHypeColor = useMemo(
  () => getHypeHeatmapColor(fight.userHypePrediction || 0),
  [fight.userHypePrediction]
);
```

**To Revert**: Remove useMemo wrappers, call functions directly

---

### Summary of Performance Gains
- **API calls per event**: 26+ → 1 (eliminated N+1)
- **Re-renders**: Significantly reduced via React.memo
- **Initial load**: Faster with FlatList virtualization (only renders visible items)
- **Color calculations**: O(1) lookup instead of interpolation
- **Live updates**: 30x fewer interval callbacks

### Known Side Effects Fixed
1. **Empty "ALL HYPE" boxes**: Fixed by adding `averageHype` batch calculation to backend
2. **"Rendered more hooks" error**: Fixed by moving hooks before early returns
3. **Missing predicted winner indicator**: Fixed by adding `userPredictedWinner` to backend + deriving name in cards

### Files Modified (Complete List)
**Frontend**:
- `packages/mobile/components/fight-cards/UpcomingFightCard.tsx`
- `packages/mobile/components/fight-cards/CompletedFightCard.tsx`
- `packages/mobile/components/fight-cards/LiveFightCard.tsx`
- `packages/mobile/app/(tabs)/events/index.tsx`
- `packages/mobile/app/(tabs)/past-events/index.tsx`
- `packages/mobile/utils/heatmap.ts`

**Backend**:
- `packages/backend/src/routes/fights.ts`

---

### Performance Optimizations (Nov 2025) - LEGACY
- Combined stats API calls using `Promise.all`
- 50% fewer requests: 160→80 on lists, 2→1 on details

### UI Improvements (Nov 2025)
- Fighter cards: replaced W-L-D with avg rating
- Fight cards: heatmap squares, yellow underline for predictions
- Navigation: Stack-inside-Tabs, root-level event route
- Custom alerts: styled modals with auto-dismiss

---

## Feature History

### November 2025

#### Winner Prediction Bug Fix (2025-11-04)
- **Issue**: Users couldn't save winner prediction without also selecting a method
- **Fix**: Changed `saveWinnerMutation` to use `selectedMethod` instead of `fight.userPredictedMethod`
- **Impact**: Users can now independently save winner, method, and hype predictions
- **File**: `components/UpcomingFightDetailScreen.tsx:207`

#### Keyboard Handling Improvement (2025-11-04)
- **Issue**: Pre-fight comment textarea hidden when keyboard appears
- **Fix**: Added `KeyboardAvoidingView` with platform-specific behavior ('padding' for iOS, 'height' for Android)
- **Impact**: Textarea remains visible and accessible when phone keyboard is shown
- **File**: `components/UpcomingFightDetailScreen.tsx:611-621`

#### Removed Legacy Modal System (2025-11-04)
- **What**: Removed old modal-based prediction/rating system (354 lines deleted)
- **Why**: Replaced by full-screen navigation to UpcomingFightDetailScreen and CompletedFightDetailScreen
- **Cleaned up**: 5 files
  - `app/(tabs)/events/index.tsx`
  - `app/(tabs)/events/[id].tsx`
  - `app/event/[id].tsx`
  - `app/crew/[id].tsx`
  - `app/activity/ratings.tsx`
- **Removed Components**: `RateFightModal`, `PredictionModal`
- **Removed State**: `recentlyRatedFightId`, `recentlyPredictedFightId` animation tracking
- **Removed Props**: `animateRating`, `animatePrediction` from fight cards
- **Impact**: Cleaner codebase, all prediction/rating uses consistent navigation pattern

#### Animation System Notes (for future)
- **Infrastructure Exists**: Sparkle animation code still in fight cards (flame1-8, fighterSparkle1-4, methodSparkle1-4)
- **Current Issue**: Animations only triggered by `animatePrediction` prop, which was only set by modal system
- **Challenge**: React Query caching means data doesn't always re-render on navigation back
- **Attempted Solutions**: Change detection with refs, pathname detection (both had timing/reliability issues)
- **Recommended Future Approach**: Simple data comparison on component focus/mount, or global state solution (context/redux)

#### Fighter Cards Redesign (2025-11-03)
- **What**: Removed borders, replaced W-L-D record with fighter rating
- **Changes**:
  - No border on card or fighter image
  - Shows "Avg Score (last N fights): X.X/10" with dynamic fight count
  - Backend already calculates `avgRating` from last 3 completed fights
- **Files**: `components/FighterCard.tsx`, `app/(tabs)/community.tsx`

#### Navigation Improvements (2025-11-03)
- **Root-Level Event Route**: Fixed back button navigation from fight details
  - **Problem**: Fight Detail → Event Detail → Back skipped to Past Events screen
  - **Solution**: Created `/event/[id].tsx` route at root level (matches `/fighter` pattern)
- **Fight Card Navigation**: Changed event screens to navigate to detail screens instead of modals
  - UpcomingFightCard → UpcomingFightDetailScreen
  - CompletedFightCard → CompletedFightDetailScreen
- **Files**: `app/event/[id].tsx`, `app/_layout.tsx`, `components/FightDetailsSection.tsx`
- **Commits**: `2797e48`, `394bc01`, `1db2b4f`, `f4a90e4`

### Additional Features (Historical)

#### UI/UX Components
- **Fight Cards**: Heatmap squares (40x40px) for hype/rating scores, yellow underline for user predictions, compact height (40px min)
- **Detail Screens**: Large animated wheels (80px), auto-save, contextual tags, inline rating system
- **Navigation**: Stack-inside-Tabs pattern, persistent native tab bar, smart highlighting
- **Custom Alerts**: App-wide styled modals replacing Alert.alert (5 types, theme-aware, auto-dismiss)
- **Crew Management**: Member removal, crew deletion with cascade, join success modal
- **Contact Invitations**: WhatsApp-style UX with SMS sending

#### Backend Systems
- **Mock Event Testing**: Compressed timescales for rapid testing (90s rounds, presets: default/fast/ultra-fast)
  - Files: `services/mockEventGenerator.ts`, `services/mockLiveSimulator.ts`
  - API: `POST /api/mock-live-events/quick-start|pause|resume|reset`
- **News Scraper**: 6 MMA sources, 5x daily cron
  - Status: IN PROGRESS - awaiting Docker deployment

---

## Domain & Hosting (TODO)

**Domain**: goodfights.app (currently at GoDaddy - plan to transfer)

**Planned Setup**:
| Need | Solution | Cost |
|------|----------|------|
| Domain | Transfer to Cloudflare Registrar | ~$12/year |
| Web Hosting | Vercel (landing page at `packages/landing`) | Free |
| Backend | Render (already deployed) | Current plan |
| Email | Cloudflare Email Routing → Gmail | Free |

**Steps to complete**:
1. Transfer domain from GoDaddy to Cloudflare (~5-7 days)
2. Set up Cloudflare Email Routing for contact@goodfights.app
3. Connect Vercel to Cloudflare DNS
4. Cancel GoDaddy hosting

**Landing page**: `packages/landing/index.html` - simple page with App Store/Play Store links

---

## Installing Test Builds

**Android (EAS Build)**:
- JavaScript-only changes: Automatic via OTA updates when backend deploys
- Native changes (splash screen, app.json config, new native modules): Requires new APK install
  1. Go to https://expo.dev/accounts/mikeprimak/projects/fightcrewapp/builds
  2. Find latest Android build, scan QR code or download APK directly
  3. Install on device (may need to allow "Install from unknown sources")

**iOS (TestFlight)**:
- Requires `eas build --platform ios` then `eas submit --platform ios`
- Wait for Apple processing (~5-10 min), then update via TestFlight app

---

## Launch Prep Testing (2026-01-04)

**Status**: Android testing in progress - Parts A & B complete, infrastructure setup complete

### Completed Tests (2026-01-04)
**PART A: Authentication & Onboarding** - ALL PASSED
- A1. New User Registration
- A2. Legacy User Claim Flow (email + Google Sign-In)
- A3. Google Sign-In
- A4. Password Reset
- A5. Logout

**PART B: Browsing & Navigation** - ALL PASSED
- B1-B5 all working

### Fixes Applied (2026-01-04/05)
1. **Missing `pre_fight_comment_votes` table** - Created in production DB
2. **`totalRatings`/`totalReviews` out of sync** - Ran UPDATE for all 1937 migrated users
3. **Crowd Ratings not updating** - Backend now returns `aggregateStats` in PUT /user-data response
4. **ratingDistribution format** - Converted `{ratings1: x}` to `{1: x}` format
5. **reset-password.html** - Removed app store buttons
6. **Event names missing promotion prefix** - "200" → "UFC 200" for 981 events
7. **Relative banner image paths** - Fixed UFC 300, UFC 301, ONE Fight Night 38 banners
8. **Fighter deduplication schema removed** - Removed tapologyId, sherdogId, ufcId, FighterAlias

### FIXED: Upcoming Events Screen Not Loading (2026-01-05)

**Root Cause**: The `/api/events?type=upcoming` filter was only checking `isComplete=false`, not whether the event date was in the future.

**Fix Applied** (commit 493bf31):
1. Added `date >= NOW()` check to upcoming filter in `routes/index.ts`
2. Past filter now uses OR logic: `isComplete=true OR date < NOW()`
3. Fixed 1 past event that was incorrectly marked incomplete

### Infrastructure Setup (2026-01-07)

**Domain & Hosting - COMPLETE**
- Domain `goodfights.app` transferred from GoDaddy DNS to Cloudflare
- Nameservers: `hattie.ns.cloudflare.com`, `noah.ns.cloudflare.com`
- Landing page deployed to Vercel (`packages/landing/`)
- DNS records configured:
  - `A` → `@` → `216.198.79.1` (Vercel)
  - `CNAME` → `www` → Vercel DNS
- SSL certificates auto-provisioned by Vercel

**Email - COMPLETE (Updated 2026-01-15)**
- **Provider**: Zoho Mail Lite ($1/month)
- **Address**: `contact@goodfights.app` (alias on avocadomike@hotmail.com Zoho account)
- **Send & Receive**: Full capability via https://mail.zoho.com
- **DNS Records** (in Cloudflare):
  - MX: `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50)
  - TXT (SPF): `v=spf1 include:zohomail.com ~all`
  - TXT (DKIM): `default._domainkey` → Zoho DKIM key
  - TXT (DMARC): `_dmarc` → `v=DMARC1; p=none; rua=mailto:michaelsprimak@gmail.com...`
- **Previous setup**: Cloudflare Email Routing (receive-only, forwarded to Gmail) - disabled

**Landing Page - COMPLETE**
- Live at `https://goodfights.app`
- Tagline: "Hype and Rate Combat Sports Fights"
- App Store / Play Store buttons (placeholder links - update when published)
- Favicon: hand-pointing-down logo
- Files: `packages/landing/index.html`

**Auth Pages Migrated to Vercel - COMPLETE**
- `https://goodfights.app/reset-password.html` - password reset form
- `https://goodfights.app/verify-email.html` - email verification
- Updated support email from `support@` to `contact@goodfights.app`

**App Changes (2026-01-07)**
1. **Forced dark mode** - Removed light mode option, all users get dark theme
   - Modified `packages/mobile/app/_layout.tsx`
   - Created `packages/mobile/hooks/useColors.ts` for future use
2. **Disabled notification permissions** - Commented out `registerPushToken()` calls
   - Modified `packages/mobile/store/AuthContext.tsx` (5 places)
   - Modified `packages/mobile/app/settings.tsx`
   - Easy to re-enable when notifications are restored

### Remaining Tasks
- [ ] Continue testing Parts C-H
- [ ] Build & submit iOS app to App Store
- [ ] Update landing page with real App Store / Play Store links
- [ ] (Future) Re-enable notifications

---

## WIP: CompletedFightDetailScreen Tags

**Status**: Partially fixed, needs testing
**Branch**: upcomingfightdetailscreen-v3

**Issues being fixed:**
1. Tags showing "invalid request data" error when toggling
2. Tags not showing counters correctly
3. Tag order was randomizing on each render

**Changes made (2025-01-03):**
- Added `tagIdsToNames()` helper
- Simplified tag display logic from 70+ lines to ~15 lines
- Added `tagCounts` state for optimistic count updates
- Better error logging in mutation `onError`

**Key files:**
- `packages/mobile/components/CompletedFightDetailScreen.tsx` - tag logic around lines 520-535, 1201-1225
- `packages/backend/src/routes/fights.ts` - PUT `/fights/:id/user-data` endpoint

---

## Startup Debugging Checklist

1. **Network connectivity**: Ensure phone and computer are on the SAME WiFi network
2. **Zombie processes**: Check for stale Node processes blocking ports
3. **Firewall**: Windows Firewall may block Metro port 8083

**Killing Zombie Processes (Windows)**:
1. List all Node processes: `powershell -Command "Get-Process node | Select-Object Id, ProcessName, StartTime"`
2. Check port usage: `netstat -ano | findstr ":3008"` (backend) or `findstr ":8083"` (Expo)
3. Identify blocker: `powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = <PID>' | Select-Object CommandLine"`
4. Kill zombie: `powershell -Command "Stop-Process -Id <PID> -Force"`

---

## Live Event Tracking Strategy

Promotions are handled differently based on whether they have a working live event tracker:

| Promotion | Strategy | How Fights Become Ratable |
|-----------|----------|---------------------------|
| UFC | Live Tracker | Individually as each fight completes (real-time scraping) |
| Matchroom | Live Tracker | Individually as each fight completes |
| OKTAGON | Live Tracker | Individually as each fight completes |
| BKFC, PFL, ONE, etc. | Time-Based | All fights in section become complete at section start time |

**Time-Based Fallback Logic:**
- At `earlyPrelimStartTime` → All "Early Prelims" fights marked complete
- At `prelimStartTime` → All "Prelims" fights marked complete
- At `mainStartTime` → All "Main Card" fights marked complete

**To promote a new org to live tracking:** Add it to `PROMOTION_TRACKER_CONFIG` in `config/liveTrackerConfig.ts`

---

## Fighter Deduplication System

**Status: TEMPORARILY DISABLED** (as of 2026-01-05)

The deduplication schema (tapologyId, sherdogId, ufcId, FighterAlias) was removed to fix production errors.

### Re-enabling Later

1. Add back the schema fields to `schema.prisma`
2. Run `prisma db push` on production
3. Re-deploy backend

Scripts in `packages/backend/scripts/fighter-dedup/` are still available but won't work until schema is re-added.

---

## Legacy Migration (fightingtomatoes.com → New App)

**Status: COMPLETE** (as of 2025-12-29)

### Migration Summary

| Data Type | Count |
|-----------|-------|
| Events | ~1,300 |
| Fighters | ~6,800 |
| Fights | ~13,500 |
| Users | 1,928 |
| Ratings | ~65,000 |
| Reviews | ~770 |
| Tags | ~594 |

### Pre-Launch Sync Command
```bash
cd packages/backend/scripts/legacy-migration/mysql-export
node sync-all-from-live.js
```

### Legacy MySQL Connection
```
Host: 216.69.165.113:3306
User: fotnadmin
Password: HungryMonkey12
Databases: fightdb, userfightratings, userfightreviews, userfighttags
```

### Account Claim Flow
Users with `password: null` are prompted to:
1. Enter email → Backend detects legacy user
2. Receive verification email
3. Click link to set new password
4. Account activated with all legacy data intact

---

## Color Redesign Plan (Branch: color-option2)

**Goal**: Implement semantic color system for clarity

| Category | Color Scale | Purpose |
|----------|-------------|---------|
| **HYPE** | Orange → Red | Warm, energetic excitement |
| **RATINGS** | Blue → Purple | Cool, analytical judgment |
| **User ownership** | Gold border | "This is yours" indicator |
| **Winners/Success** | Green | Positive outcomes |

**Files to Update**:
1. `packages/mobile/utils/heatmap.ts` - Create separate hype/rating color functions
2. `packages/mobile/constants/Colors.ts` - Add semantic color constants
3. `packages/mobile/components/RatingDistributionChart.tsx` - Use rating colors

---

## Guest Access Implementation (Jan 2026)

**Purpose**: Allow users to browse app content without creating an account, as required by Apple App Store guidelines.

### Architecture Overview

The guest access system piggybacks on the existing email verification framework. Unverified users could already browse but not interact - we extended this pattern to guests.

| State | Can Browse | Can Interact | Modal Shown |
|-------|------------|--------------|-------------|
| Authenticated + Verified | Yes | Yes | None |
| Authenticated + Unverified | Yes | No | "Verify Email" |
| Guest | Yes | No | "Create Account" |

### Files Modified

1. **`packages/mobile/store/AuthContext.tsx`**
   - Added `isGuest: boolean` state
   - Added `continueAsGuest()` function that sets guest mode and navigates to tabs
   - Clear guest mode on login/register (`setIsGuest(false)`)

2. **`packages/mobile/app/(tabs)/_layout.tsx`**
   - Changed auth check from `if (!isAuthenticated)` to `if (!isAuthenticated && !isGuest)`
   - Redirect goes to `/welcome` (not `/login`) so users see the guest option

3. **`packages/mobile/store/VerificationContext.tsx`**
   - Added `isGuestPrompt` state to track modal type
   - Modified `isVerified` check: `!isGuest && (!user || user.isEmailVerified)`
   - `requireVerification()` now checks for guest first, shows appropriate modal

4. **`packages/mobile/components/VerificationRequiredModal.tsx`**
   - Added `isGuest` prop
   - Guest mode UI: user-plus icon, "Create an Account" title, Sign Up/Sign In buttons
   - Unverified mode: unchanged (envelope icon, verify email message)

5. **`packages/mobile/app/(auth)/welcome.tsx`**
   - Added "Browse as Guest" button below Sign In link
   - Calls `continueAsGuest()` from AuthContext

### Guest Experience Flow

```
Welcome Screen → "Browse as Guest" → Main App (tabs)
                                          ↓
                              Browse events, fights, fighters
                                          ↓
                              Try to rate/comment/predict
                                          ↓
                              "Create Account" modal appears
                                          ↓
                              Sign Up → Registration → Authenticated
```

### What Guests Can Do
- View all events, fights, fighters
- Read comments and reviews
- See community stats and predictions
- Use search
- Browse fighter profiles

### What Guests Cannot Do (blocked by modal)
- Rate fights
- Write reviews/comments
- Make predictions
- Follow fighters/fights
- Join/create crews
- Access profile/settings

### Key Code Patterns

**AuthContext - Guest state:**
```typescript
const [isGuest, setIsGuest] = useState(false);

const continueAsGuest = () => {
  setIsGuest(true);
  router.replace('/(tabs)');
};

// Clear on any successful auth
setIsGuest(false); // in login, loginWithGoogle, loginWithApple, register
```

**VerificationContext - Guard logic:**
```typescript
const { user, isGuest } = useAuth();
const isVerified = !isGuest && (!user || user.isEmailVerified);

const requireVerification = useCallback((description) => {
  if (isGuest) {
    setIsGuestPrompt(true);
    setModalVisible(true);
    return false;
  }
  if (isVerified) return true;
  setIsGuestPrompt(false);
  setModalVisible(true);
  return false;
}, [isVerified, isGuest]);
```

**Modal - Conditional UI:**
```typescript
if (isGuest) {
  return (
    <Modal>
      <FontAwesome name="user-plus" />
      <Text>Create an Account</Text>
      <Text>Sign up to {actionDescription}</Text>
      <Button onPress={() => router.push('/(auth)/register')}>Sign Up</Button>
      <Button onPress={() => router.push('/(auth)/login')}>Sign In</Button>
    </Modal>
  );
}
// ... existing verification modal
```

### Testing Checklist
- [ ] Tap "Browse as Guest" → enters main app
- [ ] Can browse events, fights, fighters
- [ ] Try to rate fight → "Create Account" modal appears
- [ ] Tap "Sign Up" → goes to registration
- [ ] Complete registration → authenticated, can interact
- [ ] Log out → returns to welcome screen (not guest mode)

---

**End of Archive** - Return to `CLAUDE.md` for current development info.
