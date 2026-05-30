import { fetchUFCStatsEventList, fetchUFCStatsEvent } from '../../services/scrapeUFCStatsHistoric';

async function main() {
  console.log('--- Fetching event list ---');
  const events = await fetchUFCStatsEventList();
  console.log(`Got ${events.length} events.`);
  console.log('First 3:', events.slice(0, 3).map(e => ({ name: e.name, date: e.date.toISOString().split('T')[0], url: e.ufcStatsUrl })));
  console.log('Last 3:', events.slice(-3).map(e => ({ name: e.name, date: e.date.toISOString().split('T')[0], url: e.ufcStatsUrl })));

  // Pick a recent event and an old one to test parsing
  const recent = events[0];
  console.log(`\n--- Fetching recent event: ${recent.name} ---`);
  const recentDetail = await fetchUFCStatsEvent(recent.ufcStatsUrl);
  console.log(`Got ${recentDetail.fights.length} fights. First fight:`, recentDetail.fights[0]);

  const ufc1 = events.find(e => /UFC 1[: ]/.test(e.name));
  if (ufc1) {
    console.log(`\n--- Fetching UFC 1: ${ufc1.name} ---`);
    const ufc1Detail = await fetchUFCStatsEvent(ufc1.ufcStatsUrl);
    console.log(`Got ${ufc1Detail.fights.length} fights. First fight:`, ufc1Detail.fights[0]);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
