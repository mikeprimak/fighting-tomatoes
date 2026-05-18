/**
 * Trait: weight-class-affinity
 *
 * Weight-class taste signal. Aggregates the user's ratings + hypes by the
 * fight's `weightClass` enum. Mirrors org-affinity's three-mode behaviour:
 *   • class-first         — first-ever signal for this weight class (highest)
 *   • cross-class-foray   — rating/hyping a class the user touches rarely
 *   • dominant-milestone  — round numbers on the dominant class
 *
 * Floor: at least 5 total ratings+hypes across all weight classes.
 *
 * Dominant threshold is lower (25%) than org-affinity (40%) because weight
 * classes spread thinner — there are ~30 enum values across MMA + women's MMA
 * + boxing, so even a clear-favourite user rarely concentrates above 30%.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
  TraitProfileSummary,
} from '../../types';
import copy from './copy';

const HISTORY_FLOOR = 5;
// 14 MMA classes (or more once boxing splits add up) → uniform ≈ 7%.
// 20% is ~3x uniform, a defensible "this is your division" signal.
const DOMINANT_THRESHOLD = 0.2; // class accounts for ≥20% of signal
const RARE_THRESHOLD = 0.05; // class accounts for ≤5% of signal

const trait: Trait = {
  id: 'weight-class-affinity',
  family: 'affinity',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['rate-reveal-modal', 'hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const totals = await aggregateByClass(prisma, userId);
    const ratingTotals = await aggregateByClassForAction(prisma, userId, 'rate');
    const hypeTotals = await aggregateByClassForAction(prisma, userId, 'hype');
    const total = sumValues(totals);
    const ratingTotal = sumValues(ratingTotals);
    const hypeTotal = sumValues(hypeTotals);
    if (total === 0) {
      return {
        value: { totals: {}, total: 0, dominant: null },
        confidence: 0,
        hasFloor: false,
      };
    }

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const dominant =
      sorted[0][1] / total >= DOMINANT_THRESHOLD ? sorted[0][0] : null;

    const ratingSorted = Object.entries(ratingTotals).sort((a, b) => b[1] - a[1]);
    const ratingDominant =
      ratingTotal > 0 && ratingSorted[0][1] / ratingTotal >= DOMINANT_THRESHOLD
        ? ratingSorted[0][0]
        : null;
    const hypeSorted = Object.entries(hypeTotals).sort((a, b) => b[1] - a[1]);
    const hypeDominant =
      hypeTotal > 0 && hypeSorted[0][1] / hypeTotal >= DOMINANT_THRESHOLD
        ? hypeSorted[0][0]
        : null;

    return {
      value: {
        totals,
        total,
        dominant,
        dominantPct: dominant ? Math.round((sorted[0][1] / total) * 100) : 0,
        ratingTotals,
        ratingTotal,
        ratingDominant,
        ratingDominantPct: ratingDominant
          ? Math.round((ratingSorted[0][1] / ratingTotal) * 100)
          : 0,
        hypeTotals,
        hypeTotal,
        hypeDominant,
        hypeDominantPct: hypeDominant
          ? Math.round((hypeSorted[0][1] / hypeTotal) * 100)
          : 0,
      },
      confidence: Math.min(1, total / 30),
      hasFloor: total >= HISTORY_FLOOR,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (!ctx.fightId) return null;
    if (ctx.action !== 'rate' && ctx.action !== 'hype') return null;

    const fight = await ctx.prisma.fight.findUnique({
      where: { id: ctx.fightId },
      select: { weightClass: true },
    });
    const cls = fight?.weightClass ?? null;
    if (!cls) return null;

    const totals = await aggregateByClass(ctx.prisma, ctx.userId);
    const total = sumValues(totals);
    if (total < HISTORY_FLOOR) return null;

    // This action isn't yet reflected in `totals`. Treat the current count as
    // prior and add 1 for what just happened.
    const classPrior = totals[cls] ?? 0;
    const classCount = classPrior + 1;
    const totalAfter = total + 1;
    const classShare = classCount / totalAfter;

    const verb = ctx.action === 'hype' ? 'hyped' : 'rated';
    const vars: Record<string, string | number> = {
      class: prettyWeightClass(cls),
      count: classCount,
      total: totalAfter,
      verb,
    };

    if (classPrior === 0) {
      return { copyKey: 'class-first', score: 85, vars };
    }

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const dominantClass = sorted[0][0];
    if (classShare < RARE_THRESHOLD && cls !== dominantClass) {
      const dominantCount = totals[dominantClass];
      return {
        copyKey: 'cross-class-foray',
        score: 70,
        vars: {
          ...vars,
          dominantClass: prettyWeightClass(dominantClass),
          dominantCount,
        },
      };
    }

    if (cls === dominantClass && isMilestone(classCount)) {
      return { copyKey: 'dominant-milestone', score: 60, vars };
    }
    return null;
  },

  profileSummary(value): TraitProfileSummary | TraitProfileSummary[] | null {
    const v = value as {
      ratingTotals?: Record<string, number>;
      ratingTotal?: number;
      ratingDominant?: string | null;
      ratingDominantPct?: number;
      hypeTotals?: Record<string, number>;
      hypeTotal?: number;
      hypeDominant?: string | null;
      hypeDominantPct?: number;
    };

    const cards: TraitProfileSummary[] = [];

    const ratingTotal = v.ratingTotal ?? 0;
    if (ratingTotal >= HISTORY_FLOOR && v.ratingDominant) {
      const pretty = prettyWeightClass(v.ratingDominant);
      const titled = capitalizeFirst(pretty);
      cards.push({
        headline: `${titled} watcher`,
        body: `${v.ratingDominantPct}% of your ratings are on ${pretty} fights.`,
        primaryStat: `${v.ratingDominantPct}%`,
        secondaryStat: titled,
        weight: 74,
      });
    }

    const hypeTotal = v.hypeTotal ?? 0;
    if (hypeTotal >= HISTORY_FLOOR && v.hypeDominant) {
      const pretty = prettyWeightClass(v.hypeDominant);
      const titled = capitalizeFirst(pretty);
      cards.push({
        headline: `${titled} hype lane`,
        body: `${v.hypeDominantPct}% of your hypes are on ${pretty} fights.`,
        primaryStat: `${v.hypeDominantPct}%`,
        secondaryStat: titled,
        weight: 72,
      });
    }

    return cards.length > 0 ? cards : null;
  },
};

function isMilestone(n: number): boolean {
  if (n <= 0) return false;
  if (n === 10 || n === 25 || n === 50) return true;
  if (n % 100 === 0) return true;
  return false;
}

function sumValues(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

export default trait;

async function aggregateByClassForAction(
  prisma: EventContext['prisma'],
  userId: string,
  action: 'rate' | 'hype',
): Promise<Record<string, number>> {
  const rows = action === 'rate'
    ? await prisma.$queryRaw<Array<{ weightClass: string; count: bigint }>>`
        SELECT f."weightClass"::text AS "weightClass", COUNT(*)::bigint AS count
        FROM fight_ratings r
        INNER JOIN fights f ON f.id = r."fightId"
        WHERE r."userId" = ${userId} AND f."weightClass" IS NOT NULL
        GROUP BY f."weightClass"
      `
    : await prisma.$queryRaw<Array<{ weightClass: string; count: bigint }>>`
        SELECT f."weightClass"::text AS "weightClass", COUNT(*)::bigint AS count
        FROM fight_predictions p
        INNER JOIN fights f ON f.id = p."fightId"
        WHERE p."userId" = ${userId}
          AND p."predictedRating" IS NOT NULL
          AND f."weightClass" IS NOT NULL
        GROUP BY f."weightClass"
      `;
  const totals: Record<string, number> = {};
  for (const r of rows) {
    totals[r.weightClass] = Number(r.count);
  }
  return totals;
}

async function aggregateByClass(
  prisma: EventContext['prisma'],
  userId: string,
): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ weightClass: string; count: bigint }>>`
    SELECT f."weightClass"::text AS "weightClass", COUNT(*)::bigint AS count
    FROM (
      SELECT r."fightId" FROM fight_ratings r WHERE r."userId" = ${userId}
      UNION ALL
      SELECT p."fightId" FROM fight_predictions p
      WHERE p."userId" = ${userId} AND p."predictedRating" IS NOT NULL
    ) AS user_signals
    INNER JOIN fights f ON f.id = user_signals."fightId"
    WHERE f."weightClass" IS NOT NULL
    GROUP BY f."weightClass"
  `;
  const totals: Record<string, number> = {};
  for (const r of rows) {
    totals[r.weightClass] = Number(r.count);
  }
  return totals;
}

/**
 * Maps a WeightClass enum value to a mid-sentence-safe label. Boxing classes
 * are prefixed with "boxing" so users can tell the sport apart at a glance
 * ("welterweight" vs "boxing welterweight" — different weight cuts).
 */
function prettyWeightClass(raw: string): string {
  const upper = raw.toUpperCase();
  if (upper.startsWith('BOXING_')) {
    return `boxing ${upper.slice('BOXING_'.length).toLowerCase().replace(/_/g, ' ')}`;
  }
  if (upper.startsWith('WOMENS_')) {
    return `women's ${upper.slice('WOMENS_'.length).toLowerCase().replace(/_/g, ' ')}`;
  }
  return upper.toLowerCase().replace(/_/g, ' ');
}
