import { Prisma, PrismaClient, Fight } from '@prisma/client';
import { stripDiacritics } from './fighterMatcher';

type AnyPrismaClient = PrismaClient | Prisma.TransactionClient;

/**
 * Opt-in import-time bleed backstop (Layer 2 of the Tapology fight-bleed
 * hardening — see docs/plans/tapology-fight-bleed-hardening-2026-05-26.md).
 *
 * Tapology event pages render related/sidebar bouts that don't belong to the
 * event. Layer 1 (container-scoped extraction in the scrapers) is the primary
 * fix; this is a source-agnostic safety net for if that selector ever regresses.
 *
 * When `crossEventDedup` is set, before CREATING a new fight the helper checks
 * whether the same fighter-pair already exists on a DIFFERENT event of the
 * SAME promotion + scraperType. If it does AND the two events are close in time
 * (the bleed signature — Tapology's widgets duplicate an adjacent event's
 * bouts), the create is SKIPPED and logged loudly rather than writing a phantom
 * duplicate (returns null). Events far apart in time are treated as legitimate
 * rematches and created normally (logged at info level — we never silently drop
 * a possibly-real bout).
 *
 * Only the Tapology-derived parsers pass this option; every other caller uses
 * the no-option overload and is unaffected (return type stays `Fight`).
 */
export interface BleedGuardOptions {
  crossEventDedup: true;
}

/**
 * Opt-in same-event duplicate-fight guard.
 *
 * Some sources (notably ONE Championship's Thai Muay Thai cards) report the
 * SAME fighter under slightly different name forms across scrapes — e.g.
 * JSON-LD gives the canonical "Hern Looksuan" on one run and the display name
 * embeds a camp token, "Hern NF Looksuan", on another. Each distinct
 * firstName/lastName produces a SEPARATE Fighter row, so the order-sensitive
 * Fight unique key (eventId, fighter1Id, fighter2Id) never matches and the
 * daily scrape silently writes a DUPLICATE fight onto a card the live tracker
 * has already advanced. (The ONE FC live tracker already dedups via
 * firstName/lastName token overlap in findFightByFighters — this brings the
 * daily-scrape create path to parity so the two never diverge.)
 *
 * When set, before CREATING a new fight the helper checks the SAME event for a
 * fight whose two fighters' name tokens overlap the scraped pair (in either
 * orientation). If found, that existing fight is UPDATED with the new metadata
 * instead of creating a duplicate — and its fighter rows are deliberately left
 * as-is (the existing fight may already carry live-tracker state we don't want
 * to clobber; the freshly-created canonical Fighter row is simply left
 * fight-less and harmless). Match is scoped to a single event with both
 * fighters required to pair, so a false positive collapsing two real bouts is
 * very unlikely; every collapse is logged.
 */
export interface SameEventNameDedupOptions {
  sameEventNameDedup: true;
}

const normToken = (s: string): string => stripDiacritics(s || '').toLowerCase().trim();

function nameTokens(f: { firstName: string; lastName: string }): Set<string> {
  const tokens = new Set<string>();
  const first = normToken(f.firstName);
  const last = normToken(f.lastName);
  if (first) tokens.add(first);
  if (last) tokens.add(last);
  return tokens;
}

const tokensOverlap = (a: Set<string>, b: Set<string>): boolean =>
  [...a].some((t) => b.has(t));

/**
 * Find an existing fight on the SAME event whose fighters' name tokens overlap
 * the scraped pair (mirrors the ONE FC live tracker's findFightByFighters).
 * Returns the matched fight id, preferring non-CANCELLED rows. Only runs on the
 * create branch, so the extra queries fire only when the exact-id lookup missed.
 */
