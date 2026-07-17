/**
 * OFFICIAL UFC RANKING vs CARD-PLACEMENT RANKING divergence (READ-ONLY).
 * Reads scripts/output/card-placement-rankings.csv (placement score per fighter) and compares
 * to the official UFC rankings (fetched 2026-06-22). Surfaces:
 *   - "over-featured": placed higher on cards than their official rank (UFC betting on them)
 *   - "under-featured": ranked on paper but kept off the marquee
 *   - "unranked but featured": high card placement, not in the official top 15 (prospects/draws)
 */
import * as fs from 'fs';
import * as path from 'path';

// official rankings fetched from ufc.com/rankings 2026-06-22. champ first, then #1..#15.
const OFFICIAL: Record<string, string[]> = {
  FLYWEIGHT: ['Joshua Van','Alexandre Pantoja','Manel Kape','Tatsuro Taira','Brandon Royval','Kyoji Horiguchi',"Lone'er Kavanagh",'Amir Albazi','Asu Almabayev','Brandon Moreno','Steve Erceg','Alex Perez','Tim Elliott','Tagir Ulanbekov','Charles Johnson','Edgar Chairez'],
  BANTAMWEIGHT: ['Petr Yan','Merab Dvalishvili',"Sean O'Malley",'Umar Nurmagomedov','Cory Sandhagen','Song Yadong','Aiemann Zahabi','Mario Bautista','David Martinez','Deiveson Figueiredo','Marlon Vera','Payton Talbott','Vinicius Oliveira','Raul Rosas Jr.','Marcus McGhee'],
  FEATHERWEIGHT: ['Alexander Volkanovski','Movsar Evloev','Diego Lopes','Lerone Murphy','Aljamain Sterling','Yair Rodriguez','Jean Silva','Arnold Allen','Youssef Zalal','Kevin Vallejos','Steve Garcia','Brian Ortega','Aaron Pico','Melquizael Costa','David Onama','Josh Emmett'],
  LIGHTWEIGHT: ['Justin Gaethje','Ilia Topuria','Arman Tsarukyan','Charles Oliveira','Max Holloway','Benoit Saint Denis','Paddy Pimblett','Mauricio Ruffy','Mateusz Gamrot','Dan Hooker','Renato Moicano','Rafael Fiziev','Quillan Salkilld','Beneil Dariush','Tom Nolan','Manuel Torres'],
  WELTERWEIGHT: ['Islam Makhachev','Ian Machado Garry','Carlos Prates','Michael Morales','Jack Della Maddalena','Gabriel Bonfim','Sean Brady','Belal Muhammad','Leon Edwards','Kamaru Usman','Joaquin Buckley','Yaroslav Amosov','Mike Malott','Michael Venom Page','Uros Medic','Daniel Rodriguez'],
  MIDDLEWEIGHT: ['Sean Strickland','Khamzat Chimaev','Dricus Du Plessis','Nassourdine Imavov','Brendan Allen','Caio Borralho','Anthony Hernandez','Joe Pyfer','Reinier de Ridder','Israel Adesanya','Robert Whittaker','Jared Cannonier','Gregory Rodrigues','Christian Leroy Duncan','Roman Dolidze','Bo Nickal'],
  LIGHT_HEAVYWEIGHT: ['Carlos Ulberg','Magomed Ankalaev','Alex Pereira','Jiri Prochazka','Jan Blachowicz','Khalil Rountree Jr.','Jamahal Hill','Paulo Costa','Azamat Murzakanov','Volkan Oezdemir','Bogdan Guskov','Dominick Reyes','Nikita Krylov','Johnny Walker','Aleksandar Rakic','Alonzo Menifield'],
  HEAVYWEIGHT: ['Tom Aspinall','Ciryl Gane','Alexander Volkov','Sergei Pavlovich','Josh Hokit','Waldo Cortes Acosta','Serghei Spivac','Curtis Blaydes','Rizvan Kuniev','Tyrell Fortune','Ante Delija','Derrick Lewis','Marcin Tybura','Valter Walker','Brando Pericic','Mick Parkin'],
  WOMENS_STRAWWEIGHT: ['Mackenzie Dern','Zhang Weili','Tatiana Suarez','Virna Jandiroba','Yan Xiaonan','Gillian Robertson','Loopy Godinez','Amanda Lemos','Tabatha Ricci','Jessica Andrade','Amanda Ribas','Fatima Kline','Angela Hill','Denise Gomes','Alexia Thainara','Mizuki'],
  WOMENS_FLYWEIGHT: ['Valentina Shevchenko','Natalia Silva','Manon Fiorot','Alexa Grasso','Erin Blanchfield','Rose Namajunas','Maycee Barber','Jasmine Jasudavicius','Tracy Cortez','Miranda Maverick','Karine Silva',"Casey O'Neill",'Wang Cong','Eduarda Moura','JJ Aldrich','Gabriella Fernandes'],
  WOMENS_BANTAMWEIGHT: ['Kayla Harrison','Julianna Pena','Raquel Pennington','Joselyne Edwards','Norma Dumont','Ailin Perez','Irene Aldana','Yana Santos','Karol Rosa','Macy Chiasson','Jacqueline Cavalcanti','Luana Santos','Nora Cornolle','Bia Mesquita','Michelle Montague','Miesha Tate'],
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.'’]/g, '').trim();
const lastTok = (s: string) => norm(s).split(/\s+/).pop()!;
const firstTok = (s: string) => norm(s).split(/\s+/)[0];

// read placement CSV
const csv = fs.readFileSync(path.join(__dirname, 'output', 'card-placement-rankings.csv'), 'utf8').trim().split('\n').slice(1);
type P = { div: string; name: string; score: number; rank: number };
const placement: P[] = csv.map(line => {
  const m = line.match(/^([^,]+),(\d+),"([^"]+)",([\d.]+)/)!;
  return { div: m[1], name: m[3], score: parseFloat(m[4]), rank: parseInt(m[2]) };
});
const byDiv = new Map<string, P[]>();
for (const p of placement) { if (!byDiv.has(p.div)) byDiv.set(p.div, []); byDiv.get(p.div)!.push(p); }

