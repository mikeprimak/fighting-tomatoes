import { importBKFCData, getBKFCImportStats } from './src/services/bkfcDataParser';

// Default to latest files, but allow overriding via command line args
const eventsFile = process.argv[2] || './scraped-data/bkfc/latest-events.json';
const athletesFile = process.argv[3] || './scraped-data/bkfc/latest-athletes.json';

console.log('='.repeat(60));
console.log('BKFC DATA PARSER');
console.log('='.repeat(60));

importBKFCData({
  eventsFilePath: eventsFile,
  athletesFilePath: athletesFile,
})
  .then(async () => {
    console.log('\n✅ Import completed successfully!');

    // Show stats
    const stats = await getBKFCImportStats();
    console.log('\n📊 BKFC Import Statistics:');
    console.log(`   Total Boxing Fighters: ${stats.totalFighters}`);
    console.log(`   BKFC Events: ${stats.totalEvents}`);
    console.log(`   BKFC Fights: ${stats.totalFights}`);
    console.log(`   Upcoming BKFC Events: ${stats.upcomingEvents}`);
    console.log('');

    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
