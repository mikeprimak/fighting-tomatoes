/**
 * CARD-PLACEMENT — shared compute layer for the evergreen article generator.
 * READ-ONLY against the DB. Reproduces the numbers published in
 * packages/web/src/content/posts/2026-06-24-ufc-card-placement-rankings.md so a
 * monthly job can regenerate the data-driven blocks (lists, banners, charts,
 * historical leaders) while a human keeps editorial control of the prose.
 *
 * Method (matches the article's stated method, "average of last three card
 * positions"): SIMPLE average of the last-3 card SLOTS (1 = main event), no
 * recency decay, no PPV weighting. Board split: a fighter is a "Big Card"
 * fighter if >= 2 of their last 3 bouts were on a numbered event, else "Fight
 * Night". Legacy inverted-order events are corrected on the fly from the event
 * name (UFC cards are named after their main event), then a rating-monotonicity
 * fallback for nameless numbered PPVs — same logic as the two analysis scripts.
 */
import { prisma } from '../../src/lib/prisma';

export const ACTIVE_MONTHS = 18;        // last fight within this window
export const RECENT_WINDOW_MONTHS = 24; // "at least two bouts in the last two years"
export const MIN_RECENT_FIGHTS = 2;
export const RECENCY_K = 3;             // last-N fights averaged

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const isNumbered = (name: string) => /^ufc\s+\d+/i.test(name.trim());

export const DIV_ORDER = [
  'HEAVYWEIGHT', 'LIGHT_HEAVYWEIGHT', 'MIDDLEWEIGHT', 'WELTERWEIGHT', 'LIGHTWEIGHT',
  'FEATHERWEIGHT', 'BANTAMWEIGHT', 'FLYWEIGHT',
  'WOMENS_BANTAMWEIGHT', 'WOMENS_FLYWEIGHT', 'WOMENS_STRAWWEIGHT', 'WOMENS_FEATHERWEIGHT',
];
export const DIV_LABEL: Record<string, string> = {
  HEAVYWEIGHT: 'Heavyweight', LIGHT_HEAVYWEIGHT: 'Light Heavyweight', MIDDLEWEIGHT: 'Middleweight',
  WELTERWEIGHT: 'Welterweight', LIGHTWEIGHT: 'Lightweight', FEATHERWEIGHT: 'Featherweight',
  BANTAMWEIGHT: 'Bantamweight', FLYWEIGHT: 'Flyweight',
  WOMENS_BANTAMWEIGHT: 'Women’s Bantamweight', WOMENS_FLYWEIGHT: 'Women’s Flyweight',
  WOMENS_STRAWWEIGHT: 'Women’s Strawweight', WOMENS_FEATHERWEIGHT: 'Women’s Featherweight',
};
// Short labels for the bar charts, lightest -> heaviest.
export const MEN_CHART = [
  { wc: 'FLYWEIGHT', short: 'FLY' }, { wc: 'BANTAMWEIGHT', short: 'BW' },
  { wc: 'FEATHERWEIGHT', short: 'FW' }, { wc: 'LIGHTWEIGHT', short: 'LW' },
  { wc: 'WELTERWEIGHT', short: 'WW' }, { wc: 'MIDDLEWEIGHT', short: 'MW' },
  { wc: 'LIGHT_HEAVYWEIGHT', short: 'LHW' }, { wc: 'HEAVYWEIGHT', short: 'HW' },
];
export const WOMEN_CHART = [
  { wc: 'WOMENS_STRAWWEIGHT', short: 'SW' }, { wc: 'WOMENS_FLYWEIGHT', short: 'FLY' },
  { wc: 'WOMENS_BANTAMWEIGHT', short: 'BW' },
];

/** Banner shows one decimal always (1.0, 2.0); lists drop a trailing .0 (1, 2). */
export const fmtBanner = (v: number) => v.toFixed(1);
export const fmtList = (v: number) => String(parseFloat(v.toFixed(1)));

export type FighterRow = {
  id: string; name: string; wc: string; board: 'bigcard' | 'fightnight';
  avg: number; lastDate: Date; numberedOfLast3: number; nUsed: number;
  profileImage: string | null;
};

