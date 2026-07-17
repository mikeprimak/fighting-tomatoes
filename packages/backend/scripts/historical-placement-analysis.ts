/**
 * HISTORICAL card-placement analysis (READ-ONLY). Uses the full UFC history (back to 1993)
 * to surface insights the current snapshot can't: all-time top-of-the-card leaders and
 * individual career placement arcs (rise/peak/decline).
 *
 * Order direction recovered per event with a stronger check than the live ranking script:
 * name-signal first (UFC cards named after their main event), then a rating-monotonicity
 * fallback for numbered PPVs (no fighter names) — if the bottom-of-order fights are far more
 * rated than the top-of-order fights, the card is stored inverted. This catches the legacy
 * inverted PPVs the §8 name-only audit can't.
 */
import { prisma } from '../src/lib/prisma';

const POS = process.argv.includes('--position'); // express averages/arcs as avg card slot
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isNumbered = (name: string) => /^ufc\s+\d+/i.test(name.trim());
function placementScore(pos: number, n: number): number {
  if (pos === 1) return 100;
  if (pos === 2) return 85;
  if (n <= 2) return 85;
  const t = (pos - 3) / Math.max(1, n - 3);
  return 70 - t * 50;
}

type Career = {
  name: string; fights: { date: Date; pos: number; n: number; raw: number; numbered: boolean }[];
};

