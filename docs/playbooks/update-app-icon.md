# Update App Icon

## Icon files (in project root)

- `GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png` — thick stroke, NO fill (current)
- `GOOD-FIGHTS-ICON-HAND-THICKER-FINGER.png` — thick stroke, WITH fill

## Steps

1. Copy new icon to assets:
   ```bash
   cp "GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png" "packages/mobile/assets/homescreen-icon.png"
   cp "GOOD-FIGHTS-ICON-HAND-THICKER-GREY-BG.png" "packages/mobile/assets/adaptive-icon-foreground-new.png"
   ```

2. Clear ALL caches and regenerate native files:
   ```bash
   cd packages/mobile && rm -rf .expo dist && npx expo prebuild --clean --platform android
   ```

3. Update versionCode in BOTH files:
   - `packages/mobile/app.json` (line ~56)
   - `packages/mobile/android/app/build.gradle` (line ~95)

4. Build: `eas build --platform android --profile production`

5. **After installing on device**: If icon doesn't update, clear Android launcher cache:
   - Settings > Apps > [Your Launcher] > Storage > Clear Cache
   - Or Force Stop the launcher

## Switching dev WiFi networks (IP change)

When switching networks, update the dev IP in **2 files**:

1. Get your new IP: `ipconfig | findstr "IPv4"`
2. Update:
   - `packages/mobile/services/api.ts` line ~20
   - `packages/mobile/store/AuthContext.tsx` line ~76
3. Reload the app

**Known IPs**: Home `10.0.0.53` | Work `192.168.1.65`
