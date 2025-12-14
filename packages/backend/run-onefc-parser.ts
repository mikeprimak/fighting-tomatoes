import { importOneFCData, getOneFCImportStats } from './src/services/oneFCDataParser';

// Default to latest files, but allow overriding via command line args
const eventsFile = process.argv[2] || './scraped-data/onefc/latest-events.json';
const athletesFile = process.argv[3] || './scraped-data/onefc/latest-athletes.json';

console.log('='.repeat(60));
console.log('ONE FC DATA PARSER');
console.log('='.repeat(60));

importOneFCData({
  eventsFilePath: eventsFile,
  athletesFilePath: athletesFile,
})
  .then(async () => {
    console.log('\n✅ Import completed successfully!');

    // Show stats
    const stats = await getOneFCImportStats();
    console.log('\n📊 ONE FC Import Statistics:');
    console.log(`   Total Fighters: ${stats.totalFighters}`);
    console.log(`   ONE FC Events: ${stats.totalEvents}`);
    console.log(`   ONE FC Fights: ${stats.totalFights}`);
    console.log(`   Upcoming ONE FC Events: ${stats.upcomingEvents}`);
    console.log('');

    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
