const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.goto('https://oktagonmma.com/en/events/oktagon-87-liberec/?eventDetail=true', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  const result = await page.evaluate(() => {
    const script = document.getElementById('__NEXT_DATA__');
    const next = JSON.parse(script.textContent);
    const queries = next?.props?.pageProps?.dehydratedState?.queries || [];

    let fightCards = [];
    for (const query of queries) {
      const queryKey = query?.queryKey || [];
      const data = query?.state?.data;
      if (queryKey[0] === 'events' && queryKey[1] === 'fightCard' && Array.isArray(data)) {
        fightCards = data;
      }
    }

    const getLocalizedText = (obj) => {
      if (!obj) return '';
      if (typeof obj === 'string') return obj;
      return obj.en || obj.cs || obj.de || Object.values(obj)[0] || '';
    };

    const out = [];
    fightCards.forEach(card => {
      const cardTitle = getLocalizedText(card.title) || 'Main Card';
      const fights = card.fights || [];
      fights.forEach(fight => {
        const f1 = `${fight.fighter1?.firstName || ''} ${fight.fighter1?.lastName || ''}`.trim();
        const f2 = `${fight.fighter2?.firstName || ''} ${fight.fighter2?.lastName || ''}`.trim();
        out.push({ card: cardTitle.trim(), titleFight: fight.titleFight === true, f1, f2 });
      });
    });
    return { cardCount: fightCards.length, fightCount: out.length, fights: out };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
