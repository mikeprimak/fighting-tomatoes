/**
 * Split a fighter-profile-dump batch file into one file per fighter under
 * tmp/src/, so the in-loop author can read a few at a time. Also prints a
 * manifest (index, fighterId, name, sources). Throwaway campaign helper.
 *
 * Usage: pnpm exec tsx scripts/fighter-profile-split.ts tmp/fighter-profile-batch-0-25.json
 */
import * as fs from 'fs';
import * as path from 'path';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: fighter-profile-split.ts <batch.json>'); process.exit(1); }

const batch = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const dir = path.join('tmp', 'src');
fs.mkdirSync(dir, { recursive: true });

batch.fighters.forEach((f: any, i: number) => {
  const slug = `${f.identity.lastName || f.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const n = String(i).padStart(2, '0');
  const file = path.join(dir, `${n}-${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(f, null, 2));
  console.log(`${n}\t${f.fighterId}\t${f.name}\t[${f.sources.map((s: any) => s.label).join(', ')}]`);
});
console.error(`\nWrote ${batch.fighters.length} files to ${dir}/`);
