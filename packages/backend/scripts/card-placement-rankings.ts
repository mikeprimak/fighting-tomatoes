/**
 * CARD-PLACEMENT POWER RANKINGS  (READ-ONLY — writes nothing to the DB)
 * ---------------------------------------------------------------------
 * Ranks UFC fighters by WHERE they are placed on cards (main event, co-main,
 * main card, prelim, early prelim) — the Chael Sonnen thesis that placement is
 * the truest signal of how the promotion values a fighter. Improves on the old
 * "avg last 3 fights" by (a) weighting numbered PPVs above Fight Nights and
 * (b) recency-weighting recent fights above older ones (mirrors the new
 * Meta-UFC ranking principles: recency priority + quality adjustment).
 *
 * DATA REALITY (see docs): legacy UFC events (scraperType=null, ~768 events)
 * carry NO cardType/section and NO 5-round flag, only orderOnCard — and that
 * order is INVERTED on a subset (main event last). We recover direction PER
 * EVENT from the event name (UFC cards are named after their main event), the
 * same authoritative signal the §8 order audit used. Numbered PPVs carry no
 * names → we trust stored order (already normalised by the §8 fix).
 *
 * Usage:  npx tsx scripts/card-placement-rankings.ts [--top N] [--all] [--csv path]
 */
import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

// ---------------- tunable constants ----------------
const RECENCY_K = 3;            // how many recent fights to consider per fighter
// weight of fight i = DECAY^i (0=newest). 0.6 → [1,.6,.36]. Pass --decay 1 for a
// SIMPLE average of the last 3 (all weighted equally), matching the original
// fightingtomatoes "Avg. Card Placement" method.
const DECAY_ARG = process.argv.includes('--decay')
  ? Number(process.argv[process.argv.indexOf('--decay') + 1])
  : null;
const RECENCY_DECAY = DECAY_ARG != null && !Number.isNaN(DECAY_ARG) ? DECAY_ARG : 0.6;
const ACTIVE_MONTHS = 18;       // fighter must have fought within this window to rank
const MIN_FIGHTS = 2;           // need at least this many UFC fights in the recency window
// Activity gate: a ranked fighter must have fought at least MIN_RECENT_FIGHTS times within the
// last RECENT_WINDOW_MONTHS. Filters out faded/semi-retired names whose "last 3" spans many years
// (e.g. a fighter with one bout in two years) so the board reflects the currently active roster.
const RECENT_WINDOW_MONTHS = 24;
const MIN_RECENT_FIGHTS = 2;
const MULT_NUMBERED = 1.0;      // ^UFC <number> = numbered PPV
const MULT_FIGHT_NIGHT = 0.8;   // "Fight Night" / "UFC on ESPN/ABC/Fox"
const MULT_OTHER = 0.85;        // TUF finales, one-offs
const TOP_N_DEFAULT = 12;       // fighters shown per division
// ---------------------------------------------------

const args = process.argv.slice(2);
const TOP_N = args.includes('--all') ? Infinity : Number(args[args.indexOf('--top') + 1]) || TOP_N_DEFAULT;
const CSV_PATH = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
// --asof YYYY-MM-DD → compute the rankings as they'd have looked on that date (snapshot).
// Only fights on/before the date count; "active" is measured against the date, not today.
const ASOF = args.includes('--asof') ? new Date(args[args.indexOf('--asof') + 1]) : new Date('2026-06-22');
// --position → score each fighter as their recency-weighted AVERAGE CARD SLOT (1.0 = main
// event, 2.0 = co-main, higher = further down), instead of the 0-100 placement score. Reads
// intuitively ("you'd expect this fighter around slot 1.3") but cannot also carry the
// PPV-vs-Fight-Night weighting, since a slot is a slot. Lower is better; the list sorts ascending.
const METRIC: 'score' | 'position' = args.includes('--position') ? 'position' : 'score';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function eventMultiplier(name: string): number {
  if (/^ufc\s+\d+/i.test(name.trim())) return MULT_NUMBERED;
  if (/fight night/i.test(name) || /^ufc on /i.test(name)) return MULT_FIGHT_NIGHT;
  return MULT_OTHER;
}

