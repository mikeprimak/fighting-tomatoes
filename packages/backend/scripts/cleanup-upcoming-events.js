/**
 * Cleanup for reported upcoming event issues (Apr 11 2026 session).
 *
 * 1. Cancels bleed-through fights injected into Tapology-scraped events by the
 *    old (page-wide) fighter-link query. The scrapers are now fixed to use
 *    scoped <li> iteration, so once the daily cron runs again only the real
 *    fights will be kept UPCOMING.
 * 2. Cancels the stale `Jason Nolf vs Marcus Blaze` row on RAF 08 (escaped the
 *    RAF parser's cancellation because both Blaze brothers share a last name).
 * 3. Clears bannerImage on events where it points to someone else's Tapology
 *    poster or a stale R2 copy, so the next scrape re-uploads fresh.
 *
 * Run with:
 *   node scripts/cleanup-upcoming-events.js            # dry run
 *   node scripts/cleanup-upcoming-events.js --apply    # actually apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// ============================================================================
// Per-event "keep" lists: pairs of substrings (both must appear in the combined
// fight name "firstName1 lastName1 firstName2 lastName2", lowercased). This is
// more forgiving than lastName-only matching since some fighters have multi-
// word last names (e.g. "Bo Mi Re Shin", "Jesus Santos").
// ============================================================================

const EVENT_CLEANUPS = [
  {
    eventId: '566bdf8b-e5ed-4e8a-9234-f565e8e8908c', // Baumgardner vs. Shin: MVPW 02 (Apr 18, MVP)
    keep: [
      ['baumgardner', 'shin'],
      ['shadasia', 'daniels'],
      ['thibeault', 'santos'],
      ['dejesus', 'adaway'],
      ['vargas', "o'rourke"],
      ['rosado', 'delgado'],
      ['natalie dove', 'santizo'],
      ['jahmal', 'medina'],
      ['raquel', 'araujo'],
      ['walton', 'ruvalcaba'],
    ],
  },
  {
    eventId: 'ea6c3c0b-e273-4bb0-8cfc-215b6d87a716', // Davis vs. Albright II (May 16, TOP_RANK)
    keep: [
      ['keyshawn', 'albright'],
    ],
  },
  {
    eventId: '8a9ead55-657b-4175-845b-b63829f46581', // MVP MMA 1: Rousey vs. Carano (May 16, MVP)
    keep: [
      ['rousey', 'carano'],
      ['ngannou', 'lins'],
      ['nate diaz', 'perry'],
      ['larkin', 'jackson'],
      ['parnasse', 'cross'],
      ['dos santos', 'despaigne'],
      ['mokaev', 'moraes'],
      ['fazil', 'babian'],
      ['mgoyan', 'morales'],
      ['aline', 'masson-wong'],
      ['avila', 'jenkins'],
    ],
  },
  {
    eventId: '79655c08-ba05-49d0-a85f-efbb719781b8', // Usyk vs. Rico (May 23, Gold Star)
    keep: [
      ['usyk', 'verhoeven'],
      ['sheeraz', 'begic'],
      ['giyasov', 'catterall'],
      ['sanchez', 'torrez'],
      ['hiruta', 'soliman'],
      ['mamdouh', 'talley'],
      ['bivol', 'eifert'],
    ],
  },
  {
    eventId: '0ab9a03f-53d1-4343-8a17-9a570b888420', // Foster vs. Ford (May 30, TOP_RANK)
    keep: [
      ['foster', 'ford'],
    ],
  },
  {
    eventId: '89b8c5c8-42ee-4208-89c0-c5e3211c2563', // Han vs. Holm II: MVPW 03 (May 30, MVP)
    keep: [
      ['stephanie han', 'holm'],
      ['serrano', 'hanson'],
      ['juarez', 'valle'],
      ['robinson', 'spencer'],
    ],
  },
  {
    eventId: 'adf72728-7404-48d9-a614-4577c1e24c5c', // Zuffa Boxing 6: Mosley Jr. vs. Bohachuk (May 10)
    keep: [
      ['mosley', 'bohachuk'],
      ['misael', 'katzourakis'],
      ['julian rodriguez', 'perella'],
    ],
  },
];

// ============================================================================
// Explicit fight IDs to cancel (identified individually, don't need keep-list)
// ============================================================================

const EXTRA_CANCELS = [
  // Jason Nolf vs Marcus Blaze on RAF 08 — live page only has Nolf vs Joey Blaze
  '061700f7-2fa4-44a3-8fec-fd63abd09cdb',
];

// ============================================================================
// Banner images to clear so the next scrape can re-upload fresh
// ============================================================================

const CLEAR_BANNERS = [
  '566bdf8b-e5ed-4e8a-9234-f565e8e8908c', // Baumgardner/Shin — bannerImage points to poster 135520 (wrong event id)
  '8a9ead55-657b-4175-845b-b63829f46581', // MVP MMA 1 Rousey/Carano — same wrong poster 135520
  '89b8c5c8-42ee-4208-89c0-c5e3211c2563', // Han/Holm II — same wrong poster 135520
  'ea6c3c0b-e273-4bb0-8cfc-215b6d87a716', // Davis vs. Albright II
  '0ab9a03f-53d1-4343-8a17-9a570b888420', // Foster vs. Ford
];

// ============================================================================

function buildFightText(fighter1, fighter2) {
  return `${fighter1.firstName || ''} ${fighter1.lastName || ''} ${fighter2.firstName || ''} ${fighter2.lastName || ''}`.toLowerCase();
}

function matchesAnyKeepPair(fightText, keepPairs) {
  return keepPairs.some(([a, b]) => fightText.includes(a) && fightText.includes(b));
}

async function main() {
  console.log(`\n${APPLY ? '🚨 APPLYING' : '🔍 DRY RUN'} — upcoming-event cleanup\n`);

  let totalCancelled = 0;

  for (const { eventId, keep } of EVENT_CLEANUPS) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        fights: {
          select: {
            id: true,
            orderOnCard: true,
            fightStatus: true,
            fighter1: { select: { firstName: true, lastName: true } },
            fighter2: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!event) {
      console.log(`⚠ Event ${eventId} not found — skipping`);
      continue;
    }

    console.log(`\n📋 ${event.name} (${eventId})`);
    const toCancel = [];
    const toKeep = [];
    const toUncancel = [];

    for (const f of event.fights) {
      if (f.fightStatus === 'COMPLETED') continue;
      const fightText = buildFightText(f.fighter1, f.fighter2);
      const fullName = `${f.fighter1.firstName || ''} ${f.fighter1.lastName || ''} vs ${f.fighter2.firstName || ''} ${f.fighter2.lastName || ''}`.trim();
      const isReal = matchesAnyKeepPair(fightText, keep);

      if (f.fightStatus === 'CANCELLED') {
        if (isReal) {
          toUncancel.push({ id: f.id, text: fullName });
        }
        continue; // leave bleed-through cancelled rows alone
      }

      if (isReal) {
        toKeep.push({ id: f.id, text: fullName });
      } else {
        toCancel.push({ id: f.id, text: fullName });
      }
    }

    console.log(`  ✅ KEEP (${toKeep.length}):`);
    toKeep.forEach(f => console.log(`     - ${f.text}`));
    console.log(`  ♻ UNCANCEL (${toUncancel.length}):`);
    toUncancel.forEach(f => console.log(`     - ${f.text}`));
    console.log(`  ❌ CANCEL (${toCancel.length}):`);
    toCancel.forEach(f => console.log(`     - ${f.text}`));

    if (APPLY && toCancel.length > 0) {
      const ids = toCancel.map(f => f.id);
      const result = await prisma.fight.updateMany({
        where: { id: { in: ids } },
        data: { fightStatus: 'CANCELLED' },
      });
      console.log(`  → cancelled ${result.count} fights`);
      totalCancelled += result.count;
    }
    if (APPLY && toUncancel.length > 0) {
      const ids = toUncancel.map(f => f.id);
      const result = await prisma.fight.updateMany({
        where: { id: { in: ids } },
        data: { fightStatus: 'UPCOMING' },
      });
      console.log(`  → un-cancelled ${result.count} fights`);
    }
  }

  // Extra individual cancellations
  if (EXTRA_CANCELS.length > 0) {
    console.log(`\n📋 Extra individual cancellations (${EXTRA_CANCELS.length}):`);
    for (const id of EXTRA_CANCELS) {
      const fight = await prisma.fight.findUnique({
        where: { id },
        select: {
          id: true,
          fightStatus: true,
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } },
        },
      });
      if (!fight) {
        console.log(`  ⚠ ${id} not found`);
        continue;
      }
      const txt = `${fight.fighter1.firstName} ${fight.fighter1.lastName} vs ${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
      console.log(`  ❌ ${txt} (${fight.fightStatus})`);
      if (APPLY && fight.fightStatus !== 'CANCELLED') {
        await prisma.fight.update({
          where: { id },
          data: { fightStatus: 'CANCELLED' },
        });
        totalCancelled++;
      }
    }
  }

  // Banner image clearing
  if (CLEAR_BANNERS.length > 0) {
    console.log(`\n🖼️  Banner clears (${CLEAR_BANNERS.length}):`);
    for (const id of CLEAR_BANNERS) {
      const event = await prisma.event.findUnique({
        where: { id },
        select: { id: true, name: true, bannerImage: true },
      });
      if (!event) continue;
      console.log(`  - ${event.name}`);
      console.log(`      was: ${event.bannerImage || '(null)'}`);
      if (APPLY) {
        await prisma.event.update({
          where: { id },
          data: { bannerImage: null },
        });
      }
    }
  }

  console.log(`\n${APPLY ? '✅ Applied' : '🔍 Dry run complete'} — ${totalCancelled} fights ${APPLY ? 'cancelled' : 'would be cancelled'}`);
  console.log(APPLY ? '' : '\nRun with --apply to make changes.\n');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
