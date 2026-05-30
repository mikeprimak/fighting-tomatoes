/**
 * Audit fighter headshot URLs for dead (404/error) links.
 * Phase 1 (default):  scope — count fighters by profileImage host.
 * Phase 2 (--probe):  HTTP-probe every URL, report dead ones grouped by host.
 *                     Writes dead list to prisma/dead-fighter-images.json.
 *
 * Run: pnpm tsx prisma/audit-fighter-images.ts [--probe] [--limit=N] [--host=substr]
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();
const PROBE = process.argv.includes('--probe');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const hostArg = process.argv.find((a) => a.startsWith('--host='));
const HOST_FILTER = hostArg ? hostArg.split('=')[1] : undefined;

const CONCURRENCY = 12;
const TIMEOUT_MS = 12000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable)';
  }
}

async function probe(url: string): Promise<{ ok: boolean; status: number | string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Some CDNs reject HEAD; use GET but we don't read the body.
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, status: e?.name === 'AbortError' ? 'timeout' : (e?.message ?? 'error') };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: { profileImage: { not: null } },
    select: { id: true, firstName: true, lastName: true, profileImage: true },
    orderBy: { lastName: 'asc' },
  });

  let rows = fighters.filter((f) => /^https?:\/\//i.test(f.profileImage!));
  // Skip our own R2 bucket on probe runs — we wrote it, it's live by construction.
  if (PROBE && !HOST_FILTER) rows = rows.filter((f) => !hostOf(f.profileImage!).includes('r2.dev'));
  if (HOST_FILTER) rows = rows.filter((f) => hostOf(f.profileImage!).includes(HOST_FILTER));
  if (LIMIT) rows = rows.slice(0, LIMIT);

  // Host distribution
  const byHost = new Map<string, number>();
  for (const f of rows) byHost.set(hostOf(f.profileImage!), (byHost.get(hostOf(f.profileImage!)) ?? 0) + 1);

  console.log(`Fighters with http(s) profileImage: ${rows.length}${HOST_FILTER ? ` (host~="${HOST_FILTER}")` : ''}`);
  console.log('\nBy host:');
  for (const [host, n] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${host}`);
  }

  if (!PROBE) {
    console.log('\nScope only. Re-run with --probe to HTTP-check each URL (optionally --host=<substr> to narrow).');
    return;
  }

  console.log(`\nProbing ${rows.length} URLs (concurrency ${CONCURRENCY})...`);
  const dead: { id: string; name: string; url: string; status: number | string }[] = [];
  let done = 0;
  let i = 0;

  async function worker() {
    while (i < rows.length) {
      const f = rows[i++];
      const { ok, status } = await probe(f.profileImage!);
      done++;
      if (!ok) {
        dead.push({ id: f.id, name: `${f.firstName} ${f.lastName}`, url: f.profileImage!, status });
      }
      if (done % 100 === 0) console.log(`  ...${done}/${rows.length} (${dead.length} dead so far)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Group dead by host + status
  const deadByHost = new Map<string, number>();
  for (const d of dead) deadByHost.set(hostOf(d.url), (deadByHost.get(hostOf(d.url)) ?? 0) + 1);

  console.log(`\n=== DEAD: ${dead.length} / ${rows.length} ===`);
  console.log('Dead by host:');
  for (const [host, n] of [...deadByHost.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${host}`);
  }

  const outPath = `${__dirname}/dead-fighter-images.json`;
  writeFileSync(outPath, JSON.stringify(dead, null, 2));
  console.log(`\nWrote ${dead.length} dead records to ${outPath}`);
  console.log('Sample:');
  for (const d of dead.slice(0, 15)) console.log(`  [${d.status}] ${d.name} — ${d.url}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
