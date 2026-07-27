/**
 * Rules test for the third-party request allowlist.
 *
 * Every byte a Tapology page pulls is billed at DataImpulse residential rates
 * (~$1/GB) and we parse ~6 KB of HTML from it. Measured 2026-07-27 on the VPS:
 * a cleared page is ~1,820 KB warm, of which www.tapology.com is ~165 KB — the
 * rest is the site's header-bidding ad stack. Blocking it took a warm poll to
 * 53 KB (34x) with the challenge still clearing and all 57 bout links present.
 *
 * The two ways this can go wrong are both silent, so both are asserted here:
 * blocking too much (the challenge stops clearing, or a scraper that navigates
 * off Tapology breaks) and blocking too little (we keep paying for ads).
 *
 * Pure decision function — no browser, no network.
 *
 * Run from packages/backend:
 *   npx tsx src/services/tapologyBrowser.requestBlocking.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { shouldBlockRequest } = require('./tapologyBrowser');

const TAPOLOGY = 'www.tapology.com';

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (e: any) {
    failed++;
    console.log(`FAIL  ${label}\n      ${e.message}`);
  }
}

const block = (url: string, resourceType: string, pageHost: string | null = TAPOLOGY) =>
  shouldBlockRequest({ url, resourceType, pageHost });

console.log('\n--- must NOT block (breaking these breaks scraping) ---');

check('the document itself is never blocked', () => {
  assert.strictEqual(block('https://www.tapology.com/fightcenter/events/142881-zuffa-boxing', 'document'), false);
});

check('a document on a completely different host is never blocked', () => {
  // scrapeMVPTapology navigates here; testTapologyProxy hits api.ipify.org.
  assert.strictEqual(block('https://www.mostvaluablepromotions.com/events', 'document', null), false);
  assert.strictEqual(block('https://api.ipify.org/', 'document', null), false);
});

check('Cloudflare challenge assets are always allowed', () => {
  assert.strictEqual(block('https://challenges.cloudflare.com/turnstile/v0/api.js', 'script'), false);
  assert.strictEqual(block('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x/y', 'xhr'), false);
});

check("the page's own scripts and XHR are allowed", () => {
  assert.strictEqual(block('https://www.tapology.com/assets/application.js', 'script'), false);
  assert.strictEqual(block('https://www.tapology.com/fightcenter/bouts/123.json', 'xhr'), false);
});

check('the cdn-cgi challenge platform is same-site, so it survives', () => {
  // Cloudflare serves this from the site's own origin, not challenges.cloudflare.com.
  assert.strictEqual(block('https://www.tapology.com/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1', 'script'), false);
});

check('a subdomain of the navigated site is same-site', () => {
  assert.strictEqual(block('https://static.tapology.com/app.js', 'script'), false);
});

check('unknown page origin fails open rather than blocking a scrape', () => {
  assert.strictEqual(block('https://some-promoter.example/app.js', 'script', null), false);
});

check('data: and blob: URLs are not blocked (no bytes on the wire)', () => {
  assert.strictEqual(block('data:text/html,<title>x</title>', 'document'), false);
  assert.strictEqual(block('blob:https://www.tapology.com/abc', 'script'), false);
});

console.log('\n--- must block (these are the bill) ---');

check('third-party ad + header-bidding hosts are blocked', () => {
  for (const url of [
    'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
    'https://prebid.media.net/bidder',
    'https://a.pub.network/core/pubfig.min.js',
    'https://btlr.sharethrough.com/x',
    'https://fastlane.rubiconproject.com/a/api/fastlane.json',
    'https://g2.gumgum.com/hbid/imp',
    'https://htlb.casalemedia.com/cygnus',
    'https://ib.adnxs.com/ut/v3/prebid',
    'https://direct.adsrvr.org/track',
    'https://c.amazon-adsystem.com/aax2/apstag.js',
    'https://assets.bounceexchange.com/bounce.js',
    'https://ex.ingage.tech/bid',
    'https://hb.yellowblue.io/hb',
    'https://s2s.t13.io/prebid',
    'https://www.googletagmanager.com/gtag/js',
  ]) {
    assert.strictEqual(block(url, 'script'), true, `expected blocked: ${url}`);
  }
});

check('images are blocked even on the site itself', () => {
  // images.tapology.com alone was ~250 KB of a cold load.
  assert.strictEqual(block('https://images.tapology.com/headshot.jpg', 'image'), true);
  assert.strictEqual(block('https://www.tapology.com/logo.png', 'image'), true);
});

check('fonts, media and stylesheets are blocked even same-site', () => {
  assert.strictEqual(block('https://www.tapology.com/app.css', 'stylesheet'), true);
  assert.strictEqual(block('https://fonts.gstatic.com/s/roboto.woff2', 'font'), true);
  assert.strictEqual(block('https://www.tapology.com/promo.mp4', 'media'), true);
});

check('third-party requests are blocked whatever the resource type', () => {
  assert.strictEqual(block('https://securepubads.g.doubleclick.net/x', 'xhr'), true);
  assert.strictEqual(block('https://securepubads.g.doubleclick.net/x', 'fetch'), true);
  assert.strictEqual(block('https://securepubads.g.doubleclick.net/x', 'sub_frame'), true);
});

check('the rule is relative to the page, not hardcoded to tapology', () => {
  // On the MVP promoter site, that site is first-party and tapology is not.
  const pageHost = 'www.mostvaluablepromotions.com';
  assert.strictEqual(block('https://www.mostvaluablepromotions.com/app.js', 'script', pageHost), false);
  assert.strictEqual(block('https://www.tapology.com/app.js', 'script', pageHost), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
