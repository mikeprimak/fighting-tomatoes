/**
 * Authoritatively resolve legacy event-order inversion for numbered UFC events
 * using Wikipedia as the external source (BACKLOG §8 — the remaining
 * INVERTED-RATING-ONLY / SENTINEL set the rating heuristic couldn't confirm).
 *
 * Why Wikipedia: ufcstats.com (the original plan) now serves a JS "Loading…"
 * bot interstitial to plain HTTP clients, so fetchUFCStatsEventList() returns 0.
 * Wikipedia's "List of UFC events" wikitext lists every numbered card as
 *   [[UFC 209|UFC 209: Woodley vs. Thompson 2]]
 * i.e. the event name carries the MAIN EVENT — exactly what our bare "UFC 209"
 * rows lack and what makes the order authoritative.
 *
 * Method (per legacy numbered UFC event, scraperType=null):
 *   1. number -> Wikipedia main-event surnames (e.g. {woodley, thompson}).
 *   2. find the DB fight whose two fighters' surnames == that set.
 *   3. that fight's orderOnCard vs the card's min/max:
 *        == max (and min!=max)  -> INVERTED  (main event is last -> upside down)
 *        == min                 -> CORRECT   (already right; e.g. the 225 fixed 2026-06-22)
 *        in the middle          -> AMBIGUOUS (don't touch)
 *   4. --apply flips the INVERTED set with the same self-inverse transform the
 *      phase-2 fix used: newOrder = (min+max) - oldOrder (a bijection over the
 *      order set; orderOnCard is in no unique key, so no collision).
 *
 * This is self-correcting and independent of the prior verdicts: already-correct
 * events (main event at min) are left alone, so re-running can't double-flip.
 *
 * Non-numbered UFC (Fight Night) and non-UFC legacy (Bellator/PRIDE/Invicta/...)
 * are out of scope — Wikipedia's numbered-list trick doesn't cover them.
 *
 * Usage (from packages/backend):
 *   npx tsx scripts/verify-legacy-order-wikipedia.ts            # dry-run
 *   npx tsx scripts/verify-legacy-order-wikipedia.ts --apply    # writes
 */
import { execFileSync } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { Prisma } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const UA = 'GoodFights/1.0 (contact@goodfights.app) legacy-order-audit';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    // atomic letters NFD doesn't decompose (Błachowicz, Teixeira's ø-likes, etc.)
    .replace(/ł/gi, 'l').replace(/ø/gi, 'o').replace(/đ/gi, 'd').replace(/ı/gi, 'i')
    .toLowerCase().trim();
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
/** Last meaningful token of a name, dropping generational suffixes. */
function surname(full: string): string {
  const parts = norm(full).replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
  let i = parts.length - 1;
  while (i > 0 && SUFFIXES.has(parts[i])) i--;
  return parts[i] || '';
}

/** Fetch Wikipedia "List of UFC events" wikitext -> { ufcNumber: "A vs. B" }. */
function fetchWikiMainEvents(): Map<number, string> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_UFC_events&prop=wikitext&format=json';
  const raw = execFileSync('curl', ['-s', '--max-time', '40', '-A', UA, url], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const wikitext: string = JSON.parse(raw).parse.wikitext['*'];
  const map = new Map<number, string>();
  // Wikipedia uses BOTH link forms; capture "UFC <n>: <main>" wherever it appears:
  //   [[UFC 209|UFC 209: Woodley vs. Thompson 2]]   (piped display text)
  //   [[UFC 100: Lesnar vs. Mir 2]]                 (full title as link target)
  const re = /UFC (\d+):\s*([^\]|]+?)(?=\s*[\]|])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    const n = parseInt(m[1], 10);
    const main = m[2].trim();
    if (main && /\bvs\.?\b/i.test(main) && !map.has(n)) map.set(n, main);
  }
  return map;
}

/** "Volkanovski vs. The Korean Zombie" -> ["volkanovski","the korean zombie"] (raw, rematch digit dropped). */
function mainEventNames(s: string): [string, string] | null {
  const cleaned = s.replace(/\s+(\d+|[IVX]+)\s*$/i, '').trim(); // drop trailing rematch number (2 / II)
  const parts = cleaned.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  const a = norm(parts[0]);
  const b = norm(parts[1]);
  return a && b ? [a, b] : null;
}

type FighterLite = { firstName: string | null; lastName: string | null; nickname: string | null };
type FightLite = {
  orderOnCard: number;
  fighter1: FighterLite | null;
  fighter2: FighterLite | null;
};

/** Does a DB fighter correspond to a Wikipedia name token (surname, first name, or nickname)? */
function fighterMatches(f: FighterLite | null, wikiName: string): boolean {
  if (!f) return false;
  const w = norm(wikiName);
  const wSur = surname(wikiName);
  const ln = surname(f.lastName || '');
  if (ln && ln === wSur) return true;
  const fn = norm(f.firstName || '');
  if (fn && (fn === w || fn.split(' ')[0] === w)) return true; // "Khabib" vs Khabib N.
  const nick = norm(f.nickname || '').replace(/^the\s+/, '');
  const wNoThe = w.replace(/^the\s+/, '');
  if (nick && (nick === wNoThe || nick.includes(wNoThe) || wNoThe.includes(nick))) return true; // "Cowboy", "Korean Zombie"
  return false;
}