export type AllTime = {
  mostMains: { name: string; mains: number; ppvMains: number }[];
  careerAvg: { name: string; avg: number }[];
  climbs: { name: string; from: number; to: number }[];
  headlinersByYear: { year: number; fighters: { name: string; count: number }[] }[];
};

export type ComputeResult = {
  asof: string;
  fighters: FighterRow[];
  byDiv: Map<string, { bigcard: FighterRow[]; fightnight: FighterRow[] }>;
  p4pBig: FighterRow[];
  p4pNight: FighterRow[];
  chartMen: { wc: string; short: string; count: number }[];
  chartWomen: { wc: string; short: string; count: number }[];
  allTime: AllTime;
};

/** Recover per-event order direction, returning fights ordered main-event-first. */
function orderEvent<T extends { orderOnCard: number | null; totalRatings: number;
  fighter1: { lastName: string | null } | null; fighter2: { lastName: string | null } | null }>(
  evName: string, rawFights: T[],
): { ordered: T[]; inverted: boolean } {
  const fights = [...rawFights].filter(f => f.orderOnCard != null)
    .sort((a, b) => (a.orderOnCard as number) - (b.orderOnCard as number));
  if (fights.length < 2) return { ordered: fights, inverted: false };
  const en = norm(evName);
  const lastsOf = (f: T) => [f.fighter1?.lastName, f.fighter2?.lastName]
    .filter((x): x is string => !!x && x.length >= 3).map(norm);
  const inName = (f: T) => lastsOf(f).some(ln => en.includes(ln));
  const top = fights[0], bot = fights[fights.length - 1];
  let inverted: boolean;
  if (inName(bot) && !inName(top)) inverted = true;
  else if (inName(top) && !inName(bot)) inverted = false;
  else {
    const sum = (arr: T[]) => arr.reduce((s, f) => s + f.totalRatings, 0);
    const lowEnd = sum(fights.slice(0, 3));
    const highEnd = sum(fights.slice(-3));
    inverted = highEnd > lowEnd * 2 && highEnd > 15;
  }
  return { ordered: inverted ? [...fights].reverse() : fights, inverted };
}

