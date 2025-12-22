import { importOktagonData, getOktagonImportStats } from './src/services/oktagonDataParser';

// Default to latest files, but allow overriding via command line args
const eventsFile = process.argv[2] || './scraped-data/oktagon/latest-events.json';
const athletesFile = process.argv[3] || './scraped-data/oktagon/latest-athletes.json';

console.log('='.repeat(60));
console.log('OKTAGON MMA DATA PARSER');
console.log('='.repeat(60));

importOktagonData({
  eventsFilePath: eventsFile,
  athletesFilePath: athletesFile,
})
  .then(async () => {
    console.log('\n✅ Import completed successfully!');

    // Show stats
    const stats = await getOktagonImportStats();
    console.log('\n📊 OKTAGON Import Statistics:');
    console.log(`   Total Fighters: ${stats.totalFighters}`);
    console.log(`   OKTAGON Events: ${stats.totalEvents}`);
    console.log(`   OKTAGON Fights: ${stats.totalFights}`);
    console.log(`   Upcoming OKTAGON Events: ${stats.upcomingEvents}`);
    console.log('');

    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
