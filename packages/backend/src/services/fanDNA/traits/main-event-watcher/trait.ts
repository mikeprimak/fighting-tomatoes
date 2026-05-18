/**
 * Trait: main-event-watcher
 *
 * Engagement-depth signal. Computes the share of the user's ratings/hypes that
 * land on the main event of their card (`Fight.orderOnCard === 1`). Two profile
 * stories emerge from the same aggregation:
 *
 *   • "Main event only" — ≥60% of signals are on main events. The user mostly
 *     shows up for the headline fight.
 *   • "Full-card watcher" — ≤25% of signals are on main events AND total ≥ 20.
 *     The user rates/hypes plenty of prelims and undercard fights.
 *
 * Rating-axis and hype-axis are surfaced as separate cards (mirrors org-affinity):
 * a user can be a "main event only" rater but a "full-card hyper" or vice versa.
 *
 * Floor: at least 10 total ratings+hypes. The percentage is misleading below
 * that count.
 *
 * Event-side: trait stays silent. The on-card depth pattern doesn't need a
 * reveal-modal line — the profile is where it belongs.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
  TraitProfileSummary,
} from '../../types';
import copy from './copy';

const HISTORY_FLOOR = 10;
const MAIN_ONLY_PCT = 60; // ≥ this → "main event only"
const FULL_CARD_PCT = 25; // ≤ this with floor → "full-card watcher"
const FULL_CARD_MIN_TOTAL = 20;

const trait: Trait = {
  id: 'main-event-watcher',
  family: 'behaviour',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const ratingStats = await aggregate(prisma, userId, 'rate');
    const hypeStats = await aggregate(prisma, userId, 'hype');
    const total = ratingStats.total + hypeStats.total;
    if (total === 0) {
      return {
        value: { ratingStats, hypeStats, total },
        confidence: 0,
        hasFloor: false,
      };
    }
    return {
      value: {
        ratingTotal: ratingStats.total,
        ratingMainCount: ratingStats.mainCount,
        ratingMainPct: pct(ratingStats.mainCount, ratingStats.total),
        hypeTotal: hypeStats.total,
        hypeMainCount: hypeStats.mainCount,
        hypeMainPct: pct(hypeStats.mainCount, hypeStats.total),
        total,
      },
      confidence: Math.min(1, total / 30),
      hasFloor: total >= HISTORY_FLOOR,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(_ctx: EventContext): Promise<TraitEventResult | null> {
    return null;
  },

  profileSummary(value): TraitProfileSummary | TraitProfileSummary[] | null {
    const v = value as {
      ratingTotal?: number;
      ratingMainCount?: number;
      ratingMainPct?: number;
      hypeTotal?: number;
      hypeMainCount?: number;
      hypeMainPct?: number;
    };

    const cards: TraitProfileSummary[] = [];

    const ratingTotal = v.ratingTotal ?? 0;
    if (ratingTotal >= HISTORY_FLOOR) {
      const ratingCard = pickCard({
        action: 'rate',
        pctVal: v.ratingMainPct ?? 0,
        total: ratingTotal,
      });
      if (ratingCard) cards.push(ratingCard);
    }

    const hypeTotal = v.hypeTotal ?? 0;
    if (hypeTotal >= HISTORY_FLOOR) {
      const hypeCard = pickCard({
        action: 'hype',
        pctVal: v.hypeMainPct ?? 0,
        total: hypeTotal,
      });
      if (hypeCard) cards.push(hypeCard);
    }

    return cards.length > 0 ? cards : null;
  },
};

export default trait;

function pickCard({
  action,
  pctVal,
  total,
}: {
  action: 'rate' | 'hype';
  pctVal: number;
  total: number;
}): TraitProfileSummary | null {
  const noun = action === 'rate' ? 'ratings' : 'hypes';

  if (pctVal >= MAIN_ONLY_PCT) {
    return {
      headline: action === 'rate' ? 'Main event only' : 'Main event hypes',
      body: `${pctVal}% of your ${noun} are on the main event of the card.`,
      primaryStat: `${pctVal}%`,
      secondaryStat: 'main event',
      weight: 70,
    };
  }

  if (pctVal <= FULL_CARD_PCT && total >= FULL_CARD_MIN_TOTAL) {
    return {
      headline:
        action === 'rate' ? 'Full-card watcher' : 'Full-card hyper',
      body: `Only ${pctVal}% of your ${noun} are main events — you ${action} the whole card.`,
      primaryStat: `${pctVal}%`,
      secondaryStat: 'main event',
      weight: 65,
    };
  }

  return null;
}

function pct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 100);
}

interface ActionAggregate {
  total: number;
  mainCount: number;
}

async function aggregate(
  prisma: EventContext['prisma'],
  userId: string,
  action: 'rate' | 'hype',
): Promise<ActionAggregate> {
  const rows = action === 'rate'
    ? await prisma.$queryRaw<Array<{ total: bigint; main_count: bigint }>>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE f."orderOnCard" = 1)::bigint AS main_count
        FROM fight_ratings r
        INNER JOIN fights f ON f.id = r."fightId"
        WHERE r."userId" = ${userId}
      `
    : await prisma.$queryRaw<Array<{ total: bigint; main_count: bigint }>>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE f."orderOnCard" = 1)::bigint AS main_count
        FROM fight_predictions p
        INNER JOIN fights f ON f.id = p."fightId"
        WHERE p."userId" = ${userId} AND p."predictedRating" IS NOT NULL
      `;
  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    mainCount: Number(r?.main_count ?? 0),
  };
}