/** Placement score 0-100 from dense rank (1=main event) and card size. */
function placementScore(pos: number, n: number): number {
  if (pos === 1) return 100;          // main event
  if (pos === 2) return 85;           // co-main
  if (n <= 2) return 85;
  const t = (pos - 3) / Math.max(1, n - 3); // 0 at first-after-comain → 1 at bottom
  return 70 - t * 50;                 // 70 → 20 gradient across the rest of the card
}

type FightRow = {
  eventId: string; eventName: string; date: Date;
  orderOnCard: number; cardType: string | null;
  f1: string; f2: string; f1Last: string; f2Last: string;
  fightWC: string | null;
};

async function main() {
  const events = await prisma.event.findMany({
    where: { promotion: 'UFC', eventStatus: 'COMPLETED' },
    select: {
      id: true, name: true, date: true,
      fights: {
        select: {
          orderOnCard: true, cardType: true, weightClass: true,
          fighter1Id: true, fighter2Id: true,
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        },
      },
    },
  });

  // Build, per fighter, their list of (date, placementScore*multiplier) entries.
  type Entry = { date: Date; value: number; raw: number; mult: number; eventName: string; pos: number; n: number; wc: string | null; oppId: string };
  const perFighter = new Map<string, Entry[]>();

  let invertedEvents = 0;
  for (const e of events) {
    const fights = [...e.fights].filter(f => f.orderOnCard != null).sort((a, b) => a.orderOnCard - b.orderOnCard);
    if (fights.length === 0) continue;
    const evName = norm(e.name);
    const lastsOf = (f: typeof fights[0]) =>
      [f.fighter1?.lastName, f.fighter2?.lastName].filter((x): x is string => !!x && x.length >= 3).map(norm);
    const inName = (f: typeof fights[0]) => lastsOf(f).some(ln => evName.includes(ln));

    // direction: if the BOTTOM fighters are named but the TOP ones aren't → inverted.
    const topF = fights[0], botF = fights[fights.length - 1];
    const inverted = inName(botF) && !inName(topF);
    if (inverted) invertedEvents++;

    // dense rank → pos (1 = main event) honouring direction
    const ordered = inverted ? [...fights].reverse() : fights;
    const n = ordered.length;
    let pos = 0, prevOrd: number | null = null;
    const mult = eventMultiplier(e.name);
    ordered.forEach((f, idx) => {
      // dense rank on orderOnCard (ties share a slot)
      if (prevOrd === null || f.orderOnCard !== prevOrd) pos = idx + 1;
      prevOrd = f.orderOnCard;
      const raw = placementScore(pos, n);
      const value = raw * mult;
      const pair: [string, string][] = [[f.fighter1Id, f.fighter2Id], [f.fighter2Id, f.fighter1Id]];
      for (const [fid, oppId] of pair) {
        if (!perFighter.has(fid)) perFighter.set(fid, []);
        perFighter.get(fid)!.push({ date: e.date, value, raw, mult, eventName: e.name, pos, n, wc: f.weightClass, oppId });
      }
    });
  }

  // Fighter metadata for division + name
  const fighters = await prisma.fighter.findMany({
    where: { id: { in: [...perFighter.keys()] } },
    select: { id: true, firstName: true, lastName: true, weightClass: true, isActive: true },
  });
  const fInfo = new Map(fighters.map(f => [f.id, f]));

  // pre-sort each fighter's entries newest-first (reused for division + scoring), and for an
  // --asof snapshot drop everything after the cutoff so the ranking reflects only what was
  // known on that date. Fighters with no qualifying fight by then fall out naturally.
  const sortedByFighter = new Map<string, Entry[]>();
  for (const [fid, list] of perFighter) {
    const kept = list.filter(e => e.date <= ASOF).sort((a, b) => b.date.getTime() - a.date.getTime());
    if (kept.length) sortedByFighter.set(fid, kept);
  }

  // ANCHOR division map: fighters whose division we KNOW directly — most-recent non-null
  // Fight.weightClass, else the profile weightClass. These anchor the opponent-inference below.
  const anchorWC = new Map<string, string>();
  for (const [fid, sorted] of sortedByFighter) {
    const wc = sorted.find(e => e.wc)?.wc || fInfo.get(fid)?.weightClass || null;
    if (wc) anchorWC.set(fid, wc);
  }

  // divisionOf: known anchor first; otherwise INFER from the fighter's recent opponents.
  // Matchmaking pairs same-division fighters, so the modal (recency-weighted) division of
  // their last few opponents recovers stars whose own WC fields are all null (Volkanovski,
  // Shevchenko, Zhang Weili, …) without any external scrape or prod write.
  let inferredCount = 0;
  function divisionOf(fid: string, sorted: Entry[]): { wc: string | null; inferred: boolean } {
    const known = anchorWC.get(fid);
    if (known) return { wc: known, inferred: false };
    const votes = new Map<string, number>();
    sorted.slice(0, 5).forEach((e, i) => {
      const owc = anchorWC.get(e.oppId);
      if (owc) votes.set(owc, (votes.get(owc) ?? 0) + Math.pow(RECENCY_DECAY, i));
    });
    let best: string | null = null, bestV = 0;
    for (const [wc, v] of votes) if (v > bestV) { best = wc; bestV = v; }
    if (best) inferredCount++;
    return { wc: best, inferred: true };
  }

  const activeCutoff = new Date(ASOF); activeCutoff.setMonth(activeCutoff.getMonth() - ACTIVE_MONTHS);
  const recentCutoff = new Date(ASOF); recentCutoff.setMonth(recentCutoff.getMonth() - RECENT_WINDOW_MONTHS);

  type Ranked = { name: string; score: number; tiebreak: number; wc: string; lastDate: Date; nFights: number; recent: Entry[]; inferredDiv: boolean };
  const ranked: Ranked[] = [];
  let noWC = 0;

  for (const [fid, entries] of sortedByFighter) {
    const info = fInfo.get(fid);
    if (!info) continue;
    const lastDate = entries[0].date;
    if (lastDate < activeCutoff) continue;                 // inactive → skip
    // activity gate: must have fought ≥ MIN_RECENT_FIGHTS times within the recent window
    if (entries.filter(e => e.date >= recentCutoff).length < MIN_RECENT_FIGHTS) continue;
    const window = entries.slice(0, RECENCY_K);
    if (window.length < MIN_FIGHTS) continue;

    // recency-weighted averages: both the 0-100 placement value AND the literal card slot.
    // The chosen metric is `score`; the other becomes the tiebreak so that, in slot mode, two
    // fighters who both average slot 1.0 are split by PPV weight (PPV main-eventer ranks above
    // a Fight-Night main-eventer) instead of arbitrarily.
    let numV = 0, numP = 0, den = 0;
    window.forEach((e, i) => { const w = Math.pow(RECENCY_DECAY, i); numV += w * e.value; numP += w * e.pos; den += w; });
    const scoreV1 = numV / den, avgSlot = numP / den;
    const score = METRIC === 'position' ? avgSlot : scoreV1;
    const tiebreak = METRIC === 'position' ? scoreV1 : avgSlot;

    const { wc, inferred } = divisionOf(fid, entries);
    if (!wc) { noWC++; continue; }

    ranked.push({
      name: `${info.firstName} ${info.lastName}`.trim(),
      score, tiebreak, wc, lastDate, nFights: window.length, recent: window, inferredDiv: inferred,
    });
  }

  // group by division
  const byDiv = new Map<string, Ranked[]>();
  for (const r of ranked) { if (!byDiv.has(r.wc)) byDiv.set(r.wc, []); byDiv.get(r.wc)!.push(r); }
  // sort: primary metric, then PPV weight (tiebreak), then most-recent fight (final tiebreak) so
  // genuinely-tied fighters (same slot AND same PPV weight) are ordered by who fought last.
  for (const list of byDiv.values()) list.sort((a, b) =>
    (METRIC === 'position' ? (a.score - b.score) || (b.tiebreak - a.tiebreak) : (b.score - a.score) || (a.tiebreak - b.tiebreak))
    || (b.lastDate.getTime() - a.lastDate.getTime()));

  // ----- output -----
  console.log(`CARD-PLACEMENT POWER RANKINGS  (UFC)  — as of ${ASOF.toISOString().slice(0, 10)}  [metric: ${METRIC === 'position' ? 'avg card slot (1.0 = main event, lower = higher)' : '0-100 placement score (higher = better)'}]`);
  console.log(`recency: last ${RECENCY_K} fights, decay ${RECENCY_DECAY} | active ≤ ${ACTIVE_MONTHS}mo${METRIC === 'position' ? '' : ` | numbered ×${MULT_NUMBERED} / fightNight ×${MULT_FIGHT_NIGHT}`}`);
  console.log(`events scanned: ${events.length} | inverted-order events corrected on the fly: ${invertedEvents} | ranked fighters: ${ranked.length} (division inferred from opponents for ${inferredCount}, marked ~) | skipped (no division): ${noWC}\n`);

  const DIV_ORDER = [
    'HEAVYWEIGHT','LIGHT_HEAVYWEIGHT','MIDDLEWEIGHT','WELTERWEIGHT','LIGHTWEIGHT',
    'FEATHERWEIGHT','BANTAMWEIGHT','FLYWEIGHT',
    'WOMENS_BANTAMWEIGHT','WOMENS_FLYWEIGHT','WOMENS_STRAWWEIGHT','WOMENS_FEATHERWEIGHT',
  ];
  const divs = [...byDiv.keys()].sort((a, b) => {
    const ia = DIV_ORDER.indexOf(a), ib = DIV_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const valHeader = METRIC === 'position' ? 'avgCardSlot' : 'score';
  const csvRows: string[] = [`division,rank,fighter,${valHeader},fightsUsed,lastFight,divisionInferred`];
  for (const div of divs) {
    const list = byDiv.get(div)!;
    console.log(`\n━━━ ${div.replace(/_/g, ' ')} ━━━  (${list.length} ranked)`);
    list.slice(0, TOP_N).forEach((r, i) => {
      const shown = METRIC === 'position' ? r.score.toFixed(2) : r.score.toFixed(1);
      console.log(
        `${String(i + 1).padStart(2)}. ${(r.name + (r.inferredDiv ? ' ~' : '')).padEnd(28)} ${shown.padStart(5)}  ` +
        `[${r.recent.map(e => `${e.pos}/${e.n}${e.mult === MULT_NUMBERED ? 'P' : e.mult === MULT_FIGHT_NIGHT ? 'n' : 'o'}`).join(' ')}]  last ${r.lastDate.toISOString().slice(0, 10)}`
      );
      csvRows.push(`${div},${i + 1},"${r.name}",${r.score.toFixed(2)},${r.nFights},${r.lastDate.toISOString().slice(0, 10)},${r.inferredDiv ? 'yes' : 'no'}`);
    });
  }
  console.log(`\nlegend: number = ${METRIC === 'position' ? 'avg card slot (1.0 = main event, 2.0 = co-main, lower is higher up)' : '0-100 placement score (higher = better)'}  |  [pos/cardSize  P=numbered PPV  n=fight night  o=other]  |  ~ = division inferred from opponents`);

  if (CSV_PATH) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, csvRows.join('\n'));
    console.log(`\nCSV written: ${CSV_PATH}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
