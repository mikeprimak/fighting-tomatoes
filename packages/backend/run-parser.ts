import { importUFCData } from './src/services/ufcDataParser';

const eventsFile = './scraped-data/events-2025-10-04T20-13-42-664Z.json';
const athletesFile = './scraped-data/athletes-2025-10-04T20-13-42-664Z.json';

importUFCData({
  eventsFilePath: eventsFile,
  athletesFilePath: athletesFile,
  year: 2025
})
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
