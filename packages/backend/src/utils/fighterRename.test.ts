/**
 * Unit test for the rename-fork guard (`fighterRename.ts`).
 *
 * Calibrated on the REAL cases from the RAF Georgia 2026-07-10 scrape, where
 * three source-site renames forked duplicate Fighter+Fight rows (stranding
 * hype predictions and re-firing booked pushes) while two genuine opponent
 * changes on the same card must keep creating new fights.
 *
 * Run from packages/backend:
 *   npx tsx src/utils/fighterRename.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import * as assert from 'assert';
import { isLikelyRenamedFighter, normalizeFullName, resolveRenamedOpponent, resolveRenamedPair } from './fighterRename';

let failures = 0;
async function check(desc: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${desc}`);
    console.error(`    ${(err as Error).message}`);
  }
}

function makeStubPrisma(opts: { existingUnderNewName: boolean }) {
  const updates: Array<{ id: string; data: unknown }> = [];
  const stub = {
    fight: {
      findMany: async () => [
        {
          id: 'fight-old',
          fighter1Id: 'tsarukyan-id',
          fighter1: { id: 'tsarukyan-id', firstName: 'Arman', lastName: 'Tsarukyan' },
          fighter2: { id: 'khamitov-old-id', firstName: '', lastName: 'Khamitov' },
        },
      ],
    },
    fighter: {
      findFirst: async () =>
        opts.existingUnderNewName ? { id: 'khamitov-fork-id' } : null,
      update: async (args: { where: { id: string }; data: unknown }) => {
        updates.push({ id: args.where.id, data: args.data });
        return {};
      },
    },
  };
  return { stub, updates };
}

async function main(): Promise<void> {
  console.log('isLikelyRenamedFighter — renames (must detect):');

  await check('mononym gaining a first name (Khamitov → Kuat Khamitov)', () => {
    assert.strictEqual(isLikelyRenamedFighter('Khamitov', 'Kuat Khamitov'), true);
    assert.strictEqual(isLikelyRenamedFighter('Kuat Khamitov', 'Khamitov'), true); // symmetric
  });

  await check('whole-name respelling (Elnazar Akhmataliev → Ernazar Akmataliev)', () => {
    assert.strictEqual(isLikelyRenamedFighter('Elnazar Akhmataliev', 'Ernazar Akmataliev'), true);
  });

  await check('last-name respelling (Razambek Jamalov → Razambek Zhamalov)', () => {
    assert.strictEqual(isLikelyRenamedFighter('Razambek Jamalov', 'Razambek Zhamalov'), true);
  });

  await check('identical and diacritic-variant names', () => {
    assert.strictEqual(isLikelyRenamedFighter('Jiří Procházka', 'Jiri Prochazka'), true);
    assert.strictEqual(isLikelyRenamedFighter('Arman Tsarukyan', 'Arman Tsarukyan'), true);
  });

  console.log('isLikelyRenamedFighter — genuine opponent changes (must reject):');

  await check('different person sharing a last name (Vinesh Phogat vs Sangeeta Phogat)', () => {
    assert.strictEqual(isLikelyRenamedFighter('Vinesh Phogat', 'Sangeeta Phogat'), false);
  });

  await check('completely different replacement (Real Woods vs Brock Hardy)', () => {
    assert.strictEqual(isLikelyRenamedFighter('Real Woods', 'Brock Hardy'), false);
  });

  await check('empty input is safe', () => {
    assert.strictEqual(isLikelyRenamedFighter('', 'Kuat Khamitov'), false);
    assert.strictEqual(isLikelyRenamedFighter('Khamitov', ''), false);
  });

  console.log('normalizeFullName:');

  await check('strips diacritics + punctuation, collapses whitespace', () => {
    assert.strictEqual(normalizeFullName("  Jiří   O'Malley-Smith "), 'jiri omalleysmith');
  });

  console.log('resolveRenamedOpponent — 2026-07-10 incident replay (stub prisma):');

  await check('renames the existing opponent row in place and returns its id', async () => {
    const { stub, updates } = makeStubPrisma({ existingUnderNewName: false });
    const resolved = await resolveRenamedOpponent(stub as never, {
      eventId: 'raf-georgia',
      anchorFighterId: 'tsarukyan-id',
      scrapedOpponentName: 'Kuat Khamitov',
      scrapedEventNames: new Set([normalizeFullName('Arman Tsarukyan'), normalizeFullName('Kuat Khamitov')]),
    });
    assert.strictEqual(resolved, 'khamitov-old-id');
    assert.deepStrictEqual(updates, [
      { id: 'khamitov-old-id', data: { firstName: 'Kuat', lastName: 'Khamitov' } },
    ]);
  });

  await check('reuses a pre-existing fork row instead of violating the name unique', async () => {
    const { stub, updates } = makeStubPrisma({ existingUnderNewName: true });
    const resolved = await resolveRenamedOpponent(stub as never, {
      eventId: 'raf-georgia',
      anchorFighterId: 'tsarukyan-id',
      scrapedOpponentName: 'Kuat Khamitov',
      scrapedEventNames: new Set([normalizeFullName('Arman Tsarukyan'), normalizeFullName('Kuat Khamitov')]),
    });
    assert.strictEqual(resolved, 'khamitov-fork-id');
    assert.strictEqual(updates.length, 0);
  });

  await check('does NOT rename on a genuine opponent change (Phogat swap)', async () => {
    const { stub, updates } = makeStubPrisma({ existingUnderNewName: false });
    stub.fight.findMany = async () => [
      {
        id: 'fight-old',
        fighter1Id: 'nichita-id',
        fighter1: { id: 'nichita-id', firstName: 'Anastasia', lastName: 'Nichita' },
        fighter2: { id: 'vinesh-id', firstName: 'Vinesh', lastName: 'Phogat' },
      },
    ];
    const resolved = await resolveRenamedOpponent(stub as never, {
      eventId: 'raf-georgia',
      anchorFighterId: 'nichita-id',
      scrapedOpponentName: 'Sangeeta Phogat',
      scrapedEventNames: new Set([normalizeFullName('Anastasia Nichita'), normalizeFullName('Sangeeta Phogat')]),
    });
    assert.strictEqual(resolved, null);
    assert.strictEqual(updates.length, 0);
  });

  await check('does NOT rename when the old opponent is still on the card under the old name', async () => {
    const { stub, updates } = makeStubPrisma({ existingUnderNewName: false });
    const resolved = await resolveRenamedOpponent(stub as never, {
      eventId: 'raf-georgia',
      anchorFighterId: 'tsarukyan-id',
      scrapedOpponentName: 'Kuat Khamitov',
      // old name "Khamitov" still appears in the scrape → different person
      scrapedEventNames: new Set([
        normalizeFullName('Arman Tsarukyan'),
        normalizeFullName('Kuat Khamitov'),
        normalizeFullName('Khamitov'),
      ]),
    });
    assert.strictEqual(resolved, null);
    assert.strictEqual(updates.length, 0);
  });

  console.log('resolveRenamedPair — parser-facing wrapper:');

  await check('no-ops when both sides resolved (no DB touch)', async () => {
    const pair = await resolveRenamedPair({} as never, {
      eventId: 'raf-georgia',
      fighter1Id: 'a-id',
      fighter2Id: 'b-id',
      scrapedName1: 'Fighter A',
      scrapedName2: 'Fighter B',
      scrapedEventNames: new Set<string>(),
    });
    assert.deepStrictEqual(pair, { fighter1Id: 'a-id', fighter2Id: 'b-id' });
  });

  await check('no-ops when neither side resolved', async () => {
    const pair = await resolveRenamedPair({} as never, {
      eventId: 'raf-georgia',
      fighter1Id: undefined,
      fighter2Id: undefined,
      scrapedName1: 'Fighter A',
      scrapedName2: 'Fighter B',
      scrapedEventNames: new Set<string>(),
    });
    assert.deepStrictEqual(pair, { fighter1Id: undefined, fighter2Id: undefined });
  });

  await check('fills the unresolved side from the rename guard', async () => {
    const { stub, updates } = makeStubPrisma({ existingUnderNewName: false });
    const pair = await resolveRenamedPair(stub as never, {
      eventId: 'raf-georgia',
      fighter1Id: 'tsarukyan-id',
      fighter2Id: undefined,
      scrapedName1: 'Arman Tsarukyan',
      scrapedName2: 'Kuat Khamitov',
      scrapedEventNames: new Set([normalizeFullName('Arman Tsarukyan'), normalizeFullName('Kuat Khamitov')]),
    });
    assert.deepStrictEqual(pair, { fighter1Id: 'tsarukyan-id', fighter2Id: 'khamitov-old-id' });
    assert.strictEqual(updates.length, 1);
  });

  await check('skips excluded anchors (TBA placeholder)', async () => {
    const pair = await resolveRenamedPair({} as never, {
      eventId: 'raf-georgia',
      fighter1Id: 'tba-fighter-global',
      fighter2Id: undefined,
      scrapedName1: 'TBA',
      scrapedName2: 'Kuat Khamitov',
      scrapedEventNames: new Set([normalizeFullName('Kuat Khamitov')]),
      excludeFighterIds: new Set(['tba-fighter-global']),
    });
    assert.deepStrictEqual(pair, { fighter1Id: 'tba-fighter-global', fighter2Id: undefined });
  });

  await check('never throws — a guard failure falls back to the unchanged pair', async () => {
    const throwingStub = { fight: { findMany: async () => { throw new Error('db down'); } } };
    const pair = await resolveRenamedPair(throwingStub as never, {
      eventId: 'raf-georgia',
      fighter1Id: 'tsarukyan-id',
      fighter2Id: undefined,
      scrapedName1: 'Arman Tsarukyan',
      scrapedName2: 'Kuat Khamitov',
      scrapedEventNames: new Set([normalizeFullName('Kuat Khamitov')]),
    });
    assert.deepStrictEqual(pair, { fighter1Id: 'tsarukyan-id', fighter2Id: undefined });
  });

  if (failures > 0) {
    console.error(`\n${failures} assertion group(s) FAILED`);
    process.exit(1);
  }
  console.log('\nAll rename-guard tests passed ✅');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
