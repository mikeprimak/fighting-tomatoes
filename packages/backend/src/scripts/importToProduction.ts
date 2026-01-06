/**
 * Import scraped UFC data directly to production database
 *
 * Usage: DATABASE_URL="postgresql://..." npx ts-node src/scripts/importToProduction.ts
 */

import { importUFCData } from '../services/ufcDataParser';
import * as path from 'path';

// Use environment variable - NEVER hardcode credentials!
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node src/scripts/importToProduction.ts');
  process.exit(1);
}

// Override BASE_URL to production for image URLs
process.env.BASE_URL = 'https://fightcrewapp-backend.onrender.com';

async function main() {
  console.log('🚀 Importing UFC data to PRODUCTION database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com');
  console.log('📍 Base URL: https://fightcrewapp-backend.onrender.com\n');

  const eventsFile = path.join(__dirname, '../../scraped-data/latest-events.json');
  const athletesFile = path.join(__dirname, '../../scraped-data/latest-athletes.json');

  await importUFCData({
    eventsFilePath: eventsFile,
    athletesFilePath: athletesFile,
    year: 2025
  });

  console.log('\n✅ Production import complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
