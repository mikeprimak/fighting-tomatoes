/** Read card-placement-rankings.csv → emit article-ready markdown ranking lists per division. */
import * as fs from 'fs';
import * as path from 'path';

const DIV_ORDER = ['HEAVYWEIGHT','LIGHT_HEAVYWEIGHT','MIDDLEWEIGHT','WELTERWEIGHT','LIGHTWEIGHT','FEATHERWEIGHT','BANTAMWEIGHT','FLYWEIGHT','WOMENS_BANTAMWEIGHT','WOMENS_FLYWEIGHT','WOMENS_STRAWWEIGHT'];
const LABEL: Record<string, string> = {
  HEAVYWEIGHT: 'Heavyweight', LIGHT_HEAVYWEIGHT: 'Light Heavyweight', MIDDLEWEIGHT: 'Middleweight',
  WELTERWEIGHT: 'Welterweight', LIGHTWEIGHT: 'Lightweight', FEATHERWEIGHT: 'Featherweight',
  BANTAMWEIGHT: 'Bantamweight', FLYWEIGHT: 'Flyweight', WOMENS_BANTAMWEIGHT: "Women's Bantamweight",
  WOMENS_FLYWEIGHT: "Women's Flyweight", WOMENS_STRAWWEIGHT: "Women's Strawweight",
};

// args: [inputCsv] [outputMd]  (default to the v1 score files)
const inCsv = process.argv[2] || path.join(__dirname, 'output', 'card-placement-rankings.csv');
const outMd = process.argv[3] || path.join(__dirname, 'output', 'rankings-md.md');
const lines0 = fs.readFileSync(inCsv, 'utf8').trim().split('\n');
const isPosition = /avgCardSlot/.test(lines0[0]); // header tells us the metric
const csv = lines0.slice(1);
type R = { div: string; rank: number; name: string; score: number; inf: boolean };
const rows: R[] = csv.map(l => {
  const m = l.match(/^([^,]+),(\d+),"([^"]+)",([\d.]+),\d+,[\d-]+,(\w+)/)!;
  return { div: m[1], rank: +m[2], name: m[3], score: +m[4], inf: m[5] === 'yes' };
});
const byDiv = new Map<string, R[]>();
for (const r of rows) { if (!byDiv.has(r.div)) byDiv.set(r.div, []); byDiv.get(r.div)!.push(r); }

const out: string[] = [];
for (const div of DIV_ORDER) {
  const list = (byDiv.get(div) || []).sort((a, b) => a.rank - b.rank);
  if (!list.length) continue;
  out.push(`### ${LABEL[div]} (${list.length} ranked)\n`);
  for (const r of list) out.push(`${r.rank}. ${r.name}${r.inf ? ' \\*' : ''}: **${r.score.toFixed(isPosition ? 2 : 1)}**`);
  out.push('');
}
fs.writeFileSync(outMd, out.join('\n'));
console.log(`wrote ${path.basename(outMd)} (${isPosition ? 'avg card slot' : 'score'}), divisions:`, [...byDiv.keys()].length, 'fighters:', rows.length);
