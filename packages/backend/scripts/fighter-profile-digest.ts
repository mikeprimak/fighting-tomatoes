/**
 * Compact grounding digest for the in-loop author: per fighter, the DB identity,
 * the record line scraped from Tapology/Sherdog sources (when present), and the
 * top notable fights. Lets the author write grounded profiles without holding the
 * full multi-hundred-KB source dump in context. Throwaway campaign helper.
 *
 * Usage: pnpm exec tsx scripts/fighter-profile-digest.ts tmp/fighter-profile-batch-0-25.json
 */
import * as fs from 'fs';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: fighter-profile-digest.ts <batch.json>'); process.exit(1); }
const batch = JSON.parse(fs.readFileSync(inPath, 'utf8'));

function recordFromSources(sources: any[]): string {
  for (const s of sources) {
    // Tapology: "Pro MMA Record: 30-10-0, 1 NC"
    let m = s.text.match(/Pro MMA Record:\s*([\d]+-[\d]+-[\d]+(?:,\s*\d+\s*NC)?)/i);
    if (m) return `${m[1]} (tapology)`;
    // Sherdog: "Wins 30 ... Losses 10 ... N/C 1"
    m = s.text.match(/Wins\s+(\d+).*?Losses\s+(\d+)/s);
    if (m) return `${m[1]}W-${m[2]}L (sherdog)`;
  }
  return '?';
}

function retiredHint(sources: any[]): string {
  for (const s of sources) {
    if (/\bformer professional mixed martial artist\b/i.test(s.text)) return 'RETIRED(wiki: former)';
    if (/\bannounced (his|her) retirement\b/i.test(s.text)) return 'RETIRED(announced)';
  }
  return '';
}

for (let i = 0; i < batch.fighters.length; i++) {
  const f = batch.fighters[i];
  const id = f.identity;
  console.log(`\n[${String(i).padStart(2, '0')}] ${f.name}  ${id.nickname ? `"${id.nickname}" ` : ''}— ${f.fighterId}`);
  console.log(`  DB: record=${id.record ?? 'null'} wc=${id.weightClass ?? '?'} rank=${id.rank ?? '-'} champ=${id.isChampion} active=${id.isActive} sport=${id.sport}`);
  console.log(`  src-record: ${recordFromSources(f.sources)}  ${retiredHint(f.sources)}`);
  console.log(`  sources: ${f.sources.map((s: any) => s.label).join(', ')}`);
  const top = f.notableFights.slice(0, 8).map((nf: any) => `${nf.result.split(' —')[0]} vs ${nf.opponent}${nf.date ? ` (${nf.date.slice(0, 4)})` : ''}`);
  console.log(`  fights: ${top.join('; ')}`);
}