export async function compute(asof: Date): Promise<ComputeResult> {
  const events = await prisma.event.findMany({
    where: { promotion: 'UFC', eventStatus: 'COMPLETED' },
    select: {
      id: true, name: true, date: true,
      fights: {
        select: {
          orderOnCard: true, totalRatings: true, weightClass: true,
          fighter1Id: true, fighter2Id: true,
          fighter1: { select: { lastName: true } },
          fighter2: { select: { lastName: true } },
        },
      },
    },
  });

  type Entry = { date: Date; pos: number; n: number; numbered: boolean; wc: string | null; oppId: string; eventName: string };
  const perFighter = new Map<string, Entry[]>();

  for (const e of events) {
    if (e.date > asof) continue;
    const { ordered } = orderEvent(e.name, e.fights);
    const n = ordered.length;
    if (n === 0) continue;
    const numbered = isNumbered(e.name);
    let pos = 0, prevOrd: number | null = null;
    ordered.forEach((f, idx) => {
      if (prevOrd === null || f.orderOnCard !== prevOrd) pos = idx + 1;
      prevOrd = f.orderOnCard;
      for (const [fid, oppId] of [[f.fighter1Id, f.fighter2Id], [f.fighter2Id, f.fighter1Id]] as const) {
        if (!perFighter.has(fid)) perFighter.set(fid, []);
        perFighter.get(fid)!.push({ date: e.date, pos, n, numbered, wc: f.weightClass, oppId, eventName: e.name });
      }
    });
  }

  const meta = await prisma.fighter.findMany({
    where: { id: { in: [...perFighter.keys()] } },
    select: { id: true, firstName: true, lastName: true, weightClass: true, profileImage: true },
  });
  const fInfo = new Map(meta.map(f => [f.id, f]));

  // newest-first per fighter
  const sorted = new Map<string, Entry[]>();
  for (const [fid, list] of perFighter) {
    const kept = list.sort((a, b) => b.date.getTime() - a.date.getTime());
    sorted.set(fid, kept);
  }

  // anchor division (known), then infer from recent opponents for null-WC stars
  const anchorWC = new Map<string, string>();
  for (const [fid, list] of sorted) {
    const wc = list.find(e => e.wc)?.wc || fInfo.get(fid)?.weightClass || null;
    if (wc) anchorWC.set(fid, wc);
  }
  function divisionOf(fid: string, list: Entry[]): string | null {
    const known = anchorWC.get(fid);
    if (known) return known;
    const votes = new Map<string, number>();
    list.slice(0, 5).forEach((e, i) => {
      const owc = anchorWC.get(e.oppId);
      if (owc) votes.set(owc, (votes.get(owc) ?? 0) + Math.pow(0.6, i));
    });
    let best: string | null = null, bestV = 0;
    for (const [wc, v] of votes) if (v > bestV) { best = wc; bestV = v; }
    return best;
  }

  const activeCutoff = new Date(asof); activeCutoff.setMonth(activeCutoff.getMonth() - ACTIVE_MONTHS);
  const recentCutoff = new Date(asof); recentCutoff.setMonth(recentCutoff.getMonth() - RECENT_WINDOW_MONTHS);

  const fighters: FighterRow[] = [];
  for (const [fid, list] of sorted) {
    const info = fInfo.get(fid);
    if (!info) continue;
    const lastDate = list[0].date;
    if (lastDate < activeCutoff) continue;
    if (list.filter(e => e.date >= recentCutoff).length < MIN_RECENT_FIGHTS) continue;
    const window = list.slice(0, RECENCY_K);
    if (window.length < MIN_RECENT_FIGHTS) continue;
    const wc = divisionOf(fid, list);
    if (!wc) continue;
    const avg = window.reduce((s, e) => s + e.pos, 0) / window.length;
    const numberedOfLast3 = window.filter(e => e.numbered).length;
    fighters.push({
      id: fid, name: `${info.firstName} ${info.lastName}`.trim(), wc,
      board: numberedOfLast3 >= 2 ? 'bigcard' : 'fightnight',
      avg, lastDate, numberedOfLast3, nUsed: window.length, profileImage: info.profileImage,
    });
  }

  const cmp = (a: FighterRow, b: FighterRow) => a.avg - b.avg || b.lastDate.getTime() - a.lastDate.getTime();

  const byDiv = new Map<string, { bigcard: FighterRow[]; fightnight: FighterRow[] }>();
  for (const wc of DIV_ORDER) {
    const inDiv = fighters.filter(f => f.wc === wc);
    if (!inDiv.length) continue;
    byDiv.set(wc, {
      bigcard: inDiv.filter(f => f.board === 'bigcard').sort(cmp),
      fightnight: inDiv.filter(f => f.board === 'fightnight').sort(cmp),
    });
  }

  // P4P boards: leaders across all divisions, top 15 + ties at the boundary.
  const topWithTies = (rows: FighterRow[], n: number) => {
    const s = [...rows].sort(cmp);
    if (s.length <= n) return s;
    const bound = s[n - 1].avg;
    return s.filter((f, i) => i < n || f.avg <= bound);
  };
  const p4pBig = topWithTies(fighters.filter(f => f.board === 'bigcard'), 15);
  const p4pNight = topWithTies(fighters.filter(f => f.board === 'fightnight'), 15);

  const countBig = (wc: string) => fighters.filter(f => f.wc === wc && f.board === 'bigcard').length;
  const chartMen = MEN_CHART.map(c => ({ ...c, count: countBig(c.wc) }));
  const chartWomen = WOMEN_CHART.map(c => ({ ...c, count: countBig(c.wc) }));

  const allTime = await computeAllTime(events, asof);

  return {
    asof: asof.toISOString().slice(0, 10),
    fighters, byDiv, p4pBig, p4pNight, chartMen, chartWomen, allTime,
  };
}

type EventForHist = {
  id: string; name: string; date: Date;
  fights: { orderOnCard: number | null; totalRatings: number;
    fighter1Id: string; fighter2Id: string;
    fighter1: { firstName?: string; lastName: string | null } | null;
    fighter2: { firstName?: string; lastName: string | null } | null; }[];
};