function match(div: string, official: string): P | null {
  const pool = byDiv.get(div) || [];
  const exact = pool.find(p => norm(p.name) === norm(official));
  if (exact) return exact;
  const lt = lastTok(official);
  const byLast = pool.filter(p => lastTok(p.name) === lt);
  if (byLast.length === 1) return byLast[0];
  if (byLast.length > 1) return byLast.find(p => firstTok(p.name) === firstTok(official)) || null;
  return null;
}

type Div = { div: string; rows: { official: number; name: string; score: number; pPlaceRank: number }[]; unmatched: string[] };
const results: Div[] = [];
for (const [div, names] of Object.entries(OFFICIAL)) {
  const rows: Div['rows'] = []; const unmatched: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const p = match(div, names[i]);
    if (!p) { unmatched.push(names[i]); continue; }
    rows.push({ official: i, name: names[i], score: p.score, pPlaceRank: 0 });
  }
  // re-rank the matched official fighters by placement score
  [...rows].sort((a, b) => b.score - a.score).forEach((r, idx) => { r.pPlaceRank = idx; });
  results.push({ div, rows, unmatched });
}

// over/under featured across all divisions
type Flag = { div: string; name: string; official: number; pRank: number; div2: number; score: number };
const overs: Flag[] = [], unders: Flag[] = [];
for (const d of results) for (const r of d.rows) {
  const diff = r.official - r.pPlaceRank; // + = placed better than ranked (over-featured)
  const f = { div: d.div, name: r.name, official: r.official, pRank: r.pPlaceRank, div2: diff, score: r.score };
  if (diff >= 3) overs.push(f);
  if (diff <= -3) unders.push(f);
}
const lab = (n: number) => n === 0 ? 'C' : `#${n}`;

console.log('OFFICIAL RANK vs CARD-PLACEMENT RANK — divergence\n(placement rank = re-rank of each division\'s official top-16 by card placement)\n');
console.log('═══ OVER-FEATURED: placed higher on cards than their official rank ═══');
overs.sort((a, b) => b.div2 - a.div2).forEach(f => console.log(`  ${f.name.padEnd(24)} ${f.div.replace(/_/g,' ').padEnd(20)} official ${lab(f.official).padStart(3)} → card #${f.pRank + 1}  (score ${f.score.toFixed(0)})`));
console.log('\n═══ UNDER-FEATURED: ranked on paper, kept off the marquee ═══');
unders.sort((a, b) => a.div2 - b.div2).forEach(f => console.log(`  ${f.name.padEnd(24)} ${f.div.replace(/_/g,' ').padEnd(20)} official ${lab(f.official).padStart(3)} → card #${f.pRank + 1}  (score ${f.score.toFixed(0)})`));

// unranked-but-featured: placement fighters NOT in official top-16, with score beating the
// lowest-scoring officially-ranked fighter in their division.
console.log('\n═══ UNRANKED BUT FEATURED: high card placement, not in official top 15 ═══');
for (const [div, names] of Object.entries(OFFICIAL)) {
  const officialNorm = new Set(names.map(norm));
  const officialLast = new Set(names.map(lastTok));
  const pool = (byDiv.get(div) || []);
  const rankedScores = names.map(n => match(div, n)).filter(Boolean).map(p => p!.score);
  if (!rankedScores.length) continue;
  const minRanked = Math.min(...rankedScores);
  const hits = pool.filter(p => !officialNorm.has(norm(p.name)) && !officialLast.has(lastTok(p.name)) && p.score > minRanked)
    .sort((a, b) => b.score - a.score);
  if (hits.length) console.log(`  ${div.replace(/_/g,' ')}: ${hits.map(h => `${h.name} (${h.score.toFixed(0)})`).join(', ')}`);
}

const totalUnmatched = results.flatMap(d => d.unmatched);
console.log(`\n[match coverage] unmatched official fighters (${totalUnmatched.length}): ${totalUnmatched.join(', ')}`);
