/**
 * PLACEMENT CORRELATES — what predicts where a fighter is booked on the card?
 * --------------------------------------------------------------------------
 * READ-ONLY (writes nothing to the DB). Companion to card-placement-rankings.ts.
 *
 * Builds the same recency-weighted card-placement score per active fighter, then
 * joins it against everything we CAN compute from our own data for that fighter's
 * full UFC history, and measures which signals track with placement:
 *   - number of UFC fights on record (experience / company tenure)
 *   - win rate
 *   - finish rate (KO/TKO + submission share of wins)
 *   - how they win (KO/TKO vs submission vs decision mix)
 *   - in-app follower count (our own audience proxy — NOT external social)
 *
 * Reports Pearson r for each signal vs the placement score, plus top-of-card
 * vs bottom-of-card bucket averages (more readable for the article). Pay and
 * external social following are NOT in our DB — those come from web research.
 *
 * Usage:  npx tsx scripts/placement-correlates-analysis.ts [--csv path]
 */
import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

// match card-placement-rankings.ts
const RECENCY_K = 3;
const RECENCY_DECAY = 0.6;
const ACTIVE_MONTHS = 18;
const MIN_FIGHTS = 2;
const MULT_NUMBERED = 1.0;
const MULT_FIGHT_NIGHT = 0.8;
const MULT_OTHER = 0.85;
const ASOF = new Date('2026-06-22');

const CSV_PATH = process.argv.includes('--csv')
  ? process.argv[process.argv.indexOf('--csv') + 1]
  : null;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function eventMultiplier(name: string): number {
  if (/^ufc\s+\d+/i.test(name.trim())) return MULT_NUMBERED;
  if (/fight night/i.test(name) || /^ufc on /i.test(name)) return MULT_FIGHT_NIGHT;
  return MULT_OTHER;
}
function placementScore(pos: number, n: number): number {
  if (pos === 1) return 100;
  if (pos === 2) return 85;
  if (n <= 2) return 85;
  const t = (pos - 3) / Math.max(1, n - 3);
  return 70 - t * 50;
}

