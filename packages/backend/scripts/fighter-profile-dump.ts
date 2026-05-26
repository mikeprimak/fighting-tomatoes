/**
 * Dump bio sources for a batch of fighters so Claude Code (Opus, in-loop) can
 * author the aiProfile by hand — the no-API backfill path, mirroring the historic
 * fight-enrichment campaign (Phase 6.5).
 *
 * Selects engagement-ranked fighters that still need a profile (never enriched,
 * record changed since last enrich, or stale), fetches each one's biographical
 * sources (UFC athlete page + Wikipedia + editorial) and notable fights, and
 * writes one JSON file for the batch. I read that file, write profiles into an
 * output file, and `fighter-profile-write.ts` persists them.
 *
 * Usage:
 *   pnpm exec tsx scripts/fighter-profile-dump.ts [limit=25] [offset=0] [outPath]
 *
 * Partition the head by offset for successive batches:
 *   batch 1: ... 25 0
 *   batch 2: ... 25 25
 *
 * Engagement = fight_ratings + follows (NOT the denormalized totalRatings).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { launchPreviewBrowser, closePreviewBrowser } from '../src/services/aiEnrichment/fetchUFCEventPreview';
import { fetchFighterBio } from '../src/services/aiEnrichment/fighterProfile/fetchFighterBio';

interface PickRow {
  id: string;
  rating_count: number;
  follower_count: number;
  has_ufc_slug: boolean;
}

function prettyWeightClass(wc: string | null): string | null {
  if (!wc) return null;
  return wc
    .toLowerCase()
    .split('_')
    .map((w) => (w === 'womens' ? "Women's" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

async function main() {
  const limit = Number(process.argv[2] ?? 25);
  const offset = Number(process.argv[3] ?? 0);
  const outPath =
    process.argv[4] ?? path.join('tmp', `fighter-profile-batch-${offset}-${limit}.json`);

  const prisma = new PrismaClient();

  // Engagement-ranked fighters needing a profile. Mirrors runFighterProfile's
  // selectCandidates, minus the threshold (backfill walks the head explicitly).
  const picks = await prisma.$queryRaw<PickRow[]>`
    WITH eng AS (
      SELECT fighter_id, COUNT(*)::int AS rating_count
      FROM (
        SELECT f."fighter1Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
        UNION ALL
        SELECT f."fighter2Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
      ) x
      WHERE fighter_id IS NOT NULL
      GROUP BY fighter_id
    ),
    fol AS (
      SELECT "fighterId" AS fighter_id, COUNT(*)::int AS follower_count
      FROM user_fighter_follows GROUP BY "fighterId"
    )
    SELECT
      ft.id AS id,
      COALESCE(eng.rating_count, 0) AS rating_count,
      COALESCE(fol.follower_count, 0) AS follower_count,
      (ft."ufcAthleteSlug" IS NOT NULL) AS has_ufc_slug
    FROM fighters ft
    LEFT JOIN eng ON eng.fighter_id = ft.id
    LEFT JOIN fol ON fol.fighter_id = ft.id
    WHERE ft."aiProfileEnrichedAt" IS NULL
    ORDER BY (COALESCE(eng.rating_count, 0) + COALESCE(fol.follower_count, 0) * 3) DESC,
             COALESCE(eng.rating_count, 0) DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  if (picks.length === 0) {
    console.error('No fighters need a profile in this window. Done.');
    await prisma.$disconnect();
    return;
  }

  const needsBrowser = picks.some((p) => p.has_ufc_slug);
  const handle = needsBrowser ? await launchPreviewBrowser() : undefined;

  const out: any[] = [];
  try {
    for (const p of picks) {
      const f = await prisma.fighter.findUnique({ where: { id: p.id } });
      if (!f) continue;
      const name = `${f.firstName} ${f.lastName}`.trim();

      const bio = await fetchFighterBio(
        { firstName: f.firstName, lastName: f.lastName, nickname: f.nickname, ufcAthleteSlug: f.ufcAthleteSlug, sport: f.sport },
        { browser: f.ufcAthleteSlug ? handle?.browser : undefined },
      );

      // Notable fights from THIS fighter's perspective, recent first.
      const fights = await prisma.fight.findMany({
        where: {
          fightStatus: 'COMPLETED',
          winner: { not: null },
          OR: [{ fighter1Id: f.id }, { fighter2Id: f.id }],
        },
        include: {
          fighter1: { select: { id: true, firstName: true, lastName: true } },
          fighter2: { select: { id: true, firstName: true, lastName: true } },
          event: { select: { name: true, date: true } },
        },
        orderBy: { event: { date: 'desc' } },
        take: 20,
      });
      const notableFights = fights.map((fi) => {
        const isF1 = fi.fighter1Id === f.id;
        const opp = isF1 ? fi.fighter2 : fi.fighter1;
        let outcome = 'Result';
        if (fi.winner === f.id) outcome = 'Win';
        else if (fi.winner && (fi.winner === fi.fighter1Id || fi.winner === fi.fighter2Id)) outcome = 'Loss';
        else if (fi.winner?.toLowerCase() === 'draw') outcome = 'Draw';
        else if (fi.winner) outcome = 'No Contest';
        const detail = [fi.method, fi.round != null ? `R${fi.round}` : null].filter(Boolean).join(', ');
        return {
          opponent: `${opp.firstName} ${opp.lastName}`.trim(),
          result: detail ? `${outcome} — ${detail}` : outcome,
          date: fi.event?.date ? fi.event.date.toISOString().slice(0, 10) : null,
          event: fi.event?.name ?? null,
        };
      });

      const nc = f.noContests;
      const hasRecord = f.wins + f.losses + f.draws + nc > 0;
      out.push({
        fighterId: f.id,
        name,
        engagement: { ratings: p.rating_count, followers: p.follower_count },
        identity: {
          firstName: f.firstName,
          lastName: f.lastName,
          nickname: f.nickname,
          record: hasRecord ? `${f.wins}-${f.losses}-${f.draws}${nc > 0 ? ` (${nc} NC)` : ''}` : null,
          weightClass: prettyWeightClass(f.weightClass),
          rank: f.rank,
          isChampion: f.isChampion,
          championshipTitle: f.championshipTitle,
          sport: f.sport,
          isActive: f.isActive,
        },
        notableFights,
        sourcesFetched: bio.attempted,
        sources: bio.sources, // [{ url, text, label }]
      });

      console.error(
        `  dumped ${name}  (r${p.rating_count}/f${p.follower_count})  sources: ${bio.attempted.map((a) => `${a.label}=${a.ok ? a.chars : 'X'}`).join(' ')}`,
      );
    }
  } finally {
    if (handle) await closePreviewBrowser(handle);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), offset, limit, fighters: out }, null, 2));
  console.error(`\nWrote ${out.length} fighters to ${outPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
