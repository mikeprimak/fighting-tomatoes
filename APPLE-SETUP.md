# Apple/iOS Setup Guide

**Status**: Waiting for Apple Developer Account approval (up to 48 hours from 2025-12-27)

**Your Setup**: No Mac, no iPhone. Using EAS cloud builds + TestFlight for distribution.

---

## Prerequisites Completed

- [x] Apple Developer Program enrollment ($99/year)
- [x] Expo EAS project configured
- [x] Bundle ID set: `com.fightcrewapp.mobile`
- [x] eas.json updated with iOS production settings

---

## Step 1: Access Apple Developer Console

Once approved, log in at: https://developer.apple.com

You'll need to access:
- **Certificates, Identifiers & Profiles**: For APNs keys and App ID
- **App Store Connect** (https://appstoreconnect.apple.com): For TestFlight and app submission

---

## Step 2: Create APNs Key (Push Notifications)

iOS push notifications require an APNs (Apple Push Notification service) key.

### 2.1 Create the Key

1. Go to: https://developer.apple.com/account/resources/authkeys/list
2. Click the **+** button to create a new key
3. Enter a name: `FightCrewApp Push Key`
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue**, then **Register**
6. **IMPORTANT**: Download the `.p8` file immediately
   - You can only download this file ONCE
   - Save it somewhere safe (e.g., `FightCrewApp_APNs_Key.p8`)
7. Note these values:
   - **Key ID**: (10-character string, shown on the key page)
   - **Team ID**: (Found in top-right of developer portal, or Membership page)

### 2.2 Upload APNs Key to Expo

```bash
cd packages/mobile
eas credentials --platform ios
```

Select:
1. "Push Notifications: Manage your Apple Push Notifications Key"
2. "Upload a new key"
3. Provide the path to your `.p8` file
4. Enter the Key ID when prompted

---

## Step 3: Register App ID (if not auto-created)

EAS usually handles this automatically, but verify it exists:

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Look for `com.fightcrewapp.mobile`
3. If it doesn't exist, click **+** and create:
   - Platform: iOS, tvOS, watchOS
   - Type: App IDs → App
   - Description: `FightCrewApp`
   - Bundle ID: Explicit → `com.fightcrewapp.mobile`
   - Capabilities: Enable these:
     - [x] Push Notifications
     - [x] Sign In with Apple
     - [x] Associated Domains (for deep links)

---

## Step 4: EAS Credentials Setup

This is where EAS creates your signing certificates and provisioning profiles.

```bash
cd packages/mobile
eas credentials --platform ios
```

When prompted:
1. Log in with your Apple ID
2. Select your Team (if you have multiple)
3. Choose **"Let EAS handle it"** for:
   - Distribution Certificate
   - Provisioning Profile

EAS will automatically:
- Create a Distribution Certificate
- Create a Provisioning Profile
- Store them securely on Expo's servers

---

## Step 5: Set Up Google Sign-In for iOS

Your Android app uses `google-services.json`. iOS needs `GoogleService-Info.plist`.

### 5.1 Get GoogleService-Info.plist

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project (the one with FightCrewApp)
3. Click the gear icon → **Project settings**
4. Under "Your apps", click **Add app** → **iOS**
5. Enter:
   - iOS bundle ID: `com.fightcrewapp.mobile`
   - App nickname: `FightCrewApp iOS`
6. Click **Register app**
7. Download `GoogleService-Info.plist`
8. Place it in: `packages/mobile/GoogleService-Info.plist`

### 5.2 Update app.json

Add the Google Services file to your iOS config:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.fightcrewapp.mobile",
  "backgroundColor": "#181818",
  "googleServicesFile": "./GoogleService-Info.plist",
  ...
}
```

### 5.3 Configure iOS URL Scheme for Google Sign-In

1. Open `GoogleService-Info.plist` in a text editor
2. Find the `REVERSED_CLIENT_ID` value (looks like `com.googleusercontent.apps.XXXX`)
3. Add it to app.json under ios.infoPlist.CFBundleURLTypes:

```json
"infoPlist": {
  "CFBundleURLTypes": [
    {
      "CFBundleURLSchemes": ["goodfights", "fightcrewapp", "com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID"]
    }
  ]
}
```

---

## Step 6: Set Up Apple Sign-In

### 6.1 Enable Capability

The App ID capability should already be enabled (Step 3). Verify:
1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Click on `com.fightcrewapp.mobile`
3. Ensure **Sign In with Apple** is checked

### 6.2 Add Plugin to app.json

Add the Apple Authentication plugin:

```json
"plugins": [
  "expo-router",
  "expo-font",
  "expo-secure-store",
  "expo-apple-authentication",
  ...
]
```

### 6.3 Install the Package (if not already)

```bash
cd packages/mobile
pnpm add expo-apple-authentication
```

---

## Step 7: Build iOS App

### 7.1 First Build (Preview/TestFlight)

```bash
cd packages/mobile
eas build --platform ios --profile preview
```

This will:
- Build on Expo's cloud servers (no Mac needed)
- Use your credentials from Step 4
- Take 15-30 minutes
- Produce an `.ipa` file

### 7.2 Production Build (for App Store)

```bash
eas build --platform ios --profile production
```

---

## Step 8: Create App in App Store Connect

Before you can use TestFlight, you need to create the app in App Store Connect.

1. Go to: https://appstoreconnect.apple.com
2. Click **My Apps** → **+** → **New App**
3. Fill in:
   - Platform: iOS
   - Name: `FightCrewApp` (or your preferred App Store name)
   - Primary Language: English (US)
   - Bundle ID: Select `com.fightcrewapp.mobile`
   - SKU: `fightcrewapp` (unique identifier, not shown publicly)
   - User Access: Full Access
4. Click **Create**

---

## Step 9: Submit to TestFlight

### 9.1 Submit Build

```bash
cd packages/mobile
eas submit --platform ios
```

When prompted:
1. Select the build you want to submit
2. Log in to App Store Connect if needed
3. EAS will upload the build

### 9.2 Wait for Processing

- Apple processes the build (usually 10-30 minutes)
- You'll get an email when it's ready
- Check status in App Store Connect → TestFlight

### 9.3 Compliance Questions

First submission requires answering:
- **Export Compliance**: Select "No" for encryption (unless you added custom encryption)
- Apple will email you or show prompts in App Store Connect

---

## Step 10: Add TestFlight Testers

### 10.1 Internal Testers (Your Team)

1. App Store Connect → Your App → TestFlight
2. Click **App Store Connect Users**
3. Add users by email (they must have App Store Connect access)

### 10.2 External Testers (Friends, Beta Users)

1. App Store Connect → Your App → TestFlight
2. Click **External Groups** → **+** to create a group
3. Name it (e.g., "Beta Testers")
4. Add testers by email
5. Select which build to distribute
6. First external build requires **Beta App Review** (24-48 hours)

### 10.3 Testers Install the App

Testers need to:
1. Download **TestFlight** app from App Store
2. Accept the email invitation (or use public link)
3. Install your app from TestFlight
4. Updates are automatic when you push new builds

---

## Step 11: Public TestFlight Link (Optional)

For easier distribution:

1. App Store Connect → TestFlight → External Groups
2. Select your group
3. Enable **Public Link**
4. Share the link (anyone with link can join, up to 10,000 testers)

---

## Quick Reference Commands

```bash
# Set up credentials
eas credentials --platform ios

