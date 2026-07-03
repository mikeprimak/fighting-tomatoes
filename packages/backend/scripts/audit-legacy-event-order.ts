/**
 * READ-ONLY audit: find legacy (scraperType=null) COMPLETED events whose `orderOnCard`
 * is inverted (main event sits at the HIGHEST order instead of order 1). The whole app
 * assumes order 1 = main event, so inverted events render upside-down.
 *
 * Scope is NOT uniform — many legacy multi-fight events are already correct (memory:
 * lesson_legacy_event_order_inversion). A blanket reversal would break those, so we score
 * each event and only flag with confidence when an AUTHORITATIVE signal agrees — never on
 * the rating heuristic alone (an upset/FOTN prelim can be the most-rated fight). Writes
 * NOTHING. Produces a CSV for per-event spot-checking before any fix is applied.
 *
 * Signals (each votes INVERTED / CORRECT / NEUTRAL by comparing the lowest-order fight
 * "claimed main" vs the highest-order fight "claimed last prelim"):
 *   - name:   most UFC events are NAMED after their main event ("FN Holm vs Shevchenko").
 *             If the event name contains the highest-order fight's fighters but not the
 *             lowest-order fight's, the card is inverted. AUTHORITATIVE when it fires
 *             (numbered PPVs like "UFC 200" carry no names → neutral).
 *   - title:  a title fight is almost always the main event. AUTHORITATIVE but SPARSE in
 *             legacy data (isTitle rarely set).
 *   - rating: the headliner usually draws the most ratings. WEAK — corroborates only.
 *   (A `rounds` signal was dropped: legacy fights all default to scheduledRounds=3, so it
 *    never carries information.)
 *
 * Verdict tiers (most→least trustworthy):
 *   SENTINEL              out-of-range order value (e.g. 99/115) — manual look regardless.
 *   INVERTED-HIGH         a structural signal (name|title) AND rating both say inverted.
 *   INVERTED-STRUCTURAL   a structural signal says inverted; rating is silent (still trust).
 *   INVERTED-RATING-ONLY  only the rating heuristic says inverted — DO NOT auto-fix; verify.
 *   CORRECT               a structural signal says the card is already correct.
 *   CORRECT-RATING-ONLY   only ratings say correct.
 *   UNCERTAIN             signals conflict, or everything is neutral.
 *
 * Usage: from packages/backend/  npx tsx scripts/audit-legacy-event-order.ts [outCsvPath]
 */
import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

type Vote = 'INVERTED' | 'CORRECT' | 'NEUTRAL';
type Verdict =
  | 'SENTINEL'
  | 'INVERTED-HIGH'
  | 'INVERTED-STRUCTURAL'
  | 'INVERTED-RATING-ONLY'
  | 'CORRECT'
  | 'CORRECT-RATING-ONLY'
  | 'UNCERTAIN';

const MIN_FIGHTS = 3; // need a real card to talk about order

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function endVote(low: number, high: number): Vote {
  if (high > low) return 'INVERTED';
  if (low > high) return 'CORRECT';
  return 'NEUTRAL';
}

