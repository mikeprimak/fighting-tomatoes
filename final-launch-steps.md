# Final Launch Steps - Good Fights App

## Pre-Submission Checklist

### Technical Verification
- [ ] Production API URL is correct (not localhost)
- [ ] Remove or disable `USE_PRODUCTION_FOR_TESTING` flag if needed
- [ ] Test production build on real device (both iOS and Android)
- [ ] Verify reset-password and verify-email pages work with production backend
- [ ] Test Google Sign-In on production build
- [ ] Test Apple Sign-In on production build (iOS)

### Store Assets Needed

**Both Stores:**
- [ ] App icon (1024x1024 PNG, no transparency for iOS)
- [ ] Screenshots for various device sizes
- [ ] App description (short and full)
- [ ] Keywords/tags
- [ ] Privacy Policy URL: `https://goodfights.app/privacy.html`
- [ ] Support URL: `https://goodfights.app` or `mailto:contact@goodfights.app`

**App Store (iOS) Specific:**
- [ ] Screenshots: iPhone 6.7" (1290x2796), iPhone 6.5" (1284x2778), iPad if supporting
- [ ] Promotional text (170 chars max)
- [ ] Age rating questionnaire
- [ ] Export compliance (encryption) - answer: Yes, uses HTTPS (exempt)
- [ ] App Review contact info and notes

**Play Store (Android) Specific:**
- [ ] Screenshots: Phone (16:9 or 9:16), 7" tablet, 10" tablet (optional)
- [ ] Feature graphic (1024x500)
- [ ] Content rating questionnaire
- [ ] Data Safety form (what data collected/shared)
- [ ] Target audience and content

---

## Build & Submit Steps

### iOS (App Store)

1. **Build for iOS:**
   ```bash
   cd packages/mobile
   eas build --platform ios --profile production
   ```
   Wait ~15-30 minutes for build to complete.

2. **Submit to App Store:**
   ```bash
   eas submit --platform ios
   ```
   This uploads to App Store Connect.

3. **In App Store Connect:**
   - Fill in app metadata (description, keywords, etc.)
   - Upload screenshots
   - Set pricing (Free)
   - Complete age rating questionnaire
   - Answer export compliance questions
   - Submit for review

4. **Wait for Apple Review:** Usually 1-2 days, can be longer.

### Android (Play Store)

1. **Build for Android:**
   ```bash
   cd packages/mobile
   eas build --platform android --profile production
   ```
   Wait ~10-20 minutes for build to complete.

2. **Download the AAB file** from Expo dashboard or use:
   ```bash
   eas submit --platform android
   ```

3. **In Google Play Console:**
   - Create new app (if not already created)
   - Fill in store listing (description, screenshots, etc.)
   - Complete content rating questionnaire
   - Complete Data Safety form
   - Set up pricing & distribution (Free, select countries)
   - Upload AAB to Production track (or Internal/Closed testing first)
   - Submit for review

4. **Wait for Google Review:** Usually a few hours to 1-2 days.

---

## Post-Submission Tasks

- [ ] Update landing page with real App Store link once approved
- [ ] Update landing page with real Play Store link once approved
- [ ] Announce launch on social media
- [ ] Monitor crash reports and user feedback
- [ ] Respond to initial reviews

---

## URLs Reference

| Resource | URL |
|----------|-----|
| Website | https://goodfights.app |
| Privacy Policy | https://goodfights.app/privacy.html |
| Reset Password | https://goodfights.app/reset-password.html |
| Verify Email | https://goodfights.app/verify-email.html |
| Support Email | contact@goodfights.app |
| Backend API | https://fightcrewapp-backend.onrender.com/api |

---

## EAS Build Profiles

Check `eas.json` for available profiles. Typically:
- `development` - for dev builds with Expo Go
- `preview` - for testing (APK/IPA)
- `production` - for store submission (AAB/IPA)

If you need to update `eas.json`, see Expo docs: https://docs.expo.dev/build/eas-json/
