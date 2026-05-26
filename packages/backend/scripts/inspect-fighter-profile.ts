/**
 * QA tool: fetch bio sources + run the LLM extractor for one or more fighters and
 * dump the full generated profile + summary to stdout. Does NOT write to the DB.
 *
 * Lets us eyeball profile quality (and the whyFansLove / whyFansHate framing)
 * before committing to a backfill. Mirrors the spirit of the fight enrich-dump tool.
 *
 * Usage:
 *   pnpm exec tsx scripts/inspect-fighter-profile.ts "Conor McGregor" "Max Holloway"
 *   pnpm exec tsx scripts/inspect-fighter-profile.ts --id <fighterId>
 */

import { PrismaClient } from '@prisma/client';
import { launchPreviewBrowser, closePreviewBrowser } from '../src/services/aiEnrichment/fetchUFCEventPreview';
import { fetchFighterBio } from '../src/services/aiEnrichment/fighterProfile/fetchFighterBio';
import { extractFighterProfile } from '../src/services/aiEnrichment/fighterProfile/extractFighterProfile';

async function resolveFighters(prisma: PrismaClient, args: string[]) {
  const ids: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') { ids.push(args[++i]); continue; }
    names.push(args[i]);
  }
  const out: any[] = [];
  for (const id of ids) {
    const f = await prisma.fighter.findUnique({ where: { id } });
    if (f) out.push(f);
  }
  for (const name of names) {
    const [first, ...rest] = name.split(' ');
    const last = rest.join(' ');
    const f = await prisma.fighter.findFirst({ where: { firstName: first, lastName: last } });
    if (f) out.push(f);
    else console.error(`! no fighter matched "${name}"`);
  }
  return out;
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: inspect-fighter-profile.ts "First Last" [...] | --id <id>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const fighters = await resolveFighters(prisma, args);
  if (fighters.length === 0) { console.error('no fighters resolved'); process.exit(1); }

  const needsBrowser = fighters.some((f) => f.ufcAthleteSlug);
  const handle = needsBrowser ? await launchPreviewBrowser() : undefined;

  try {
    for (const f of fighters) {
      const name = `${f.firstName} ${f.lastName}`.trim();
      console.log('\n' + '='.repeat(78));
      console.log(`${name}  (${f.wins}-${f.losses}-${f.draws}${f.noContests ? ` ${f.noContests}NC` : ''})  slug=${f.ufcAthleteSlug ?? '-'}`);
      console.log('='.repeat(78));

      const bio = await fetchFighterBio(
        { firstName: f.firstName, lastName: f.lastName, nickname: f.nickname, ufcAthleteSlug: f.ufcAthleteSlug, sport: f.sport },
        { browser: f.ufcAthleteSlug ? handle?.browser : undefined },
      );
      console.log('sources:', bio.attempted.map((a) => `${a.label}=${a.ok ? a.chars : 'FAIL'}`).join('  '));
      if (bio.sources.length === 0) { console.log('  -> no sources, would skip'); continue; }

      const res = await extractFighterProfile({
        identity: {
          fighterId: f.id, firstName: f.firstName, lastName: f.lastName, nickname: f.nickname,
          record: (f.wins + f.losses + f.draws + f.noContests > 0) ? `${f.wins}-${f.losses}-${f.draws}` : null,
          weightClass: f.weightClass, rank: f.rank,
          isChampion: f.isChampion, championshipTitle: f.championshipTitle, sport: f.sport, isActive: f.isActive,
        },
        notableFights: [],
        sources: bio.sources,
      });

      if (!res.record) { console.log('  -> no parseable profile'); continue; }
      console.log(`confidence: ${res.record.confidence}`);
      console.log(JSON.stringify(res.record.profile, null, 2));
      console.log('\n--- SUMMARY ---\n' + res.record.summary);
    }
  } finally {
    if (handle) await closePreviewBrowser(handle);
    await prisma.$disconnect();
  }
})();
