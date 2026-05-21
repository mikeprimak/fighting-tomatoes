/** Smoke-test the bkfc.com fetcher against a real event URL. */
import { fetchBkfcEventPreview } from '../src/services/aiEnrichment/fetchBkfcEventPreview';

(async () => {
  const urls = [
    'https://www.bkfc.com/events/bkfc-90-birmingham-tierny-vs-franco',
    'https://www.bkfc.com/events/bkfc-palm-desert',
  ];
  for (const url of urls) {
    const snap = await fetchBkfcEventPreview(url);
    if (!snap) {
      console.log(`FAIL ${url}`);
      continue;
    }
    console.log(`OK   ${url}`);
    console.log(`     ${snap.text.length} chars`);
    console.log(`     first 300: ${snap.text.slice(0, 300)}`);
    console.log(`     ---`);
  }
})();