async function computeAllTime(events: any[], asof: Date): Promise<AllTime> {
  // Need first names for display; refetch names for everyone who appears.
  const ids = new Set<string>();
  for (const e of events) for (const f of e.fights) { ids.add(f.fighter1Id); ids.add(f.fighter2Id); }
  const names = await prisma.fighter.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(names.map(f => [f.id, `${f.firstName} ${f.lastName}`.trim()]));

  type Career = { name: string; fights: { date: Date; pos: number; numbered: boolean; slot: number; n: number }[] };
  const careers = new Map<string, Career>();

  for (const e of events as EventForHist[]) {
    if (e.date > asof) continue;
    const { ordered } = orderEvent(e.name, e.fights as any);
    const n = ordered.length;
    if (n < 3) continue;
    const numbered = isNumbered(e.name);
    let pos = 0, prevOrd: number | null = null;
    ordered.forEach((f, idx) => {
      if (prevOrd === null || f.orderOnCard !== prevOrd) pos = idx + 1;
      prevOrd = f.orderOnCard;
      for (const fid of [f.fighter1Id, f.fighter2Id]) {
        if (!careers.has(fid)) careers.set(fid, { name: nameOf.get(fid) || '?', fights: [] });
        careers.get(fid)!.fights.push({ date: e.date, pos, numbered, slot: pos, n });
      }
    });
  }

  // Year headliners: for each numbered event, credit the main-event (pos 1) fight's two fighters.
  const yearHeadliners = new Map<number, Map<string, number>>();
  for (const e of events as EventForHist[]) {
    if (e.date > asof) continue;
    if (!isNumbered(e.name)) continue;
    const { ordered } = orderEvent(e.name, e.fights as any);
    if (ordered.length < 3) continue;
    const main = ordered[0];
    const yr = e.date.getFullYear();
    if (!yearHeadliners.has(yr)) yearHeadliners.set(yr, new Map());
    const ym = yearHeadliners.get(yr)!;
    for (const fid of [main.fighter1Id, main.fighter2Id]) {
      ym.set(fid, (ym.get(fid) ?? 0) + 1);
    }
  }

  // most career main events (pos 1), tie-break by lower career avg slot
  type Row = { name: string; n: number; mains: number; ppvMains: number; avg: number; first3: number; last3: number };
  const rows: Row[] = [];
  for (const c of careers.values()) {
    const fs = [...c.fights].sort((a, b) => a.date.getTime() - b.date.getTime());
    const n = fs.length;
    const mains = fs.filter(f => f.pos === 1).length;
    const ppvMains = fs.filter(f => f.pos === 1 && f.numbered).length;
    const avg = fs.reduce((s, f) => s + f.slot, 0) / n;
    const third = Math.max(1, Math.floor(n / 3));
    const mean = (arr: typeof fs) => arr.reduce((s, f) => s + f.slot, 0) / arr.length;
    rows.push({ name: c.name, n, mains, ppvMains, avg, first3: mean(fs.slice(0, third)), last3: mean(fs.slice(-third)) });
  }

  const mostMains = [...rows].sort((a, b) => b.mains - a.mains || a.avg - b.avg)
    .slice(0, 7).map(r => ({ name: r.name, mains: r.mains, ppvMains: r.ppvMains }));
  const careerAvg = rows.filter(r => r.n >= 12).sort((a, b) => a.avg - b.avg)
    .slice(0, 9).map(r => ({ name: r.name, avg: r.avg }));
  const climbs = rows.filter(r => r.n >= 12).sort((a, b) => (b.first3 - b.last3) - (a.first3 - a.last3))
    .slice(0, 5).map(r => ({ name: r.name, from: r.first3, to: r.last3 }));

  const headlinersByYear = [...yearHeadliners.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, m]) => ({
      year,
      fighters: [...m.entries()]
        .map(([fid, count]) => ({ name: nameOf.get(fid) || '?', count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5),
    }));

  return { mostMains, careerAvg, climbs, headlinersByYear };
}
