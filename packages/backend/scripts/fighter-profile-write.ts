/**
 * Persist hand-authored fighter profiles (the no-API backfill path).
 *
 * Input: a JSON file of profile records synthesized by Claude Code in-loop,
 * matching the shape extractFighterProfile.ts produces. Reuses the shared
 * persistFighterProfile() so the confidence floor, content guard, and record-key
 * snapshot are identical to the cron path. recordKey is recomputed from the LIVE
 * fighter row (authoritative), never trusted from the input.
 *
 * Usage:
 *   pnpm exec tsx scripts/fighter-profile-write.ts <path-to-json> [--dry-run] [--sources <batch.json>]
 *
 * --sources points at the dump batch file; when a record omits sourceUrls, the
 * fighter's fetched source URLs are looked up from the dump by fighterId. Avoids
 * hand-copying grounding URLs into the authored file.
 *
 * JSON shape:
 *   {
 *     "records": [
 *       {
 *         "fighterId": "uuid",
 *         "profile": {
 *           "tldr": "...", "careerArc": "...", "style": "...",
 *           "highlights": ["..."],
 *           "signatureFights": [{ "opponent": "...", "result": "...", "whyItMattered": "..." }],
 *           "appeal": "...", "personaType": "fan-favorite|heel|...|null",
 *           "whyFansLove": "...", "whyFansHate": "..." | null,
 *           "confidence": 0.85
 *         },
 *         "summary": "long-form prose ...",
 *         "sourceUrls": ["https://...", ...],
 *         "confidence": 0.85
 *       }
 *     ]
 *   }
 */

import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  persistFighterProfile,
  fighterRecordKey,
} from '../src/services/aiEnrichment/fighterProfile/persistFighterProfile';
import type { FighterProfileRecord, FighterProfileData } from '../src/services/aiEnrichment/fighterProfile/extractFighterProfile';

interface InputRecord {
  fighterId: string;
  profile: Partial<FighterProfileData>;
  summary?: string;
  sourceUrls?: string[];
  confidence?: number;
}

function coerceProfile(p: Partial<FighterProfileData>, confidence: number): FighterProfileData {
  return {
    tldr: p.tldr ?? null,
    careerArc: p.careerArc ?? null,
    style: p.style ?? null,
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    signatureFights: Array.isArray(p.signatureFights) ? p.signatureFights : [],
    appeal: p.appeal ?? null,
    personaType: p.personaType ?? null,
    whyFansLove: p.whyFansLove ?? null,
    whyFansHate: p.whyFansHate ?? null,
    confidence,
  };
}

async function main() {
  const jsonPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!jsonPath) {
    console.error('usage: fighter-profile-write.ts <json-path> [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { records: InputRecord[] };
  if (!Array.isArray(input.records) || input.records.length === 0) {
    console.error('No records in input file');
    process.exit(1);
  }

  // Optional sourceUrls lookup from the dump batch.
  const srcIdx = process.argv.indexOf('--sources');
  const urlsByFighter = new Map<string, string[]>();
  if (srcIdx >= 0 && process.argv[srcIdx + 1]) {
    const batch = JSON.parse(fs.readFileSync(process.argv[srcIdx + 1], 'utf8'));
    for (const f of batch.fighters ?? []) {
      urlsByFighter.set(f.fighterId, (f.sources ?? []).map((s: any) => s.url).filter(Boolean));
    }
  }

  const prisma = new PrismaClient();
  let wrote = 0;
  let skipped = 0;
  const notFound: string[] = [];

  for (const rec of input.records) {
    const fighter = await prisma.fighter.findUnique({ where: { id: rec.fighterId } });
    if (!fighter) {
      notFound.push(rec.fighterId);
      console.error(`! fighter ${rec.fighterId} not found — skipping`);
      continue;
    }
    const name = `${fighter.firstName} ${fighter.lastName}`.trim();

    const confidence = typeof rec.confidence === 'number'
      ? rec.confidence
      : (typeof rec.profile.confidence === 'number' ? rec.profile.confidence : 0.7);

    const record: FighterProfileRecord = {
      profile: coerceProfile(rec.profile, confidence),
      summary: rec.summary ?? '',
      confidence,
    };

    const sourceUrls = rec.sourceUrls ?? urlsByFighter.get(fighter.id) ?? [];
    const outcome = await persistFighterProfile(
      prisma,
      fighter.id,
      record,
      sourceUrls,
      fighterRecordKey(fighter),
      { dryRun },
    );

    if (outcome.wrote) {
      wrote++;
      console.error(`  ${dryRun ? '[dry] ' : ''}wrote ${name} (conf ${confidence})`);
    } else {
      skipped++;
      console.error(`  skip ${name}: ${outcome.reason}`);
    }
  }

  console.error(`\n${dryRun ? '[DRY RUN] ' : ''}wrote ${wrote}, skipped ${skipped}, notFound ${notFound.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
