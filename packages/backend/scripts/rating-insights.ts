/**
 * Rating insights: what kind of fights do people actually like?
 *
 * Pulls every fight that has BOTH (a) at least MIN_RATINGS user ratings and
 * (b) post-fight AI enrichment (aiPostFightEnrichedAt set), then correlates the
 * enrichment attributes (pre-fight style/pace/risk + post-fight method/bonuses)
 * against how the crowd actually rated the fight.
 *
 * READ-ONLY. No writes, no migrations. Safe against prod.
 *
 * Run locally (DATABASE_URL points at prod per CLAUDE.md):
 *   cd packages/backend && npx tsx scripts/rating-insights.ts [minRatings]
 *   # optional: dump the raw aggregates as JSON for further analysis
 *   cd packages/backend && npx tsx scripts/rating-insights.ts 10 --json > insights.json
 *
 * The human-readable report goes to STDERR so that `--json` can be piped cleanly
 * to a file (the JSON blob is the only thing on STDOUT in that mode).
 */
import { prisma } from '../src/lib/prisma';

const MIN_RATINGS = Number(process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 10);
const EMIT_JSON = process.argv.includes('--json');
// "Loved" = an individual rating of 8 or higher on the 1-10 scale (mirrors the
// app's "great fight" 85+/100 notion).
const LOVE_FLOOR = 8;

const log = (...a: any[]) => process.stderr.write(a.join(' ') + '\n');

type FightRow = {
  id: string;
  averageRating: number;
  totalRatings: number;
  ratings1: number; ratings2: number; ratings3: number; ratings4: number; ratings5: number;
  ratings6: number; ratings7: number; ratings8: number; ratings9: number; ratings10: number;
  isTitle: boolean;
  weightClass: string | null;
  scheduledRounds: number;
  method: string | null;
  round: number | null;
  aiTags: any;
  aiPostFightTags: any;
  fighter1: { sport: string };
  fighter2: { sport: string };
  event: { promotion: string; name: string };
};

/** Per-rating-value counts for one fight, as a 10-length array indexed 0..9 => score 1..10. */
function counts(f: FightRow): number[] {
  return [f.ratings1, f.ratings2, f.ratings3, f.ratings4, f.ratings5, f.ratings6, f.ratings7, f.ratings8, f.ratings9, f.ratings10];
}

/** Aggregate accumulator over individual ratings (reconstructed from the distribution). */
class Agg {
  nFights = 0;
  nRatings = 0;
  sumX = 0;     // sum of individual scores
  sumX2 = 0;    // sum of squared scores
  loved = 0;    // count of individual ratings >= LOVE_FLOOR
  add(f: FightRow) {
    this.nFights++;
    const c = counts(f);
    for (let i = 0; i < 10; i++) {
      const score = i + 1;
      const n = c[i] || 0;
      this.nRatings += n;
      this.sumX += score * n;
      this.sumX2 += score * score * n;
      if (score >= LOVE_FLOOR) this.loved += n;
    }
  }
  get mean() { return this.nRatings ? this.sumX / this.nRatings : 0; }
  get lovedPct() { return this.nRatings ? (this.loved / this.nRatings) * 100 : 0; }
  get sd() {
    if (!this.nRatings) return 0;
    const m = this.mean;
    return Math.sqrt(Math.max(0, this.sumX2 / this.nRatings - m * m));
  }
}

/** Group fights by a key function (string | null | string[]), return sorted-by-mean breakdown. */
function groupBy(fights: FightRow[], keyFn: (f: FightRow) => string | null | string[]) {
  const groups = new Map<string, Agg>();
  for (const f of fights) {
    let keys = keyFn(f);
    if (keys == null) continue;
    if (!Array.isArray(keys)) keys = [keys];
    for (const k of keys) {
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, new Agg());
      groups.get(k)!.add(f);
    }
  }
  return [...groups.entries()]
    .map(([key, a]) => ({ key, nFights: a.nFights, nRatings: a.nRatings, mean: a.mean, lovedPct: a.lovedPct }))
    .sort((x, y) => y.mean - x.mean);
}

