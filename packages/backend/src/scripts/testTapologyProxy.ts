/**
 * Smoke test for the residential-proxy Tapology path (DataImpulse etc.).
 *
 * Run with TAPOLOGY_PROXY set and SCRAPFLY_KEY UNSET, e.g.:
 *   TAPOLOGY_PROXY="http://USER:PASS@gw.dataimpulse.com:823" \
 *     npx tsx src/scripts/testTapologyProxy.ts
 *
 * Reports, for one upcoming-events page per failing org:
 *   - the egress IP (confirms we're going OUT through the residential proxy)
 *   - whether Cloudflare's challenge cleared
 *   - the page <title> + HTML length
 *   - how many event links the page exposes (0 = still blocked / wrong page)
 *
 * Exit code is non-zero if ANY org fails to clear, so it's CI-friendly.
 */
const { launchTapologyBrowser, newTapologyPage, waitForCloudflareClear, isScrapflyEnabled } = require('../services/tapologyBrowser.js');

const ORGS: Array<{ name: string; url: string }> = [
  { name: 'MVP', url: 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp' },
  { name: 'Gamebred', url: 'https://www.tapology.com/fightcenter/promotions/3931-gamebred-fighting-championship-gbfc' },
  { name: 'Dirty Boxing', url: 'https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc' },
];

async function checkEgressIp(): Promise<void> {
  // Pull the egress IP through the SAME proxy the browser uses, so we can prove
  // traffic is leaving via the residential pool (and see which country/IP).
  const proxyRaw = process.env.TAPOLOGY_PROXY;
  if (!proxyRaw) {
    console.log('  (no TAPOLOGY_PROXY set — egress check skipped)');
    return;
  }
  const browser = await launchTapologyBrowser();
  try {
    const page = await newTapologyPage(browser);
    await page.goto('https://api.ipify.org?format=json', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(`  egress IP: ${txt.trim()}`);
  } catch (e: any) {
    console.log(`  egress IP check failed: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function checkOrg(org: { name: string; url: string }): Promise<boolean> {
  const browser = await launchTapologyBrowser();
  try {
    const page = await newTapologyPage(browser);
    await page.goto(org.url, { waitUntil: 'networkidle2', timeout: 60000 });
    const cleared = await waitForCloudflareClear(page);
    const title = await page.title().catch(() => '(no title)');
    const html = await page.content();
    const eventLinks = await page
      .evaluate(() => document.querySelectorAll('a[href*="/fightcenter/events/"]').length)
      .catch(() => 0);
    const ok = cleared && eventLinks > 0;
    console.log(`\n[${org.name}] ${ok ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  cleared: ${cleared} | title: "${title}" | html: ${html.length} chars | event links: ${eventLinks}`);
    return ok;
  } catch (e: any) {
    console.log(`\n[${org.name}] ❌ FAIL — ${e.message}`);
    return false;
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  console.log(`Tapology proxy smoke test`);
  console.log(`  SCRAPFLY_KEY: ${isScrapflyEnabled() ? 'SET (⚠️ unset it to exercise the proxy path)' : 'unset (good)'}`);
  console.log(`  TAPOLOGY_PROXY: ${process.env.TAPOLOGY_PROXY ? 'set' : 'NOT SET (⚠️ nothing to test)'}`);
  await checkEgressIp();

  let allOk = true;
  for (const org of ORGS) {
    const ok = await checkOrg(org);
    allOk = allOk && ok;
  }
  console.log(`\n${allOk ? '✅ All orgs cleared Cloudflare.' : '❌ At least one org failed — see above.'}`);
  process.exit(allOk ? 0 : 1);
})();
