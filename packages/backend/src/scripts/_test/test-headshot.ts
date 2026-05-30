import {
  fetchUFCAthleteHeadshot,
  deriveUFCAthleteSlug,
  launchAthleteBrowser,
  closeAthleteBrowser,
} from '../../services/scrapeUFCAthleteHeadshot';

async function main() {
  const cases = [
    'conor-mcgregor',
    'islam-makhachev',
    'royce-gracie',
    'tito-ortiz',
    'jon-jones',
    'nonexistent-fighter-xyz',
  ];
  console.log('Launching headless Chrome...');
  const handle = await launchAthleteBrowser();
  try {
    for (const slug of cases) {
      const r = await fetchUFCAthleteHeadshot(slug, handle);
      console.log(`${slug}\n  -> ${r.status}  ${r.imageUrl || ''}  err=${r.errorMessage || ''}`);
    }
  } finally {
    await closeAthleteBrowser(handle);
  }

  console.log('\n--- slug derivation ---');
  for (const name of ['Conor McGregor', 'Israel Adesanya', 'Donald Cerrone', "Jose Aldo Jr.", 'Khabib Nurmagomedov']) {
    console.log(`  ${name} -> ${deriveUFCAthleteSlug(name)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