/**
 * Point-biserial correlation between a binary fight attribute and the individual
 * rating. Computed at the rating level (each user rating is a data point carrying
 * its fight's attribute), reconstructed from the distribution counts.
 */
function pointBiserial(fights: FightRow[], pred: (f: FightRow) => boolean) {
  const all = new Agg();
  const g1 = new Agg();
  const g0 = new Agg();
  for (const f of fights) {
    all.add(f);
    (pred(f) ? g1 : g0).add(f);
  }
  const n = all.nRatings;
  const sd = all.sd;
  if (!n || !sd || !g1.nRatings || !g0.nRatings) return { r: NaN, n1: g1.nRatings, n0: g0.nRatings, m1: g1.mean, m0: g0.mean };
  const p = g1.nRatings / n;
  const q = g0.nRatings / n;
  const r = ((g1.mean - g0.mean) / sd) * Math.sqrt(p * q);
  return { r, n1: g1.nRatings, n0: g0.nRatings, m1: g1.mean, m0: g0.mean };
}

/** Pearson correlation between two per-fight numeric series, weighted by ratings count. */
function weightedPearson(fights: FightRow[], xFn: (f: FightRow) => number | null) {
  let sw = 0, swx = 0, swy = 0, swxy = 0, swx2 = 0, swy2 = 0, used = 0;
  for (const f of fights) {
    const x = xFn(f);
    if (x == null || Number.isNaN(x)) continue;
    const w = f.totalRatings;
    const y = f.averageRating;
    sw += w; swx += w * x; swy += w * y; swxy += w * x * y; swx2 += w * x * x; swy2 += w * y * y; used++;
  }
  if (!sw) return { r: NaN, n: used };
  const cov = swxy / sw - (swx / sw) * (swy / sw);
  const vx = swx2 / sw - (swx / sw) ** 2;
  const vy = swy2 / sw - (swy / sw) ** 2;
  const r = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN;
  return { r, n: used };
}

// ---- Attribute extractors -------------------------------------------------

const isFinish = (f: FightRow) => {
  const m = (f.method || '').toUpperCase();
  return m.includes('KO') || m.includes('TKO') || m.includes('SUB');
};
const methodBucket = (f: FightRow): string | null => {
  const m = (f.method || '').toUpperCase();
  if (!m) return null;
  if (m.includes('SUB')) return 'Submission';
  if (m.includes('TKO')) return 'TKO';
  if (m.includes('KO')) return 'KO';
  if (m.includes('DEC')) return 'Decision';
  if (m.includes('DQ')) return 'DQ';
  if (m.includes('NC') || m.includes('NO CONTEST')) return 'No Contest';
  if (m.includes('DRAW')) return 'Draw';
  return f.method;
};
const sportOf = (f: FightRow) => f.fighter1?.sport || f.fighter2?.sport || null;
const isMainEvent = (f: FightRow) => !!f.aiTags?.isMainEvent;
const cardSection = (f: FightRow): string | null => {
  const s = f.aiTags?.cardSection;
  return typeof s === 'string' && s ? s : null;
};
const pace = (f: FightRow): string | null => (typeof f.aiTags?.pace === 'string' ? f.aiTags.pace : null);
const riskTier = (f: FightRow): string | null => (typeof f.aiTags?.riskTier === 'string' ? f.aiTags.riskTier : null);
const styleTags = (f: FightRow): string[] => (Array.isArray(f.aiTags?.styleTags) ? f.aiTags.styleTags : []);
const hasBonus = (f: FightRow) => Array.isArray(f.aiPostFightTags?.bonuses) && f.aiPostFightTags.bonuses.length > 0;
const isFOTY = (f: FightRow) => !!f.aiPostFightTags?.fotyConsideration;
const isFOTN = (f: FightRow) =>
  Array.isArray(f.aiPostFightTags?.bonuses) &&
  f.aiPostFightTags.bonuses.some((b: string) => /fight of the night/i.test(b));