async function main() {
  const outCsv = process.argv[2] || path.join(__dirname, 'output', 'legacy-order-audit.csv');

  const events = await prisma.event.findMany({
    where: { scraperType: null, eventStatus: 'COMPLETED' },
    select: {
      id: true,
      name: true,
      date: true,
      fights: {
        select: {
          orderOnCard: true,
          isTitle: true,
          totalRatings: true,
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        },
      },
    },
  });

  type Row = {
    id: string; name: string; date: string; n: number; minOrder: number; maxOrder: number;
    nameVote: Vote; titleVote: Vote; ratingVote: Vote; verdict: Verdict; note: string;
  };
  const rows: Row[] = [];
  const tally = {} as Record<Verdict, number>;
  let skipped = 0;

  for (const e of events) {
    const fights = [...e.fights].sort((a, b) => a.orderOnCard - b.orderOnCard);
    if (fights.length < MIN_FIGHTS) { skipped++; continue; }

    const orders = fights.map((f) => f.orderOnCard);
    const n = fights.length;
    const minOrder = orders[0];
    const maxOrder = orders[orders.length - 1];
    const first = fights[0];                 // lowest order  = "claimed main event"
    const last = fights[fights.length - 1];  // highest order = "claimed last prelim"
    const sentinel = orders.some((o) => o > n + 5 || o < 1);

    // --- name signal: which end's fighters appear in the event name? ---
    const evName = norm(e.name);
    const lastNames = (f: typeof first) =>
      [f.fighter1?.lastName, f.fighter2?.lastName]
        .filter((x): x is string => !!x && x.length >= 3)
        .map(norm);
    const inName = (f: typeof first) => lastNames(f).some((ln) => evName.includes(ln));
    const firstInName = inName(first);
    const lastInName = inName(last);
    let nameVote: Vote = 'NEUTRAL';
    if (lastInName && !firstInName) nameVote = 'INVERTED';
    else if (firstInName && !lastInName) nameVote = 'CORRECT';

    // --- title signal ---
    let titleVote: Vote = 'NEUTRAL';
    if (last.isTitle && !first.isTitle) titleVote = 'INVERTED';
    else if (first.isTitle && !last.isTitle) titleVote = 'CORRECT';

    // --- rating signal (weak) ---
    let ratingVote: Vote = 'NEUTRAL';
    if (first.totalRatings > 0 || last.totalRatings > 0) {
      ratingVote = endVote(first.totalRatings, last.totalRatings);
    }

    // structural vote prefers the name signal, falls back to title.
    const structural: Vote = nameVote !== 'NEUTRAL' ? nameVote : titleVote;

    let verdict: Verdict;
    if (sentinel) {
      verdict = 'SENTINEL';
    } else if (structural === 'INVERTED') {
      verdict = ratingVote === 'INVERTED' ? 'INVERTED-HIGH'
        : ratingVote === 'CORRECT' ? 'UNCERTAIN'           // structural vs rating conflict
        : 'INVERTED-STRUCTURAL';
    } else if (structural === 'CORRECT') {
      verdict = ratingVote === 'INVERTED' ? 'UNCERTAIN' : 'CORRECT';
    } else { // structural neutral → rating only
      verdict = ratingVote === 'INVERTED' ? 'INVERTED-RATING-ONLY'
        : ratingVote === 'CORRECT' ? 'CORRECT-RATING-ONLY'
        : 'UNCERTAIN';
    }

    tally[verdict] = (tally[verdict] ?? 0) + 1;
    rows.push({
      id: e.id, name: e.name, date: e.date ? e.date.toISOString().slice(0, 10) : '',
      n, minOrder, maxOrder, nameVote, titleVote, ratingVote, verdict,
      note: sentinel ? `orders=[${orders.join(',')}]` : '',
    });
  }

  const order: Verdict[] = [
    'INVERTED-HIGH', 'INVERTED-STRUCTURAL', 'SENTINEL', 'INVERTED-RATING-ONLY',
    'UNCERTAIN', 'CORRECT', 'CORRECT-RATING-ONLY',
  ];
  const rank = Object.fromEntries(order.map((v, i) => [v, i])) as Record<Verdict, number>;
  rows.sort((a, b) => rank[a.verdict] - rank[b.verdict] || (b.date < a.date ? -1 : 1));

  fs.mkdirSync(path.dirname(outCsv), { recursive: true });
  const header = 'verdict,eventId,date,name,numFights,minOrder,maxOrder,nameVote,titleVote,ratingVote,note';
  const csv = [header, ...rows.map((r) =>
    [r.verdict, r.id, r.date, `"${r.name.replace(/"/g, "'")}"`, r.n, r.minOrder, r.maxOrder,
     r.nameVote, r.titleVote, r.ratingVote, `"${r.note}"`].join(','))].join('\n');
  fs.writeFileSync(outCsv, csv);

  console.log(`\n=== Legacy event-order audit (READ-ONLY) ===`);
  console.log(`Legacy COMPLETED events scanned: ${events.length}`);
  console.log(`  skipped (<${MIN_FIGHTS} fights): ${skipped}`);
  console.log(`  scored: ${rows.length}\n`);
  console.log(`Verdict tally (most→least trustworthy):`);
  for (const k of order) console.log(`  ${k.padEnd(22)} ${tally[k] ?? 0}`);

  const auto = (tally['INVERTED-HIGH'] ?? 0) + (tally['INVERTED-STRUCTURAL'] ?? 0);
  console.log(`\nSafe-to-fix (structural signal, no conflict): ${auto}`);
  console.log(`Needs external verification (rating-only):    ${tally['INVERTED-RATING-ONLY'] ?? 0}`);
  console.log(`\nCSV written: ${outCsv}`);

  const top = rows.filter((r) => r.verdict === 'INVERTED-HIGH' || r.verdict === 'INVERTED-STRUCTURAL').slice(0, 30);
  console.log(`\n--- Sample structural-INVERTED (first ${top.length}) ---`);
  for (const r of top) {
    console.log(
      `  ${r.verdict === 'INVERTED-HIGH' ? 'HIGH' : 'STRC'}  ${r.date}  ` +
      `${r.name.slice(0, 38).padEnd(39)} n=${String(r.n).padEnd(3)} ` +
      `name=${r.nameVote[0]} title=${r.titleVote[0]} rating=${r.ratingVote[0]}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
