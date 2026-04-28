/**
 * Fighter Slug Backfill (UFC)
 *
 * One-time pairing of existing Fighter rows with their `ufcAthleteSlug`
 * (extracted from the UFC.com athlete URL). Reads the latest scraped
 * athlete dump and matches DB rows by current (firstName, lastName).
 *
 * Idempotent — only writes when the row's slug is null. Skips on collision
 * (another row already owns that slug) and logs a warning.
 *
 * Companion to the schema migration that adds `Fighter.ufcAthleteSlug`.
 * Once this is run, `importFighters` in ufcDataParser.ts upserts by slug
 * instead of the firstName_lastName composite, so a UFC display-name
 * correction no longer forks a duplicate fighter row.
 *
 * Run: pnpm tsx src/scripts/backfillFighterSlug.ts
 *      or: node dist/scripts/backfillFighterSlug.js
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { extractUfcAthleteSlug, parseFighterName } from '../services/ufcDataParser';

const prisma = new PrismaClient();

interface ScrapedAthlete {
  name: string;
  url: string;
  record?: string;
}

async function main() {
  const file = path.resolve(__dirname, '../../scraped-data/latest-athletes.json');
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}. Run the UFC scraper first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { athletes: ScrapedAthlete[] };
  const athletes = raw.athletes || [];
  console.log(`Loaded ${athletes.length} athletes from latest-athletes.json\n`);

  let matched = 0;
  let alreadySet = 0;
  let updated = 0;
  let collisions = 0;
  let noMatch = 0;
  let noSlug = 0;

  for (const athlete of athletes) {
    const slug = extractUfcAthleteSlug(athlete.url);
    if (!slug) {
      noSlug++;
      console.warn(`  ⚠ No slug extractable from URL for "${athlete.name}" (url=${athlete.url})`);
      continue;
    }

    const { firstName, lastName } = parseFighterName(athlete.name);

    const fighter = await prisma.fighter.findUnique({
      where: { firstName_lastName: { firstName, lastName } },
    });

    if (!fighter) {
      noMatch++;
      console.log(`  · No DB row for ${athlete.name} (slug=${slug}) — will be created on next scraper run`);
      continue;
    }

    matched++;

    if (fighter.ufcAthleteSlug === slug) {
      alreadySet++;
      continue;
    }

    if (fighter.ufcAthleteSlug && fighter.ufcAthleteSlug !== slug) {
      console.warn(`  ⚠ ${athlete.name} (id=${fighter.id}) already has slug "${fighter.ufcAthleteSlug}", scrape says "${slug}" — leaving DB value alone`);
      continue;
    }

    // Slug is null on this row — claim it, unless another row already owns it.
    const existingOwner = await prisma.fighter.findUnique({
      where: { ufcAthleteSlug: slug },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existingOwner && existingOwner.id !== fighter.id) {
      collisions++;
      console.warn(`  ⚠ Slug "${slug}" already owned by ${existingOwner.firstName} ${existingOwner.lastName} (id=${existingOwner.id}); cannot tag ${athlete.name} (id=${fighter.id})`);
      continue;
    }

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: { ufcAthleteSlug: slug },
    });
    updated++;
    console.log(`  ✓ ${athlete.name} -> ${slug}`);
  }

  console.log('\n--- Summary ---');
  console.log(`Athletes processed: ${athletes.length}`);
  console.log(`  no URL/slug:        ${noSlug}`);
  console.log(`  no DB match:        ${noMatch}`);
  console.log(`  matched DB row:     ${matched}`);
  console.log(`    already set:      ${alreadySet}`);
  console.log(`    newly tagged:     ${updated}`);
  console.log(`    slug collisions:  ${collisions}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