function classify(fights: FightLite[], nameA: string, nameB: string) {
  const orders = fights.map(f => f.orderOnCard);
  const min = Math.min(...orders);
  const max = Math.max(...orders);
  if (min === max) return { verdict: 'AMBIGUOUS' as const };

  const matched = fights.find(f =>
    (fighterMatches(f.fighter1, nameA) && fighterMatches(f.fighter2, nameB)) ||
    (fighterMatches(f.fighter1, nameB) && fighterMatches(f.fighter2, nameA)),
  );
  if (!matched) return { verdict: 'NOMATCH' as const };

  if (matched.orderOnCard === max) return { verdict: 'INVERTED' as const, min, max };
  if (matched.orderOnCard === min) return { verdict: 'CORRECT' as const };
  return { verdict: 'AMBIGUOUS' as const };
}

async function main() {
  console.log(`=== Legacy order via Wikipedia (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const wiki = fetchWikiMainEvents();
  console.log(`Wikipedia numbered main-events parsed: ${wiki.size}`);

  const events = await prisma.event.findMany({
    where: {
      scraperType: null,
      eventStatus: 'COMPLETED',
      name: { startsWith: 'UFC ' },
    },
    select: {
      id: true,
      name: true,
      fights: {
        select: {
          orderOnCard: true,
          fighter1: { select: { firstName: true, lastName: true, nickname: true } },
          fighter2: { select: { firstName: true, lastName: true, nickname: true } },
        },
      },
    },
  });

  const counts: Record<string, number> = {};
  const invertedIds: string[] = [];
  const samples: Record<string, string[]> = {};
  const note = (v: string, label: string) => {
    counts[v] = (counts[v] || 0) + 1;
    (samples[v] ||= []).length < 8 && samples[v].push(label);
  };

  for (const e of events) {
    const numMatch = (e.name || '').match(/^UFC\s+(\d+)\b/i);
    if (!numMatch) { note('NOT-NUMBERED', e.name); continue; }
    if ((e.fights as FightLite[]).length < 3) { note('TOO-FEW-FIGHTS', e.name); continue; }
    const n = parseInt(numMatch[1], 10);
    const main = wiki.get(n);
    if (!main) { note('NO-WIKI', e.name); continue; }
    const surnames = mainEventNames(main);
    if (!surnames) { note('UNPARSEABLE-WIKI', `${e.name} :: ${main}`); continue; }

    const r = classify(e.fights as FightLite[], surnames[0], surnames[1]);
    note(r.verdict, `${e.name}  [wiki: ${main}]`);
    if (r.verdict === 'INVERTED') invertedIds.push(e.id);
  }

  console.log('\nClassification:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(18)} ${v}`);
  for (const v of ['INVERTED', 'NOMATCH', 'UNPARSEABLE-WIKI', 'NO-WIKI']) {
    if (samples[v]?.length) {
      console.log(`\n  ${v} samples:`);
      for (const s of samples[v]) console.log(`    - ${s}`);
    }
  }

  console.log(`\nINVERTED (authoritatively confirmed, would flip): ${invertedIds.length}`);
  if (!APPLY) { console.log('\nDry-run. Re-run with --apply to write.'); await prisma.$disconnect(); return; }
  if (!invertedIds.length) { console.log('Nothing to flip.'); await prisma.$disconnect(); return; }

  const affected = await prisma.$executeRaw(Prisma.sql`
    UPDATE "fights" f
    SET "orderOnCard" = b.s - f."orderOnCard"
    FROM (
      SELECT "eventId", MIN("orderOnCard") + MAX("orderOnCard") AS s
      FROM "fights"
      WHERE "eventId" IN (${Prisma.join(invertedIds)})
      GROUP BY "eventId"
    ) b
    WHERE f."eventId" = b."eventId" AND f."eventId" IN (${Prisma.join(invertedIds)})
  `);
  console.log(`\nUpdated ${affected} fight rows across ${invertedIds.length} events.`);

  // Verify: each flipped event's main event must now sit at the MIN order.
  const after = await prisma.event.findMany({
    where: { id: { in: invertedIds } },
    select: {
      id: true, name: true,
      fights: { select: { orderOnCard: true, fighter1: { select: { lastName: true } }, fighter2: { select: { lastName: true } } } },
    },
  });
  let good = 0, bad = 0;
  for (const e of after) {
    const n = parseInt((e.name || '').match(/^UFC\s+(\d+)/i)![1], 10);
    const surnames = mainEventNames(wiki.get(n)!)!;
    const r = classify(e.fights as FightLite[], surnames[0], surnames[1]);
    if (r.verdict === 'CORRECT') good++;
    else { bad++; console.log(`  !! ${e.name} -> ${r.verdict} after flip`); }
  }
  console.log(`\nPost-fix verification: CORRECT=${good}  not-correct=${bad}`);
  console.log(bad === 0 ? '✅ All flipped events now have the main event at order 1.' : '⚠ Investigate the non-correct ones.');

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