# Build for TestFlight
eas build --platform ios --profile preview

# Build for App Store
eas build --platform ios --profile production

# Submit to TestFlight/App Store
eas submit --platform ios

# Check build status
eas build:list --platform ios

# View credentials
eas credentials --platform ios
```

---

## EAS Build Notes

### Build Warnings You May See

**`appVersionSource` Warning**
```
The field "cli.appVersionSource" is not set, but it will be required in the future.
```
This is informational only. You can either:
- Ignore it for now (still works)
- Add `"appVersionSource": "local"` to eas.json to manage versions in app.json
- Add `"appVersionSource": "remote"` to let EAS manage versions (but then local `buildNumber` is ignored)

**Credential Validation Skipped**
```
Distribution Certificate is not validated for non-interactive builds.
Skipping Provisioning Profile validation on Apple Servers because we aren't authenticated.
```
This is normal for `--non-interactive` builds. EAS uses cached credentials without re-validating with Apple. Not an issue unless your certificates have expired.

### Reducing Build Upload Time

Large project archives slow down uploads. Our archive is ~262 MB.

To reduce size, create `.easignore` file in `packages/mobile/`:
```
# Large dev-only files
node_modules/
*.log
.expo/
test-results/
scraped-data/
```

### Slow Fingerprint Computing

If you see:
```
⌛️ Computing the project fingerprint is taking longer than expected...
```

You can skip this step (useful for quick iteration) by setting:
```bash
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform ios --profile production --non-interactive
```

### Build Number Conflicts

App Store Connect rejects builds with duplicate build numbers. If you see:
```
ERROR: A build with build number '3' already exists
```

Increment `buildNumber` in app.json:
```json
"ios": {
  "buildNumber": "4",  // increment this
  ...
}
```

**Note**: If using `appVersionSource: "remote"`, local buildNumber is ignored. Remove that setting to use local build numbers.

---

## Troubleshooting

### "No matching provisioning profile"
Run `eas credentials --platform ios` and let EAS recreate the profile.

### "Bundle ID not registered"
Create the App ID manually in Apple Developer portal (Step 3).

### "Missing Push Notification entitlement"
Ensure Push Notifications capability is enabled on your App ID.

### Build succeeds but app crashes on launch
Check that `GoogleService-Info.plist` is included and valid.

### TestFlight build stuck in "Processing"
Usually resolves in 10-30 minutes. If longer than 2 hours, check for compliance questions in App Store Connect.

---

## Files Changed/Added for iOS

| File | Change |
|------|--------|
| `packages/mobile/eas.json` | Added iOS production settings |
| `packages/mobile/app.json` | Will add `googleServicesFile` for iOS |
| `packages/mobile/GoogleService-Info.plist` | NEW - Download from Firebase |

---

## Timeline Estimate

| Task | Time |
|------|------|
| Account approval | Up to 48 hours |
| Steps 2-6 (Setup) | 30-60 minutes |
| First iOS build | 15-30 minutes |
| App Store Connect setup | 15 minutes |
| TestFlight processing | 10-30 minutes |
| Beta App Review (external testers) | 24-48 hours |

**Total**: Once account is approved, you can have a TestFlight build ready for internal testers within ~2 hours.

---

## When You Borrow an iPhone

1. Ask the owner to install **TestFlight** from App Store
2. Either:
   - Add their Apple ID email as a tester, OR
   - Share your Public TestFlight link
3. They accept the invite in TestFlight
4. Install and test your app
5. Use the iPhone's **Feedback** button in TestFlight to send screenshots/notes

---

## Testing Options: TestFlight vs Expo Go

| Method | Backend | Data | Build Type | Best For |
|--------|---------|------|------------|----------|
| **TestFlight** | Render (production) | Production data | Real production build | Final QA, App Store prep |
| **Expo Go** | Local (`10.0.0.53:3008`) | Your local data | Development bundle | Layout testing, feature testing with historical data |

### When to Use Expo Go
- Testing layouts that depend on historical data (prediction accuracy, etc.)
- Faster iteration (no rebuild needed)
- Testing with your existing user data

### When to Use TestFlight
- Final production testing before App Store submission
- Testing push notifications (requires production build)
- Testing the exact user experience

### Expo Go Setup on iPhone
1. Download **Expo Go** from App Store
2. Ensure iPhone is on same WiFi as your dev computer
3. Run Metro bundler: `cd packages/mobile && npx expo start --port 8083 --lan`
4. Scan QR code from terminal with iPhone camera
5. App opens in Expo Go with local backend

### Local Network Prompt Issue
TestFlight builds may show "Allow app to find devices on local network?" if the build incorrectly tries to reach local IPs. Fixed by ensuring `__DEV__` detection works correctly in `api.ts` and `AuthContext.tsx`. If prompt appears, tap "Don't Allow" - app should still work via Render.

---

## Next Steps After This Guide

- [ ] Submit app for App Store review (when ready for public release)
- [ ] Set up App Store listing (screenshots, description, etc.)
- [ ] Configure In-App Purchases (if applicable)
- [ ] Set up App Analytics in App Store Connect