/** classify a method string into ko / sub / dec / other */
function methodBucket(m: string | null): 'ko' | 'sub' | 'dec' | 'other' | null {
  if (!m) return null;
  const s = m.toLowerCase();
  if (s.includes('sub')) return 'sub';
  if (s.includes('ko') || s.includes('tko') || s.includes('knock')) return 'ko';
  if (s.includes('dec')) return 'dec';
  return 'other';
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

async function main() {
  const events = await prisma.event.findMany({
    where: { promotion: 'UFC', eventStatus: 'COMPLETED' },
    select: {
      id: true, name: true, date: true,
      fights: {
        select: {
          orderOnCard: true, weightClass: true, winner: true, method: true,
          fighter1Id: true, fighter2Id: true,
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        },
      },
    },
  });

  // Per-fighter placement entries (recency-weighting input) + full career fight log.
  type Entry = { date: Date; value: number; pos: number; n: number; wc: string | null; oppId: string };
  const perFighter = new Map<string, Entry[]>();

  // career stats accumulators (over ALL completed fights in our DB)
  type Career = { fights: number; wins: number; losses: number; draws: number; ko: number; sub: number; dec: number; methodKnown: number };
  const career = new Map<string, Career>();
  const ensureCareer = (id: string): Career => {
    if (!career.has(id)) career.set(id, { fights: 0, wins: 0, losses: 0, draws: 0, ko: 0, sub: 0, dec: 0, methodKnown: 0 });
    return career.get(id)!;
  };

  let methodCovered = 0, winnerCovered = 0, totalFights = 0;

  for (const e of events) {
    const fights = [...e.fights].filter(f => f.orderOnCard != null).sort((a, b) => a.orderOnCard - b.orderOnCard);
    if (fights.length === 0) continue;
    const evName = norm(e.name);
    const lastsOf = (f: typeof fights[0]) =>
      [f.fighter1?.lastName, f.fighter2?.lastName].filter((x): x is string => !!x && x.length >= 3).map(norm);
    const inName = (f: typeof fights[0]) => lastsOf(f).some(ln => evName.includes(ln));
    const inverted = inName(fights[fights.length - 1]) && !inName(fights[0]);
    const ordered = inverted ? [...fights].reverse() : fights;
    const n = ordered.length;
    let pos = 0, prevOrd: number | null = null;
    const mult = eventMultiplier(e.name);

    ordered.forEach((f, idx) => {
      if (prevOrd === null || f.orderOnCard !== prevOrd) pos = idx + 1;
      prevOrd = f.orderOnCard;
      const value = placementScore(pos, n) * mult;

      // placement entries (both fighters)
      for (const [fid, oppId] of [[f.fighter1Id, f.fighter2Id], [f.fighter2Id, f.fighter1Id]] as [string, string][]) {
        if (!perFighter.has(fid)) perFighter.set(fid, []);
        perFighter.get(fid)!.push({ date: e.date, value, pos, n, wc: f.weightClass, oppId });
      }

      // career stats
      totalFights++;
      const mb = methodBucket(f.method);
      if (mb) methodCovered++;
      const w = f.winner;
      const decided = w === f.fighter1Id || w === f.fighter2Id;
      if (decided) winnerCovered++;
      for (const fid of [f.fighter1Id, f.fighter2Id]) {
        const c = ensureCareer(fid);
        c.fights++;
        if (w === 'draw' || w === 'nc') c.draws++;
        else if (w === fid) {
          c.wins++;
          if (mb && mb !== 'other') { c.methodKnown++; if (mb === 'ko') c.ko++; else if (mb === 'sub') c.sub++; else c.dec++; }
        } else if (decided) c.losses++;
      }
    });
  }

  // fighter metadata + division + in-app followers
  const fighterIds = [...perFighter.keys()];
  const fighters = await prisma.fighter.findMany({
    where: { id: { in: fighterIds } },
    select: {
      id: true, firstName: true, lastName: true, weightClass: true,
      wins: true, losses: true, // ufcstats backfill (alt record)
      _count: { select: { followers: true } },
    },
  });
  const fInfo = new Map(fighters.map(f => [f.id, f]));

  // sort newest-first, apply asof
  const sortedByFighter = new Map<string, Entry[]>();
  for (const [fid, list] of perFighter) {
    const kept = list.filter(e => e.date <= ASOF).sort((a, b) => b.date.getTime() - a.date.getTime());
    if (kept.length) sortedByFighter.set(fid, kept);
  }
  const anchorWC = new Map<string, string>();
  for (const [fid, sorted] of sortedByFighter) {
    const wc = sorted.find(e => e.wc)?.wc || fInfo.get(fid)?.weightClass || null;
    if (wc) anchorWC.set(fid, wc);
  }
  function divisionOf(fid: string, sorted: Entry[]): string | null {
    const known = anchorWC.get(fid);
    if (known) return known;
    const votes = new Map<string, number>();
    sorted.slice(0, 5).forEach((e, i) => {
      const owc = anchorWC.get(e.oppId);
      if (owc) votes.set(owc, (votes.get(owc) ?? 0) + Math.pow(RECENCY_DECAY, i));
    });
    let best: string | null = null, bestV = 0;
    for (const [wc, v] of votes) if (v > bestV) { best = wc; bestV = v; }
    return best;
  }

  const activeCutoff = new Date(ASOF); activeCutoff.setMonth(activeCutoff.getMonth() - ACTIVE_MONTHS);

  type Row = {
    name: string; div: string; score: number;
    careerFights: number; winRate: number | null; finishRate: number | null;
    koShare: number | null; subShare: number | null; decShare: number | null;
    wins: number; losses: number; followers: number;
  };
  const rows: Row[] = [];

  for (const [fid, entries] of sortedByFighter) {
    const info = fInfo.get(fid);
    if (!info) continue;
    if (entries[0].date < activeCutoff) continue;
    const window = entries.slice(0, RECENCY_K);
    if (window.length < MIN_FIGHTS) continue;
    let num = 0, den = 0;
    window.forEach((e, i) => { const w = Math.pow(RECENCY_DECAY, i); num += w * e.value; den += w; });
    const score = num / den;
    const div = divisionOf(fid, entries);
    if (!div) continue;

    const c = career.get(fid)!;
    const decided = c.wins + c.losses;
    const winRate = decided > 0 ? c.wins / decided : null;
    const finishRate = c.wins > 0 ? (c.ko + c.sub) / c.wins : null;
    const koShare = c.methodKnown > 0 ? c.ko / c.methodKnown : null;
    const subShare = c.methodKnown > 0 ? c.sub / c.methodKnown : null;
    const decShare = c.methodKnown > 0 ? c.dec / c.methodKnown : null;

    rows.push({
      name: `${info.firstName} ${info.lastName}`.trim(), div, score,
      careerFights: c.fights, winRate, finishRate, koShare, subShare, decShare,
      wins: c.wins, losses: c.losses, followers: info._count.followers,
    });
  }

  rows.sort((a, b) => b.score - a.score);

  // ---- coverage ----
  console.log('='.repeat(70));
  console.log('PLACEMENT CORRELATES ANALYSIS  (UFC, read-only)');
  console.log('='.repeat(70));
  console.log(`\nDATA COVERAGE (all completed UFC fights in DB):`);
  console.log(`  total completed fights scanned : ${totalFights}`);
  console.log(`  with a decided winner          : ${winnerCovered} (${(100 * winnerCovered / totalFights).toFixed(1)}%)`);
  console.log(`  with a usable method           : ${methodCovered} (${(100 * methodCovered / totalFights).toFixed(1)}%)`);
  console.log(`  active ranked fighters analysed : ${rows.length}`);

  // ---- correlations ----
  const corr = (sel: (r: Row) => number | null, label: string) => {
    const pairs = rows.filter(r => sel(r) != null).map(r => [r.score, sel(r) as number] as [number, number]);
    const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
    console.log(`  ${label.padEnd(34)} r = ${r.toFixed(3)}   (n=${pairs.length})`);
  };
  console.log(`\nPEARSON CORRELATION vs placement score (0-100):`);
  corr(r => r.careerFights, 'career UFC fights');
  corr(r => r.winRate, 'win rate');
  corr(r => r.finishRate, 'finish rate (of wins)');
  corr(r => r.koShare, 'KO/TKO share of finishes');
  corr(r => r.subShare, 'submission share');
  corr(r => r.decShare, 'decision share of wins');
  corr(r => r.followers, 'in-app follower count');

  // ---- buckets ----
  const avg = (rs: Row[], sel: (r: Row) => number | null) => {
    const v = rs.map(sel).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  };
  const headliners = rows.filter(r => r.score >= 80);   // main-event / co-main tier
  const midcard = rows.filter(r => r.score >= 50 && r.score < 80);
  const prelim = rows.filter(r => r.score < 50);
  const bucketLine = (label: string, rs: Row[]) => {
    console.log(
      `  ${label.padEnd(22)} n=${String(rs.length).padStart(3)}  ` +
      `fights=${avg(rs, r => r.careerFights).toFixed(1).padStart(5)}  ` +
      `winRate=${(avg(rs, r => r.winRate) * 100).toFixed(0).padStart(3)}%  ` +
      `finishRate=${(avg(rs, r => r.finishRate) * 100).toFixed(0).padStart(3)}%  ` +
      `KO%=${(avg(rs, r => r.koShare) * 100).toFixed(0).padStart(3)}  ` +
      `sub%=${(avg(rs, r => r.subShare) * 100).toFixed(0).padStart(3)}  ` +
      `dec%=${(avg(rs, r => r.decShare) * 100).toFixed(0).padStart(3)}  ` +
      `followers=${avg(rs, r => r.followers).toFixed(0).padStart(4)}`
    );
  };
  console.log(`\nBUCKET AVERAGES (by placement tier):`);
  bucketLine('HEADLINERS (>=80)', headliners);
  bucketLine('MID-CARD (50-79)', midcard);
  bucketLine('PRELIM (<50)', prelim);

  // ---- decision-heavy high-rankers (the "wins but cannot sell" check) ----
  console.log(`\nHIGH FINISH RATE vs placement (do KO artists get pushed?):`);
  const finishers = rows.filter(r => r.finishRate != null && r.wins >= 4);
  const hiFin = finishers.filter(r => (r.finishRate as number) >= 0.7);
  const loFin = finishers.filter(r => (r.finishRate as number) <= 0.3);
  console.log(`  finishers (>=70% of wins by finish): avg placement ${avg(hiFin, r => r.score).toFixed(1)} (n=${hiFin.length})`);
  console.log(`  decision fighters (<=30% finish):    avg placement ${avg(loFin, r => r.score).toFixed(1)} (n=${loFin.length})`);

  if (CSV_PATH) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    const head = 'name,division,placementScore,careerFights,wins,losses,winRate,finishRate,koShare,subShare,decShare,inAppFollowers';
    const body = rows.map(r =>
      `"${r.name}",${r.div},${r.score.toFixed(1)},${r.careerFights},${r.wins},${r.losses},` +
      `${r.winRate?.toFixed(3) ?? ''},${r.finishRate?.toFixed(3) ?? ''},${r.koShare?.toFixed(3) ?? ''},` +
      `${r.subShare?.toFixed(3) ?? ''},${r.decShare?.toFixed(3) ?? ''},${r.followers}`
    );
    fs.writeFileSync(CSV_PATH, [head, ...body].join('\n'));
    console.log(`\nCSV written: ${CSV_PATH}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
