import { importPFLData, getPFLImportStats } from './src/services/pflDataParser';

// Default to latest files, but allow overriding via command line args
const eventsFile = process.argv[2] || './scraped-data/pfl/latest-events.json';
const athletesFile = process.argv[3] || './scraped-data/pfl/latest-athletes.json';

console.log('='.repeat(60));
console.log('PFL DATA PARSER');
console.log('='.repeat(60));

importPFLData({
  eventsFilePath: eventsFile,
  athletesFilePath: athletesFile,
})
  .then(async () => {
    console.log('\n✅ Import completed successfully!');

    // Show stats
    const stats = await getPFLImportStats();
    console.log('\n📊 PFL Import Statistics:');
    console.log(`   Total Fighters: ${stats.totalFighters}`);
    console.log(`   PFL Events: ${stats.totalEvents}`);
    console.log(`   PFL Fights: ${stats.totalFights}`);
    console.log(`   Upcoming PFL Events: ${stats.upcomingEvents}`);
    console.log('');

    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
