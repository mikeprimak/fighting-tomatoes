/**
 * Trait: method-affinity
 *
 * Taste signal — does the user rate certain finish methods higher than their
 * personal baseline? Computes per-method average rating versus the user's
 * overall average, and surfaces the strongest positive and (optionally)
 * negative deltas.
 *
 * Rating-only (no hype) because `Fight.method` is unknown at hype time.
 *
 * Methods bucketed into THREE categories — knockout (KO + TKO), submission,
 * decision. KO and TKO are lumped because the user-meaningful taste signal is
 * "strikes finish" vs "submission" vs "decision," not whether the stoppage
 * was ref-called or visual. DB method strings are messy ("TKO (punches)",
 * "Decision (unanimous) (30-27)", "U-DEC", "SUB", "KO/TKO") so the bucketing
 * pattern-matches in SQL.
 *
 * Floor: at least 10 ratings on the candidate method AND at least 25 total
 * rated completed fights. Delta floor: |avg − baseline| ≥ 0.5.
 *
 * Event-side: trait stays silent. Method taste is a profile insight, not a
 * reveal-modal beat.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
  TraitProfileSummary,
} from '../../types';
import copy from './copy';

const TOTAL_FLOOR = 25;
const METHOD_FLOOR = 10;
const DELTA_FLOOR = 0.5;

type MethodCanonical = 'Knockout' | 'Submission' | 'Decision';

interface MethodAggregate {
  method: MethodCanonical;
  count: number;
  avg: number;
}

const trait: Trait = {
  id: 'method-affinity',
  family: 'affinity',
  tier: 1,
  version: 1,
  respondsTo: ['rate'] as const,
  surfaces: ['profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const buckets = await aggregateByMethod(prisma, userId);
    const total = buckets.reduce((a, b) => a + b.count, 0);
    if (total === 0) {
      return { value: { total: 0 }, confidence: 0, hasFloor: false };
    }

    const weightedSum = buckets.reduce((a, b) => a + b.avg * b.count, 0);
    const baseline = weightedSum / total;

    const eligible = buckets.filter((b) => b.count >= METHOD_FLOOR);
    const deltas = eligible.map((b) => ({
      method: b.method,
      count: b.count,
      avg: b.avg,
      delta: b.avg - baseline,
    }));
    const positive = [...deltas]
      .filter((d) => d.delta >= DELTA_FLOOR)
      .sort((a, b) => b.delta - a.delta)[0] ?? null;
    const negative = [...deltas]
      .filter((d) => d.delta <= -DELTA_FLOOR)
      .sort((a, b) => a.delta - b.delta)[0] ?? null;

    return {
      value: {
        baseline: round2(baseline),
        total,
        buckets: buckets.map((b) => ({
          method: b.method,
          count: b.count,
          avg: round2(b.avg),
        })),
        favorite: positive
          ? {
              method: positive.method,
              count: positive.count,
              avg: round2(positive.avg),
              delta: round2(positive.delta),
            }
          : null,
        disliked: negative
          ? {
              method: negative.method,
              count: negative.count,
              avg: round2(negative.avg),
              delta: round2(negative.delta),
            }
          : null,
      },
      confidence: Math.min(1, total / 50),
      hasFloor: total >= TOTAL_FLOOR,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(_ctx: EventContext): Promise<TraitEventResult | null> {
    return null;
  },

  profileSummary(value): TraitProfileSummary | TraitProfileSummary[] | null {
    const v = value as {
      total?: number;
      favorite?: {
        method: MethodCanonical;
        count: number;
        avg: number;
        delta: number;
      } | null;
      disliked?: {
        method: MethodCanonical;
        count: number;
        avg: number;
        delta: number;
      } | null;
    };
    if (!v.total || v.total < TOTAL_FLOOR) return null;

    const cards: TraitProfileSummary[] = [];

    if (v.favorite) {
      const f = v.favorite;
      cards.push({
        headline: favoriteHeadline(f.method),
        body: `You rate ${methodLabelPlural(f.method)} ${f.delta.toFixed(1)} points higher than your average — ${f.avg.toFixed(1)} across ${f.count}.`,
        primaryStat: `+${f.delta.toFixed(1)}`,
        secondaryStat: methodLabelPlural(f.method),
        weight: 73,
      });
    }

    if (v.disliked) {
      const d = v.disliked;
      cards.push({
        headline: dislikedHeadline(d.method),
        body: `You rate ${methodLabelPlural(d.method)} ${Math.abs(d.delta).toFixed(1)} points lower than your average — ${d.avg.toFixed(1)} across ${d.count}.`,
        primaryStat: d.delta.toFixed(1),
        secondaryStat: methodLabelPlural(d.method),
        weight: 60,
      });
    }

    return cards.length > 0 ? cards : null;
  },
};

export default trait;

function favoriteHeadline(m: MethodCanonical): string {
  switch (m) {
    case 'Knockout':
      return 'Knockout fan';
    case 'Submission':
      return 'Submission admirer';
    case 'Decision':
      return 'Decision enjoyer';
  }
}

function dislikedHeadline(m: MethodCanonical): string {
  switch (m) {
    case 'Knockout':
      return 'Cold on knockouts';
    case 'Submission':
      return 'Cold on submissions';
    case 'Decision':
      return 'Decision sceptic';
  }
}

function methodLabelPlural(m: MethodCanonical): string {
  switch (m) {
    case 'Knockout':
      return 'knockouts';
    case 'Submission':
      return 'submissions';
    case 'Decision':
      return 'decisions';
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function aggregateByMethod(
  prisma: EventContext['prisma'],
  userId: string,
): Promise<MethodAggregate[]> {
  // Bucket by canonical method (KO/TKO/Submission/Decision). Anything else
  // (DQ, NC, null) is dropped so a 2-fight sample doesn't pollute the deltas.
  const rows = await prisma.$queryRaw<
    Array<{ method: string; count: bigint; avg: number }>
  >`
    WITH bucketed AS (
      SELECT
        r.rating,
        CASE
          -- Decisions: "Decision (unanimous)...", "U-DEC", "S-DEC", "UD", "MD".
          -- Check decisions first so "Decision" wins over any accidental KO/SUB hit.
          WHEN f.method ILIKE '%decision%'
            OR f.method ILIKE 'U-DEC%' OR f.method ILIKE 'S-DEC%' OR f.method ILIKE 'M-DEC%'
            OR f.method = 'UD' OR f.method = 'MD' OR f.method = 'SD'
            THEN 'Decision'
          -- Submissions: "Submission (rear-naked choke)", "SUB (…)"
          WHEN f.method ILIKE '%submission%'
            OR f.method ILIKE 'SUB %' OR f.method ILIKE 'SUB(%' OR f.method = 'SUB'
            THEN 'Submission'
          -- Knockouts (lumps KO + TKO): "KO (punches)", "TKO (doctor stoppage)", "KO/TKO"
          WHEN f.method ILIKE 'KO%' OR f.method ILIKE 'TKO%'
            OR f.method ILIKE '% KO%' OR f.method ILIKE '% TKO%'
            OR f.method ILIKE '%KO/TKO%'
            THEN 'Knockout'
          ELSE NULL
        END AS method
      FROM fight_ratings r
      INNER JOIN fights f ON f.id = r."fightId"
      WHERE r."userId" = ${userId}
        AND f.method IS NOT NULL
        AND f."fightStatus" = 'COMPLETED'
    )
    SELECT method, COUNT(*)::bigint AS count, AVG(rating)::float AS avg
    FROM bucketed
    WHERE method IS NOT NULL
    GROUP BY method
  `;
  return rows
    .filter((r): r is { method: string; count: bigint; avg: number } => !!r.method)
    .map((r) => ({
      method: r.method as MethodCanonical,
      count: Number(r.count),
      avg: r.avg,
    }));
}