async function findSameEventNameMatch(
  prisma: AnyPrismaClient,
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
): Promise<string | null> {
  const scraped = await prisma.fighter.findMany({
    where: { id: { in: [fighter1Id, fighter2Id] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const a = scraped.find((f) => f.id === fighter1Id);
  const b = scraped.find((f) => f.id === fighter2Id);
  if (!a || !b) return null;

  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return null;

  const candidates = await prisma.fight.findMany({
    where: {
      eventId,
      // exact-id orderings were already handled by the caller's lookup
      NOT: {
        OR: [
          { fighter1Id, fighter2Id },
          { fighter1Id: fighter2Id, fighter2Id: fighter1Id },
        ],
      },
    },
    select: {
      id: true,
      fightStatus: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
  });

  // Prefer a live/real fight over a CANCELLED duplicate when both would match.
  const ordered = [...candidates].sort(
    (x, y) =>
      (x.fightStatus === 'CANCELLED' ? 1 : 0) - (y.fightStatus === 'CANCELLED' ? 1 : 0),
  );

  for (const fight of ordered) {
    const f1 = nameTokens(fight.fighter1);
    const f2 = nameTokens(fight.fighter2);
    const straight = tokensOverlap(aTokens, f1) && tokensOverlap(bTokens, f2);
    const swapped = tokensOverlap(aTokens, f2) && tokensOverlap(bTokens, f1);
    if (straight || swapped) {
      const lbl = `${a.firstName} ${a.lastName} vs ${b.firstName} ${b.lastName}`.replace(/\s+/g, ' ').trim();
      console.warn(
        `ℹ️  SAME-EVENT-DEDUP: collapsing "${lbl}" onto existing fight ${fight.id} ` +
          `(${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}, ` +
          `${fight.fightStatus}) — name-form drift, not creating a duplicate.`,
      );
      return fight.id;
    }
  }
  return null;
}

// Real boxing/MMA rematches are essentially never this close together. A
// same-pair bout on another same-promotion event within this window is a bleed
// copy of an adjacent event's card, not a rematch. Kept conservative so a rare
// quick-turnaround rematch (>30d) is never auto-dropped.
const BLEED_REMATCH_MIN_DAYS = 30;

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'unknown date';
}

/**
 * @returns true if the create should be SKIPPED (clear bleed), false otherwise.
 * Only runs on the create branch with the guard enabled, and only does extra
 * queries once a same-promotion cross-event duplicate is actually found.
 */
async function isCrossEventBleed(
  prisma: AnyPrismaClient,
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
): Promise<boolean> {
  const thisEvent = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true, promotion: true, date: true, scraperType: true },
  });
  if (!thisEvent) return false;

  const dup = await prisma.fight.findFirst({
    where: {
      eventId: { not: eventId },
      OR: [
        { fighter1Id, fighter2Id },
        { fighter1Id: fighter2Id, fighter2Id: fighter1Id },
      ],
      event: {
        promotion: thisEvent.promotion,
        scraperType: thisEvent.scraperType,
      },
    },
    select: { id: true, event: { select: { name: true, date: true } } },
  });
  if (!dup) return false;

  const otherDate = dup.event?.date ?? null;
  const here = thisEvent.date ?? null;
  let daysApart: number | null = null;
  if (otherDate && here) {
    daysApart = Math.abs(otherDate.getTime() - here.getTime()) / 86_400_000;
  }

  // Resolve fighter names for a readable log (only here, only on a hit).
  const fighters = await prisma.fighter.findMany({
    where: { id: { in: [fighter1Id, fighter2Id] } },
    select: { firstName: true, lastName: true },
  });
  const lbl =
    fighters.length === 2
      ? fighters.map((f) => `${f.firstName} ${f.lastName}`.trim()).join(' vs ')
      : `${fighter1Id} vs ${fighter2Id}`;

  if (daysApart !== null && daysApart <= BLEED_REMATCH_MIN_DAYS) {
    console.error(
      `⚠️  BLEED-GUARD: NOT creating "${lbl}" on "${thisEvent.name}" — same pair already ` +
        `exists on same-promotion event "${dup.event?.name}" (${fmtDate(otherDate)}), only ` +
        `${Math.round(daysApart)}d apart. Tapology fight-bleed signature; skipping the ` +
        `duplicate. If this is a genuine quick-turnaround rematch, add it manually via admin.`,
    );
    return true;
  }

  console.warn(
    `ℹ️  BLEED-GUARD: "${lbl}" also exists on same-promotion event "${dup.event?.name}" ` +
      `(${fmtDate(otherDate)})` +
      (daysApart !== null ? `, ${Math.round(daysApart)}d apart` : ', date unknown') +
      ` — creating anyway (likely a real rematch; review if unexpected).`,
  );
  return false;
}

/**
 * Upsert a fight identified by (eventId, fighter1Id, fighter2Id) in a way
 * that's robust to fighter1/fighter2 ordering swaps between scrapes.
 *
 * The Fight model's unique constraint on (eventId, fighter1Id, fighter2Id)
 * is order-sensitive — Prisma treats (event, A, B) and (event, B, A) as
 * different keys. If a scraper extracts a matchup with the fighters on one
 * side one day and the reverse the next (because the source CMS swapped
 * which fighter it bills first), a direct `prisma.fight.upsert` keyed on
 * that triple won't match the existing row and silently writes a duplicate.
 *
 * This helper finds an existing row in EITHER ordering, updates it (also
 * canonicalizing fighter1Id/fighter2Id to the current scrape's order so
 * subsequent direct-keyed upserts hit cleanly), or creates a new row when
 * neither ordering exists.
 *
 * Caller passes `update` and `create` data shaped exactly as it would for
 * a normal `prisma.fight.upsert` — the helper passes them straight through.
 *
 * Pass `bleedGuard: { crossEventDedup: true }` (Tapology parsers only) to enable
 * the import-time bleed backstop on the create branch — see BleedGuardOptions.
 * With the guard, a create that's detected as a bleed duplicate returns null.
 */
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
): Promise<Fight>;
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
  guard: SameEventNameDedupOptions,
): Promise<Fight>;
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
  guard: BleedGuardOptions,
): Promise<Fight | null>;
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
  guard?: BleedGuardOptions | SameEventNameDedupOptions,
): Promise<Fight | null> {
  const { eventId, fighter1Id, fighter2Id } = identity;

  const existing = await prisma.fight.findFirst({
    where: {
      eventId,
      OR: [
        { fighter1Id, fighter2Id },
        { fighter1Id: fighter2Id, fighter2Id: fighter1Id },
      ],
    },
    select: { id: true, fighter1Id: true },
  });

  if (existing) {
    const needsReorder = existing.fighter1Id !== fighter1Id;
    return prisma.fight.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        ...(needsReorder ? { fighter1Id, fighter2Id } : {}),
      },
    });
  }

  // CREATE branch — run any opt-in dedup backstop before writing a new row.

  // Same-event name-form drift: a different Fighter row for the same person
  // (camp-token / JSON-LD name variance) would otherwise create a duplicate
  // bout. Reuse the matching fight instead. Fighter ids are intentionally NOT
  // re-pointed — the existing fight may carry live-tracker state.
  if ('sameEventNameDedup' in (guard ?? {}) && (guard as SameEventNameDedupOptions).sameEventNameDedup) {
    const matchId = await findSameEventNameMatch(prisma, eventId, fighter1Id, fighter2Id);
    if (matchId) {
      return prisma.fight.update({ where: { id: matchId }, data: updateData });
    }
  }

  if ('crossEventDedup' in (guard ?? {}) && (guard as BleedGuardOptions).crossEventDedup) {
    const isBleed = await isCrossEventBleed(prisma, eventId, fighter1Id, fighter2Id);
    if (isBleed) return null;
  }

  return prisma.fight.create({ data: createData });
}
