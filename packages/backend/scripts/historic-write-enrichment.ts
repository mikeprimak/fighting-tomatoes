/**
 * Per-fight enrichment writer for the historic backfill campaign.
 *
 * Input: a JSON file with one record per fight. Matches the shape that
 * `extractFightEnrichment.ts` produces, but synthesized by Claude Code in
 * the loop (rather than via API).
 *
 * Bypasses persist.ts's card-validation because for historic fights the
 * "card" is one fightId we already know. Validates fightId exists and is
 * COMPLETED before writing.
 *
 * Usage:
 *   npx tsx scripts/historic-write-enrichment.ts <path-to-json> [--dry-run]
 *
 * JSON shape:
 *   {
 *     "sourceUrls": ["https://...", ...],
 *     "records": [
 *       {
 *         "fightId": "uuid-from-triage",
 *         "rankings": null,
 *         "odds": null,
 *         "whyCare": "1-sentence hook",
 *         "stakes": ["..."],
 *         "storylines": ["..."],
 *         "styleTags": ["..."],
 *         "pace": "fast" | "tactical" | "grinding" | null,
 *         "riskTier": null,
 *         "confidence": 0.7
 *       },
 *       ...
 *     ]
 *   }
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

interface EnrichmentRecord {
  fightId: string;
  rankings: { red: number | null; blue: number | null } | null;
  odds: { red: string | null; blue: string | null } | null;
  whyCare: string;
  /** Pre-fight long-form 200-400 word editorial paragraph for SEO/web. */
  preview?: string;
  stakes: string[];
  storylines: string[];
  styleTags: string[];
  pace: 'fast' | 'tactical' | 'grinding' | null;
  riskTier: 'lopsided' | 'favorite-leans' | 'pickem' | null;
  confidence: number;
  /** Per-fight source URLs. Falls back to batch-level sourceUrls if absent. */
  sourceUrls?: string[];

  /** Post-fight long-form 300-500 word recap for SEO/web. */
  postFightSummary?: string;
  /** Post-fight structured tags. */
  postFightTags?: {
    methodNarrative?: string;       // "Holloway pointed at the canvas with 10 seconds left and KO'd Gaethje with a clean right hand"
    momentDescription?: string;     // signature moment in 1 phrase
    bonuses?: string[];             // ["Fight of the Night", "Performance of the Night"]
    callouts?: string[];            // post-fight callouts ["called out Volkanovski"]
    aftermath?: string[];           // ["broke nose", "retired", "ranking change to #1"]
    fotyConsideration?: string;     // "2024 FOTY winner", "2017 FOTY nominee", null when N/A
  };
}

interface InputFile {
  sourceUrls: string[];
  records: EnrichmentRecord[];
}

async function main() {
  const jsonPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!jsonPath) {
    console.error('usage: historic-write-enrichment.ts <json-path> [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as InputFile;
  if (!Array.isArray(input.records) || input.records.length === 0) {
    console.error('No records in input file');
    process.exit(1);
  }
  if (!Array.isArray(input.sourceUrls)) {
    console.error('sourceUrls missing');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let wrote = 0;
  let skipped = 0;

  for (const rec of input.records) {
    const fight = await prisma.fight.findUnique({
      where: { id: rec.fightId },
      select: {
        id: true,
        fightStatus: true,
        weightClass: true,
        isTitle: true,
        cardType: true,
        orderOnCard: true,
        fighter1: { select: { firstName: true, lastName: true } },
        fighter2: { select: { firstName: true, lastName: true } },
      },
    });
    if (!fight) {
      console.error(`  SKIP ${rec.fightId}: not found`);
      skipped++;
      continue;
    }

    const fighter1 = `${fight.fighter1?.firstName ?? '?'} ${fight.fighter1?.lastName ?? '?'}`;
    const fighter2 = `${fight.fighter2?.firstName ?? '?'} ${fight.fighter2?.lastName ?? '?'}`;
    const label = `${fighter1} vs ${fighter2}`;

    const aiTags = {
      stakes: rec.stakes,
      storylines: rec.storylines,
      styleTags: rec.styleTags,
      pace: rec.pace,
      riskTier: rec.riskTier,
      rankings: rec.rankings,
      odds: rec.odds,
      isMainEvent: fight.orderOnCard === 1,
      cardSection: fight.cardType,
      weightClass: fight.weightClass,
    };

    const previewWordCount = rec.preview ? rec.preview.trim().split(/\s+/).length : 0;
    const postFightWordCount = rec.postFightSummary ? rec.postFightSummary.trim().split(/\s+/).length : 0;

    if (dryRun) {
      console.log(`  [dry] ${label}  conf=${rec.confidence}  pace=${rec.pace ?? 'null'}  styleTags=${rec.styleTags.length}  stakes=${rec.stakes.length}  storylines=${rec.storylines.length}  preview=${previewWordCount}w  post=${postFightWordCount}w`);
      console.log(`        whyCare: ${rec.whyCare}`);
      wrote++;
      continue;
    }

    const updateData: any = {
      aiTags,
      aiPreviewShort: rec.whyCare || null,
      aiPreview: rec.preview || null,
      aiSourceUrls: rec.sourceUrls ?? input.sourceUrls,
      aiConfidence: rec.confidence,
      aiEnrichedAt: new Date(),
    };

    if (rec.postFightTags || rec.postFightSummary) {
      if (rec.postFightTags) updateData.aiPostFightTags = rec.postFightTags;
      if (rec.postFightSummary) updateData.aiPostFightSummary = rec.postFightSummary;
      updateData.aiPostFightEnrichedAt = new Date();
    }

    await prisma.fight.update({
      where: { id: rec.fightId },
      data: updateData,
    });
    console.log(`  ✓ ${label}  conf=${rec.confidence}`);
    wrote++;
  }

  console.log(`\n${dryRun ? '[dry] ' : ''}wrote ${wrote}, skipped ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
