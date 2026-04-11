const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.goto('https://oktagonmma.com/en/events/oktagon-87-liberec/?eventDetail=true', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  const data = await page.evaluate(() => {
    const script = document.getElementById('__NEXT_DATA__');
    if (!script) return { error: 'no __NEXT_DATA__' };
    const next = JSON.parse(script.textContent);
    const queries = next?.props?.pageProps?.dehydratedState?.queries || [];
    const summary = queries.map((q, i) => ({
      i,
      queryKey: q?.queryKey,
      dataType: Array.isArray(q?.state?.data) ? `array[${q.state.data.length}]` : (q?.state?.data ? typeof q.state.data : 'null'),
    }));
    // Look specifically for fightCard queries
    const fightCardQueries = queries.filter(q => (q?.queryKey || []).some(k => typeof k === 'string' && k.toLowerCase().includes('fight')));
    return {
      totalQueries: queries.length,
      allKeys: summary,
      fightCardQueries: fightCardQueries.map(q => ({
        queryKey: q.queryKey,
        data: Array.isArray(q.state?.data) ? `array[${q.state.data.length}]` : (q.state?.data && typeof q.state.data === 'object' ? Object.keys(q.state.data) : q.state?.data),
        firstItem: Array.isArray(q.state?.data) && q.state.data.length > 0 ? JSON.stringify(q.state.data[0]).slice(0, 500) : null,
      })),
      pageProps: Object.keys(next?.props?.pageProps || {}),
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
