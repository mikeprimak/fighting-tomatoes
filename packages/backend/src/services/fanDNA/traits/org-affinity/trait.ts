/**
 * Trait: org-affinity
 *
 * Promotion-level taste signal. Aggregates the user's ratings + hypes by the
 * event's `promotion` field. Surfaces three observations:
 *   • dominant-pile-on   — another rating for the user's primary org (most common,
 *                          lowest score — only fires when nothing better)
 *   • cross-org-foray    — rating an org the user touches rarely
 *   • org-first          — first-ever signal for this promotion
 *
 * Floor: at least 5 total ratings+hypes across all promotions.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const HISTORY_FLOOR = 5;
const DOMINANT_THRESHOLD = 0.4; // org accounts for ≥40% of signal
const RARE_THRESHOLD = 0.1; // org accounts for ≤10% of signal

const trait: Trait = {
  id: 'org-affinity',
  family: 'affinity',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['rate-reveal-modal', 'hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const totals = await aggregateByOrg(prisma, userId);
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return { value: { totals: {}, total: 0, dominant: null }, confidence: 0, hasFloor: false };
    }

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0][1] / total >= DOMINANT_THRESHOLD ? sorted[0][0] : null;

    return {
      value: {
        totals,
        total,
        dominant,
        dominantPct: dominant ? Math.round((sorted[0][1] / total) * 100) : 0,
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
      select: { event: { select: { promotion: true } } },
    });
    const org = fight?.event?.promotion;
    if (!org) return null;

    const totals = await aggregateByOrg(ctx.prisma, ctx.userId);
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total < HISTORY_FLOOR) return null;

    // This action hasn't been recorded in `totals` yet (it just happened or the
    // count is from before this action committed). Treat orgCount as the prior
    // state and add 1 for the action that just fired.
    const orgPrior = totals[org] ?? 0;
    const orgCount = orgPrior + 1;
    const totalAfter = total + 1;
    const orgShare = orgCount / totalAfter;

    // "rated" / "hyped" for natural copy.
    const verb = ctx.action === 'hype' ? 'hyped' : 'rated';
    const vars: Record<string, string | number> = {
      org: prettyOrg(org),
      count: orgCount,
      total: totalAfter,
      verb,
    };

    // Highest-value moment: first-ever signal for this org.
    if (orgPrior === 0) {
      return { copyKey: 'org-first', score: 85, vars };
    }

    // Cross-org foray: low share AND not the dominant org.
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const dominantOrg = sorted[0][0];
    if (orgShare < RARE_THRESHOLD && org !== dominantOrg) {
      const dominantCount = totals[dominantOrg];
      return {
        copyKey: 'cross-org-foray',
        score: 70,
        vars: {
          ...vars,
          dominantOrg: prettyOrg(dominantOrg),
          dominantCount,
        },
      };
    }

    // Milestones on the dominant org — round numbers feel like punchlines.
    if (org === dominantOrg && isMilestone(orgCount)) {
      return { copyKey: 'dominant-milestone', score: 60, vars };
    }
    // Otherwise: don't fire. Generic "Nth UFC rating" on every UFC rate is
    // wallpaper. Better to stay silent and let other traits speak.
    return null;
  },
};

function isMilestone(n: number): boolean {
  if (n <= 0) return false;
  if (n === 10 || n === 25 || n === 50) return true;
  if (n % 100 === 0) return true;
  return false;
}

export default trait;

async function aggregateByOrg(
  prisma: EventContext['prisma'],
  userId: string,
): Promise<Record<string, number>> {
  // Use raw SQL — Prisma's groupBy can't reach across relations cleanly.
  const rows = await prisma.$queryRaw<Array<{ promotion: string; count: bigint }>>`
    SELECT e.promotion AS promotion, COUNT(*)::bigint AS count
    FROM (
      SELECT f."eventId" FROM fight_ratings r
      INNER JOIN fights f ON f.id = r."fightId"
      WHERE r."userId" = ${userId}
      UNION ALL
      SELECT f."eventId" FROM fight_predictions p
      INNER JOIN fights f ON f.id = p."fightId"
      WHERE p."userId" = ${userId} AND p."predictedRating" IS NOT NULL
    ) AS user_signals
    INNER JOIN events e ON e.id = user_signals."eventId"
    WHERE e.promotion IS NOT NULL
    GROUP BY e.promotion
  `;
  const totals: Record<string, number> = {};
  for (const r of rows) {
    totals[r.promotion] = Number(r.count);
  }
  return totals;
}

function prettyOrg(raw: string): string {
  // Match the existing user-visible promotion labels closely. Most are already
  // short (UFC, PFL, ONE) — boxing aggregates need normalization.
  const upper = raw.toUpperCase();
  if (upper === 'UFC') return 'UFC';
  if (upper === 'PFL') return 'PFL';
  if (upper === 'ONE') return 'ONE';
  if (upper.includes('BKFC')) return 'BKFC';
  if (upper.includes('RIZIN')) return 'RIZIN';
  if (upper.includes('KARATE')) return 'Karate Combat';
  if (upper.includes('DIRTY BOXING')) return 'Dirty Boxing';
  if (upper.includes('OKTAGON')) return 'Oktagon';
  if (upper.includes('MATCHROOM')) return 'Matchroom';
  if (upper.includes('TOP RANK')) return 'Top Rank';
  if (upper.includes('GOLDEN BOY')) return 'Golden Boy';
  if (upper.includes('MOST VALUABLE') || upper === 'MVP') return 'MVP';
  if (upper.includes('ZUFFA')) return 'Zuffa Boxing';
  return raw;
}
