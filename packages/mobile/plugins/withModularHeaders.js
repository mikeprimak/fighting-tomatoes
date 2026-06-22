const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Inject `use_modular_headers!` into the generated iOS Podfile.
 *
 * Several Google/Firebase pods pulled in transitively (AppCheckCore depends on
 * GoogleUtilities + RecaptchaInterop) are Swift pods that "do not define
 * modules", so CocoaPods refuses to integrate them as static libraries:
 *   [!] The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *       `RecaptchaInterop`, which do not define modules.
 * These pod versions float, so this breaks fresh `pod install` runs (managed
 * prebuild has no committed Podfile to pin). Enabling modular headers globally
 * is CocoaPods' documented fix and generates the needed module maps.
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /(platform :ios[^\n]*\n)/,
          `$1\n# Generate module maps for non-modular Google/Firebase pods (AppCheckCore et al).\nuse_modular_headers!\n`,
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
