/**
 * Contract test for the shared Tapology browser session.
 *
 * The live tracker used to launch and close a browser per poll, which threw away
 * the cf_clearance cookie CapSolver had just paid for and re-paid Cloudflare's
 * ~1 MB challenge every 150s on a metered residential proxy (measured
 * 2026-07-26: ~1,070 KB challenge vs ~6 KB of real HTML). The saving depends
 * entirely on the browser genuinely persisting across fetches, so that is what
 * this asserts — plus the bounds that stop an 8-hour card from leaking Chrome.
 *
 * Deliberately does NOT hit Tapology: this is about session lifecycle, and
 * Cloudflare/proxy behaviour can't be reproduced deterministically in a test.
 * Navigation targets are data: URLs, so it needs no network and no proxy.
 *
 * Run from packages/backend:
 *   npx tsx src/services/tapologyBrowser.sharedSession.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSharedTapologyBrowser, closeSharedTapologyBrowser } = require('./tapologyBrowser');

const PAGE = 'data:text/html,<title>shared-session-test</title><h1>ok</h1>';

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${label}`);
}

async function fetchOnce(): Promise<{ browser: any; title: string }> {
  const browser = await getSharedTapologyBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { browser, title: await page.title() };
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  console.log('shared Tapology browser session\n');

  try {
    // ---- 1. The browser is REUSED across fetches (the whole point) ----------
    const a = await fetchOnce();
    const b = await fetchOnce();
    const c = await fetchOnce();
    check('same browser instance is reused across three fetches', () => {
      assert.strictEqual(a.browser, b.browser);
      assert.strictEqual(b.browser, c.browser);
    });
    check('pages still load through the shared browser', () => {
      assert.strictEqual(a.title, 'shared-session-test');
      assert.strictEqual(c.title, 'shared-session-test');
    });

    // ---- 2. Pages do not accumulate ----------------------------------------
    // fetchHtmlWithRetry closes its own page now that the browser outlives the
    // fetch; if that ever regresses, an 8-hour card leaks a tab every 150s.
    const openPages = await a.browser.pages();
    check(`no page leak (${openPages.length} open, expect <= 1 blank tab)`, () => {
      assert.ok(openPages.length <= 1, `expected <= 1 open page, got ${openPages.length}`);
    });

    // ---- 3. Explicit recycle hands back a genuinely new browser -------------
    // This is what the "challenge not cleared" path does to shed a flagged
    // sticky exit, so it must really replace the session, not no-op.
    await closeSharedTapologyBrowser('test-recycle');
    const d = await fetchOnce();
    check('recycle yields a different browser instance', () => {
      assert.notStrictEqual(d.browser, a.browser);
    });
    check('old browser is actually closed', () => {
      const alive = typeof a.browser.connected === 'boolean' ? a.browser.connected : a.browser.isConnected();
      assert.strictEqual(alive, false);
    });
    check('new browser is alive', () => {
      const alive = typeof d.browser.connected === 'boolean' ? d.browser.connected : d.browser.isConnected();
      assert.strictEqual(alive, true);
    });

    // ---- 4. Recycling is safe to call when nothing is open ------------------
    await closeSharedTapologyBrowser('test-teardown');
    await closeSharedTapologyBrowser('test-teardown-again');
    check('closing twice does not throw', () => {
      assert.ok(true);
    });

    // ---- 5. Concurrent callers share ONE launch, not one each ---------------
    // Two trackers can poll at once; if each raced its own launch we would pay
    // two challenges and leak one browser handle.
    const [p, q, r] = await Promise.all([
      getSharedTapologyBrowser(),
      getSharedTapologyBrowser(),
      getSharedTapologyBrowser(),
    ]);
    check('concurrent callers get the same instance', () => {
      assert.strictEqual(p, q);
      assert.strictEqual(q, r);
    });

    await closeSharedTapologyBrowser('test-end');
    console.log(`\n✅ ${passed} assertions passed`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ FAILED: ${err.message}`);
    await closeSharedTapologyBrowser('test-failure').catch(() => {});
    process.exit(1);
  }
})();
