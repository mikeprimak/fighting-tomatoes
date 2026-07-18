/**
 * Hype vs. reality analysis — the P6 data-article engine (read-only).
 *
 * For every COMPLETED fight in the window, compares pre-fight hype
 * (FightPrediction.predictedRating, 1-10) with the post-fight community
 * rating (Fight.averageRating). Surfaces the biggest letdowns (hyped, then
 * flopped), the biggest overdeliveries (slept on, then banged), and the
 * most-hyped fights of the window.
 *
 * Only hype votes CREATED BEFORE the event started count (createdAt vs
 * mainStartTime, falling back to event date). Hype collection launched
 * ~2026-04-15; votes on earlier fights are retro-hype, not anticipation,
 * and this filter drops them without needing a hand-picked cutoff.
 * Pass --allow-retro-hype to disable (data archaeology only, never for
 * published numbers).
 *
 * Usage (from packages/backend/):
 *   npx tsx scripts/hype-vs-reality.ts [--from 2026-01-01] [--to 2026-12-31] \
 *     [--min-hype 5] [--min-ratings 5] [--allow-retro-hype]
 */
import { prisma } from '../src/lib/prisma';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const FROM = new Date(arg('from', '2026-01-01'));
const TO = new Date(arg('to', new Date().toISOString().slice(0, 10)));
const MIN_HYPE = parseInt(arg('min-hype', '5'), 10);
const MIN_RATINGS = parseInt(arg('min-ratings', '5'), 10);
const ALLOW_RETRO_HYPE = process.argv.includes('--allow-retro-hype');

interface Row {
  label: string;
  event: string;
  date: string;
  promotion: string | null;
  avgHype: number;
  hypeCount: number;
  avgRating: number;
  ratingCount: number;
  gap: number; // rating − hype; negative = letdown
}

async function main() {
  const fights = await prisma.fight.findMany({
    where: {
      fightStatus: 'COMPLETED',
      event: { date: { gte: FROM, lte: TO } },
    },
    select: {
      averageRating: true,
      totalRatings: true,
      isTitle: true,
      cardType: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
      event: { select: { name: true, date: true, promotion: true, mainStartTime: true } },
      predictions: {
        // Internal accounts (testdev/applereview/etc.) never count toward
        // published hype numbers.
        where: { predictedRating: { not: null }, user: { email: { not: { endsWith: '@goodfights.app' } } } },
        select: { predictedRating: true, createdAt: true },
      },
    },
  });

  const rows: Row[] = [];
  for (const f of fights) {
    const eventStart = f.event.mainStartTime ?? f.event.date;
    const hypes = f.predictions
      .filter((p) => ALLOW_RETRO_HYPE || p.createdAt < eventStart)
      .map((p) => p.predictedRating as number);
    if (hypes.length < MIN_HYPE) continue;
    if (!f.averageRating || (f.totalRatings ?? 0) < MIN_RATINGS) continue;
    const avgHype = hypes.reduce((a, b) => a + b, 0) / hypes.length;
    rows.push({
      label: `${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}${f.isTitle ? ' (title)' : ''}`,
      event: f.event.name,
      date: f.event.date.toISOString().slice(0, 10),
      promotion: f.event.promotion,
      avgHype,
      hypeCount: hypes.length,
      avgRating: f.averageRating,
      ratingCount: f.totalRatings ?? 0,
      gap: f.averageRating - avgHype,
    });
  }

  const fmt = (r: Row) =>
    `  ${r.label} — ${r.event} (${r.date})\n` +
    `    hype ${r.avgHype.toFixed(1)}/10 (n=${r.hypeCount}) → rated ${r.avgRating.toFixed(1)}/10 (n=${r.ratingCount})  gap ${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(1)}`;

  console.log(
    `Window ${FROM.toISOString().slice(0, 10)} → ${TO.toISOString().slice(0, 10)}; floors: hype n≥${MIN_HYPE}, ratings n≥${MIN_RATINGS}`,
  );
  console.log(
    `Qualifying fights: ${rows.length} (of ${fights.length} completed with any data in window)`,
  );
  if (!rows.length) return;

  const meanHype = rows.reduce((a, r) => a + r.avgHype, 0) / rows.length;
  const meanRating = rows.reduce((a, r) => a + r.avgRating, 0) / rows.length;
  console.log(
    `Across qualifiers: mean hype ${meanHype.toFixed(2)} vs mean rating ${meanRating.toFixed(2)} (net ${(meanRating - meanHype).toFixed(2)})\n`,
  );

  const byGapAsc = [...rows].sort((a, b) => a.gap - b.gap);
  console.log('=== BIGGEST LETDOWNS (hyped, then flopped) ===');
  console.log(byGapAsc.slice(0, 12).map(fmt).join('\n'));

  console.log('\n=== BIGGEST OVERDELIVERIES (slept on, then banged) ===');
  console.log(byGapAsc.slice(-12).reverse().map(fmt).join('\n'));

  console.log('\n=== MOST HYPED FIGHTS OF THE WINDOW ===');
  console.log(
    [...rows]
      .sort((a, b) => b.avgHype - a.avgHype)
      .slice(0, 12)
      .map(fmt)
      .join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
