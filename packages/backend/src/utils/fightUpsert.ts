import { Prisma, PrismaClient, Fight } from '@prisma/client';

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
  bleedGuard: BleedGuardOptions,
): Promise<Fight | null>;
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
  bleedGuard?: BleedGuardOptions,
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

  // CREATE branch — run the opt-in bleed backstop before writing a new row.
  if (bleedGuard?.crossEventDedup) {
    const isBleed = await isCrossEventBleed(prisma, eventId, fighter1Id, fighter2Id);
    if (isBleed) return null;
  }

  return prisma.fight.create({ data: createData });
}