async function main() {
  const events = await prisma.event.findMany({
    where: { promotion: 'UFC', eventStatus: 'COMPLETED' },
    select: {
      id: true, name: true, date: true,
      fights: { select: {
        orderOnCard: true, totalRatings: true,
        fighter1Id: true, fighter2Id: true,
        fighter1: { select: { firstName: true, lastName: true } },
        fighter2: { select: { firstName: true, lastName: true } },
      } },
    },
  });

  const careers = new Map<string, Career>();
  const nameOf = (f: { firstName: string; lastName: string } | null) => f ? `${f.firstName} ${f.lastName}`.trim() : '?';
  let invertedCount = 0;

  for (const e of events) {
    const fights = [...e.fights].filter(f => f.orderOnCard != null).sort((a, b) => a.orderOnCard - b.orderOnCard);
    if (fights.length < 3) continue;
    const evName = norm(e.name);
    const lastsOf = (f: typeof fights[0]) =>
      [f.fighter1?.lastName, f.fighter2?.lastName].filter((x): x is string => !!x && x.length >= 3).map(norm);
    const inName = (f: typeof fights[0]) => lastsOf(f).some(ln => evName.includes(ln));
    const top = fights[0], bot = fights[fights.length - 1];

    let inverted: boolean;
    if (inName(bot) && !inName(top)) inverted = true;
    else if (inName(top) && !inName(bot)) inverted = false;
    else {
      // neutral → rating-monotonicity fallback (mainly numbered PPVs)
      const sum = (arr: typeof fights) => arr.reduce((s, f) => s + f.totalRatings, 0);
      const lowEnd = sum(fights.slice(0, 3));       // lowest orders ("claimed main")
      const highEnd = sum(fights.slice(-3));         // highest orders ("claimed prelim")
      inverted = highEnd > lowEnd * 2 && highEnd > 15;
    }
    if (inverted) invertedCount++;

    const ordered = inverted ? [...fights].reverse() : fights;
    const n = ordered.length;
    let pos = 0, prevOrd: number | null = null;
    ordered.forEach((f, idx) => {
      if (prevOrd === null || f.orderOnCard !== prevOrd) pos = idx + 1;
      prevOrd = f.orderOnCard;
      const raw = placementScore(pos, n);
      for (const [fid, info] of [[f.fighter1Id, f.fighter1], [f.fighter2Id, f.fighter2]] as const) {
        if (!careers.has(fid)) careers.set(fid, { name: nameOf(info), fights: [] });
        careers.get(fid)!.fights.push({ date: e.date, pos, n, raw, numbered: isNumbered(e.name) });
      }
    });
  }

  // derive career stats
  type Row = {
    name: string; n: number; mains: number; coMains: number; ppvMains: number;
    avg: number; span: string; first3: number; last3: number; firstDate: Date; lastDate: Date;
  };
  const rows: Row[] = [];
  for (const c of careers.values()) {
    const fs = [...c.fights].sort((a, b) => a.date.getTime() - b.date.getTime());
    const n = fs.length;
    const mains = fs.filter(f => f.pos === 1).length;
    const coMains = fs.filter(f => f.pos === 2).length;
    const ppvMains = fs.filter(f => f.pos === 1 && f.numbered).length;
    const val = (f: typeof fs[0]) => POS ? f.pos : f.raw;
    const avg = fs.reduce((s, f) => s + val(f), 0) / n;
    const third = Math.max(1, Math.floor(n / 3));
    const mean = (arr: typeof fs) => arr.reduce((s, f) => s + val(f), 0) / arr.length;
    const first3 = mean(fs.slice(0, third));
    const last3 = mean(fs.slice(-third));
    rows.push({
      name: c.name, n, mains, coMains, ppvMains, avg,
      firstDate: fs[0].date, lastDate: fs[n - 1].date,
      span: `${fs[0].date.getFullYear()}–${fs[n - 1].date.getFullYear()}`,
      first3, last3,
    });
  }

  const avgL = POS ? 'avgSlot' : 'avg';
  const fmtAvg = (v: number) => POS ? v.toFixed(2).padStart(5) : v.toFixed(1).padStart(5);
  const fmtArc = (v: number) => POS ? v.toFixed(1).padStart(4) : v.toFixed(0).padStart(3);
  const pr = (r: Row) => `${r.name.padEnd(24)} fights=${String(r.n).padStart(3)} main=${String(r.mains).padStart(2)} co=${String(r.coMains).padStart(2)} ppvMain=${String(r.ppvMains).padStart(2)} ${avgL}=${fmtAvg(r.avg)}  ${r.span}`;
  // "better" average = higher score, but LOWER slot
  const betterAvg = (a: Row, b: Row) => POS ? a.avg - b.avg : b.avg - a.avg;
  // career got WORSE (decline): slot rises (last>first) in POS; score drops (first>last) in score mode
  const declineAmt = (r: Row) => POS ? r.last3 - r.first3 : r.first3 - r.last3;

  console.log(`metric: ${POS ? 'avg card slot (1.0 = main event, lower = higher up)' : '0-100 placement score'}`);
  console.log(`events used: ${events.length} | order-inverted (corrected): ${invertedCount} | fighters: ${rows.length}\n`);

  console.log('═══ MOST CAREER UFC MAIN EVENTS (top-of-the-card leaders) ═══');
  [...rows].sort((a, b) => b.mains - a.mains || betterAvg(a, b)).slice(0, 30).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${pr(r)}`));

  console.log('\n═══ MOST CAREER PPV MAIN EVENTS (numbered-card headliners) ═══');
  [...rows].sort((a, b) => b.ppvMains - a.ppvMains || betterAvg(a, b)).slice(0, 20).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${pr(r)}`));

  console.log(`\n═══ ${POS ? 'LOWEST AVG CARD SLOT' : 'HIGHEST CAREER AVG PLACEMENT'} (min 12 fights) — the perennial top-billers ═══`);
  rows.filter(r => r.n >= 12).sort(betterAvg).slice(0, 30).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${pr(r)}`));

  console.log('\n═══ STEEPEST CAREER DECLINE (first-third → last-third, min 12 fights) ═══');
  rows.filter(r => r.n >= 12).sort((a, b) => declineAmt(b) - declineAmt(a)).slice(0, 15)
    .forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(24)} ${fmtArc(r.first3)} → ${fmtArc(r.last3)}  (Δ${declineAmt(r) >= 0 ? '' : ''}${declineAmt(r).toFixed(POS ? 1 : 0)})  ${r.n} fights  ${r.span}`));

  console.log('\n═══ STEEPEST CAREER RISE (first-third → last-third, min 12 fights) ═══');
  rows.filter(r => r.n >= 12).sort((a, b) => declineAmt(a) - declineAmt(b)).slice(0, 15)
    .forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(24)} ${fmtArc(r.first3)} → ${fmtArc(r.last3)}  (Δ${(-declineAmt(r)).toFixed(POS ? 1 : 0)})  ${r.n} fights  ${r.span}`));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