function fmtRow(r: { key: string; nFights: number; nRatings: number; mean: number; lovedPct: number }) {
  return `  ${r.key.padEnd(26)} mean ${r.mean.toFixed(2)}   loved ${r.lovedPct.toFixed(0).padStart(3)}%   (${r.nFights} fights, ${r.nRatings} ratings)`;
}

function section(title: string, rows: ReturnType<typeof groupBy>) {
  log(`\n## ${title}`);
  for (const r of rows) log(fmtRow(r));
}

(async () => {
  log(`Rating insights — fights with >= ${MIN_RATINGS} ratings AND post-fight AI enrichment\n`);

  const fights = (await prisma.fight.findMany({
    where: {
      totalRatings: { gte: MIN_RATINGS },
      aiPostFightEnrichedAt: { not: null },
      fightStatus: { not: 'CANCELLED' },
    },
    select: {
      id: true, averageRating: true, totalRatings: true,
      ratings1: true, ratings2: true, ratings3: true, ratings4: true, ratings5: true,
      ratings6: true, ratings7: true, ratings8: true, ratings9: true, ratings10: true,
      isTitle: true, weightClass: true, scheduledRounds: true, method: true, round: true,
      aiTags: true, aiPostFightTags: true,
      fighter1: { select: { sport: true } },
      fighter2: { select: { sport: true } },
      event: { select: { promotion: true, name: true } },
    },
  })) as unknown as FightRow[];

  if (fights.length === 0) {
    log('No fights matched the filter. Either nothing has post-fight enrichment yet, or the threshold is too high.');
    await prisma.$disconnect();
    return;
  }

  const overall = new Agg();
  fights.forEach((f) => overall.add(f));

  log('## Dataset');
  log(`  Fights:        ${fights.length}`);
  log(`  Total ratings: ${overall.nRatings}`);
  log(`  Pooled mean:   ${overall.mean.toFixed(2)} / 10   (sd ${overall.sd.toFixed(2)})`);
  log(`  "Loved" (>=${LOVE_FLOOR}): ${overall.lovedPct.toFixed(1)}% of all ratings`);

  // ---- Categorical breakdowns (sorted by pooled crowd mean) ----
  section('Outcome: finish vs decision', groupBy(fights, (f) => (f.method ? (isFinish(f) ? 'Finish (KO/TKO/Sub)' : 'Decision') : null)));
  section('Method', groupBy(fights, methodBucket));
  section('Round the fight ended', groupBy(fights, (f) => (f.round ? `Round ${f.round}` : (f.method?.toUpperCase().includes('DEC') ? 'Went to decision' : null))));
  section('Title vs non-title', groupBy(fights, (f) => (f.isTitle ? 'Title fight' : 'Non-title')));
  section('Card position (main event)', groupBy(fights, (f) => (isMainEvent(f) ? 'Main event' : 'Undercard')));
  section('Card section', groupBy(fights, cardSection));
  section('Scheduled rounds', groupBy(fights, (f) => `${f.scheduledRounds}-round`));
  section('Sport', groupBy(fights, sportOf));
  section('Promotion', groupBy(fights, (f) => f.event?.promotion || null));
  section('Weight class', groupBy(fights, (f) => f.weightClass));
  section('Pace (pre-fight AI)', groupBy(fights, pace));
  section('Risk tier / odds spread (pre-fight AI)', groupBy(fights, riskTier));
  section('Bonus awarded (post-fight AI)', groupBy(fights, (f) => (hasBonus(f) ? 'Bonus' : 'No bonus')));
  section('FOTY consideration (post-fight AI)', groupBy(fights, (f) => (isFOTY(f) ? 'FOTY-flagged' : 'Not flagged')));
  // Style tags: only show those appearing on >= 3 fights to avoid noise.
  const styles = groupBy(fights, styleTags).filter((r) => r.nFights >= 3);
  section('Style matchup tags (>=3 fights, pre-fight AI)', styles);

  // ---- Correlations ----
  log('\n## Correlations with individual rating (point-biserial r; + = drives ratings up)');
  const binaries: Array<[string, (f: FightRow) => boolean]> = [
    ['Finish (vs decision)', isFinish],
    ['Title fight', (f) => f.isTitle],
    ['Main event', isMainEvent],
    ['Got a bonus', hasBonus],
    ['Fight of the Night', isFOTN],
    ['FOTY-flagged', isFOTY],
    ['5-round fight', (f) => f.scheduledRounds === 5],
    ['Pace = high', (f) => pace(f) === 'high'],
    ['Pickem (close odds)', (f) => riskTier(f) === 'pickem'],
    ['Lopsided odds', (f) => riskTier(f) === 'lopsided'],
  ];
  for (const [label, pred] of binaries) {
    const { r, n1, n0, m1, m0 } = pointBiserial(fights, pred);
    if (Number.isNaN(r)) { log(`  ${label.padEnd(24)} —  (insufficient split)`); continue; }
    const sign = r >= 0 ? '+' : '';
    log(`  ${label.padEnd(24)} r=${sign}${r.toFixed(3)}   ${m1.toFixed(2)} vs ${m0.toFixed(2)}   (n=${n1}/${n0})`);
  }

  log('\n## Popularity vs quality');
  const pq = weightedPearson(fights, (f) => f.totalRatings);
  log(`  totalRatings ~ averageRating: r=${pq.r.toFixed(3)} (n=${pq.n})  ` +
      `— do the fights that draw the most ratings also score highest?`);

  // ---- Extremes ----
  const ranked = [...fights].sort((a, b) => b.averageRating - a.averageRating);
  const label = (f: FightRow) => {
    const tags = [methodBucket(f), pace(f) ? `pace:${pace(f)}` : null, hasBonus(f) ? 'bonus' : null, isFOTY(f) ? 'FOTY' : null, f.isTitle ? 'title' : null]
      .filter(Boolean).join(', ');
    return `${f.averageRating.toFixed(2)} (${f.totalRatings})  ${f.event?.name || ''}  [${tags}]`;
  };
  log('\n## Top 12 highest-rated');
  ranked.slice(0, 12).forEach((f) => log('  ' + label(f)));
  log('\n## Bottom 12 lowest-rated');
  ranked.slice(-12).reverse().forEach((f) => log('  ' + label(f)));

  if (EMIT_JSON) {
    const payload = {
      generatedAt: new Date().toISOString(),
      minRatings: MIN_RATINGS,
      loveFloor: LOVE_FLOOR,
      dataset: { fights: fights.length, ratings: overall.nRatings, pooledMean: overall.mean, sd: overall.sd, lovedPct: overall.lovedPct },
      groups: {
        outcome: groupBy(fights, (f) => (f.method ? (isFinish(f) ? 'Finish' : 'Decision') : null)),
        method: groupBy(fights, methodBucket),
        endRound: groupBy(fights, (f) => (f.round ? `Round ${f.round}` : null)),
        title: groupBy(fights, (f) => (f.isTitle ? 'Title' : 'Non-title')),
        mainEvent: groupBy(fights, (f) => (isMainEvent(f) ? 'Main event' : 'Undercard')),
        cardSection: groupBy(fights, cardSection),
        scheduledRounds: groupBy(fights, (f) => `${f.scheduledRounds}-round`),
        sport: groupBy(fights, sportOf),
        promotion: groupBy(fights, (f) => f.event?.promotion || null),
        weightClass: groupBy(fights, (f) => f.weightClass),
        pace: groupBy(fights, pace),
        riskTier: groupBy(fights, riskTier),
        bonus: groupBy(fights, (f) => (hasBonus(f) ? 'Bonus' : 'No bonus')),
        foty: groupBy(fights, (f) => (isFOTY(f) ? 'FOTY' : 'Not')),
        styleTags: styles,
      },
      correlations: Object.fromEntries(binaries.map(([l, p]) => [l, pointBiserial(fights, p)])),
      popularityVsQuality: pq,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  log('ERROR: ' + (e?.message || e));
  await prisma.$disconnect();
  process.exit(1);
});
