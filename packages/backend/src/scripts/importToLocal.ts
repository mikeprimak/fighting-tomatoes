/**
 * Import scraped UFC data to local development database
 * Run with: npx ts-node src/scripts/importToLocal.ts
 */

import { importUFCData } from '../services/ufcDataParser';
import * as path from 'path';

async function main() {
  console.log('🚀 Importing UFC data to LOCAL database...\n');
  console.log('📍 Database: localhost:5433/yourapp_dev');
  console.log('📍 Base URL: http://localhost:3008\n');

  const eventsFile = path.join(__dirname, '../../scraped-data/latest-events.json');
  const athletesFile = path.join(__dirname, '../../scraped-data/latest-athletes.json');

  await importUFCData({
    eventsFilePath: eventsFile,
    athletesFilePath: athletesFile,
    year: 2025
  });

  console.log('\n✅ Local import complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
