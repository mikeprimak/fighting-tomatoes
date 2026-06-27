/**
 * EVERGREEN GENERATOR for the card-placement article.
 *
 *   npx tsx scripts/card-placement/generate-article.ts [--asof YYYY-MM-DD] [--check]
 *
 * Regenerates the data-driven blocks of
 *   packages/web/src/content/posts/2026-06-24-ufc-card-placement-rankings.md
 * that are wrapped in <!-- AUTO:KEY:start --> / <!-- AUTO:KEY:end --> fences
 * (P4P boards, division boards + banners, charts, all-time main events), rebuilds
 * the social banner PNG, and writes:
 *   - scripts/card-placement/snapshot.json     (data snapshot, for next run's diff)
 *   - scripts/card-placement/CHANGES.md         (human change report + prose flags)
 *   - scripts/card-placement/suggested.md       (REVIEW blocks: career avg / climbs /
 *                                                per-year headliners — NOT auto-applied;
 *                                                legacy-order fragility needs human eyes)
 *
 * --check exits non-zero if anything changed (for CI / "is it stale?" probes) and
 * writes nothing to the article. The default run rewrites the article in place.
 *
 * READ-ONLY against the DB.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  compute, fmtBanner, fmtList, DIV_LABEL, ComputeResult, FighterRow,
} from './compute';

const ROOT = path.resolve(__dirname, '../../../..');
const ARTICLE = path.join(ROOT, 'packages/web/src/content/posts/2026-06-24-ufc-card-placement-rankings.md');
const HERE = __dirname;
const SNAP = path.join(HERE, 'snapshot.json');
const CHANGES = path.join(HERE, 'CHANGES.md');
const SUGGESTED = path.join(HERE, 'suggested.md');
const BANNER_PY = path.join(HERE, 'banner.py');
const BANNER_OUT = path.join(ROOT, 'packages/web/public/blog/card-placement-thumb.png');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const ASOF = argv.includes('--asof') ? new Date(argv[argv.indexOf('--asof') + 1]) : new Date();

// ---------- HTML emitters (must match the published block structure) ----------

function banner(f: FighterRow | undefined, subtitle: string): string {
  if (!f) return '';
  const img = f.profileImage
    ? `<img src="${f.profileImage}" alt="${f.name}" width="72" height="72" loading="lazy" style="width:72px;height:72px;border-radius:12px;object-fit:cover;background:#262626;flex:none;" />`
    : `<div style="width:72px;height:72px;border-radius:12px;background:#262626;flex:none;"></div>`;
  return `<div style="display:flex;align-items:center;gap:14px;margin:14px 0 22px;padding:14px 16px;border:1px solid #2b2b2b;border-radius:14px;background:linear-gradient(135deg,#1b1b1b,#0f0f0f);">${img}<div style="min-width:0;"><div style="font-size:18px;font-weight:700;color:#fff;line-height:1.25;">${f.name}</div><div style="font-size:13px;color:#9aa0a6;">${subtitle}</div></div></div>`;
}

function p4pList(rows: FighterRow[]): string {
  return rows.map((f, i) => `${i + 1}. ${f.name}: **${fmtList(f.avg)}**`).join('\n');
}

const MAX_PER_BOARD = 16;

function divisionsBlock(r: ComputeResult): string {
  const out: string[] = [];
  for (const [wc, b] of r.byDiv) {
    const label = DIV_LABEL[wc];
    const col = (heading: string, list: FighterRow[]) => {
      const lead = list[0];
      const bn = banner(lead, `Avg. card placement ${lead ? fmtBanner(lead.avg) : '—'}`);
      const items = list.slice(0, MAX_PER_BOARD)
        .map(f => `<li>${f.name}: <strong>${fmtList(f.avg)}</strong></li>`).join('\n');
      const body = list.length
        ? `${bn}\n<ol>\n${items}\n</ol>`
        : `<p style="color:#9aa0a6;">No active fighters on this board right now.</p>`;
      return `<div class="division-col">\n<h3>${heading}</h3>\n${body}\n</div>`;
    };
    out.push(
      `<div class="division-title">${label}</div>\n` +
      `<div class="division-cols">\n` +
      col('Big Event Fighters', b.bigcard) + '\n' +
      col('Fight Night Fighters', b.fightnight) + '\n' +
      `</div>`,
    );
  }
  return out.join('\n\n');
}

function chartBlock(r: ComputeResult): string {
  const bars = (rows: { short: string; count: number }[], max: number) =>
    rows.map(c =>
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;"><span style="font-size:12px;font-weight:700;color:#9aa0a6;margin-bottom:5px;">${c.count}</span><span style="width:100%;background:#F5C518;border-radius:3px 3px 0 0;height:${max ? Math.round(c.count / max * 90) : 0}%;"></span></div>`,
    ).join('\n');
  const labels = (rows: { short: string }[]) =>
    rows.map(c => `<span style="flex:1;text-align:center;font-size:11px;color:#cbd2d9;">${c.short}</span>`).join('\n');
  const maxMen = Math.max(...r.chartMen.map(c => c.count), 1);
  const maxWomen = Math.max(...r.chartWomen.map(c => c.count), 1);
  return [
    `<div style="margin:18px 0 10px;">`,
    `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0a6;font-weight:700;margin-bottom:16px;">Big Card fighters by division (men)</div>`,
    `<div style="display:flex;align-items:flex-end;gap:8px;height:180px;border-bottom:2px solid #2b2b2b;">`,
    bars(r.chartMen, maxMen),
    `</div>`,
    `<div style="display:flex;gap:8px;margin-top:7px;">`,
    labels(r.chartMen),
    `</div>`,
    `</div>`,
    ``,
    `<div style="margin:14px 0 24px;max-width:300px;">`,
    `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0a6;font-weight:700;margin-bottom:16px;">Women</div>`,
    `<div style="display:flex;align-items:flex-end;gap:8px;height:120px;border-bottom:2px solid #2b2b2b;">`,
    bars(r.chartWomen, maxWomen),
    `</div>`,
    `<div style="display:flex;gap:8px;margin-top:7px;">`,
    labels(r.chartWomen),
    `</div>`,
    `</div>`,
  ].join('\n');
}

function alltimeMainsBlock(r: ComputeResult): string {
  return r.allTime.mostMains.map((m, i) => {
    const note = m.ppvMains === m.mains ? ' (every one a numbered card)' : '';
    return `${i + 1}. ${m.name}: ${m.mains}${note}`;
  }).join('\n');
}

// ---------- splicer ----------

function splice(article: string, key: string, content: string): { out: string; changed: boolean } {
  const re = new RegExp(`(<!-- AUTO:${key}:start[^>]*-->)[\\s\\S]*?(<!-- AUTO:${key}:end -->)`);
  if (!re.test(article)) throw new Error(`fence not found: AUTO:${key}`);
  const replacement = `$1\n\n${content}\n\n$2`;
  const out = article.replace(re, replacement);
  // detect change by comparing the captured inner region
  const before = article.match(re)![0];
  const after = out.match(re)![0];
  return { out, changed: before !== after };
}

// ---------- banner ----------

function rebuildBanner(r: ComputeResult, prevTop5: string[] | null): boolean {
  const top5 = r.p4pBig.slice(0, 5).map(f => f.name);
  if (prevTop5 && JSON.stringify(prevTop5) === JSON.stringify(top5)) {
    console.log('  banner: top-5 unchanged, keeping existing image');
    return false;
  }
  if (!fs.existsSync(BANNER_PY)) {
    console.warn(`! banner.py missing at ${BANNER_PY} — skipping banner rebuild`);
    return false;
  }
  try {
    execFileSync('python', [BANNER_PY, '--names', top5.join('|'), '--out', BANNER_OUT], {
      cwd: HERE, stdio: 'inherit',
    });
    return true;
  } catch (e) {
    console.warn(`! banner rebuild failed: ${(e as Error).message}`);
    return false;
  }
}

// ---------- snapshot + change report ----------

type Snapshot = {
  asof: string;
  p4pBig: { name: string; avg: number }[];
  p4pNight: { name: string; avg: number }[];
  divisions: Record<string, { bigLeader: string | null; nightLeader: string | null; big: number; night: number }>;
  chartMen: { short: string; count: number }[];
  chartWomen: { short: string; count: number }[];
  alltimeMains: { name: string; mains: number }[];
  careerAvg: { name: string; avg: number }[];
  climbs: { name: string; from: number; to: number }[];
  headliners: { year: number; fighters: { name: string; count: number }[] }[];
  perfect1Big: string[];
  perfect1Night: string[];
};

function toSnapshot(r: ComputeResult): Snapshot {
  const divisions: Snapshot['divisions'] = {};
  for (const [wc, b] of r.byDiv) {
    divisions[wc] = {
      bigLeader: b.bigcard[0]?.name ?? null,
      nightLeader: b.fightnight[0]?.name ?? null,
      big: b.bigcard.length, night: b.fightnight.length,
    };
  }
  return {
    asof: r.asof,
    p4pBig: r.p4pBig.map(f => ({ name: f.name, avg: f.avg })),
    p4pNight: r.p4pNight.map(f => ({ name: f.name, avg: f.avg })),
    divisions,
    chartMen: r.chartMen.map(c => ({ short: c.short, count: c.count })),
    chartWomen: r.chartWomen.map(c => ({ short: c.short, count: c.count })),
    alltimeMains: r.allTime.mostMains.map(m => ({ name: m.name, mains: m.mains })),
    careerAvg: r.allTime.careerAvg,
    climbs: r.allTime.climbs,
    headliners: r.allTime.headlinersByYear,
    perfect1Big: r.p4pBig.filter(f => f.avg === 1).map(f => f.name),
    perfect1Night: r.p4pNight.filter(f => f.avg === 1).map(f => f.name),
  };
}

function changeReport(prev: Snapshot | null, cur: Snapshot, r: ComputeResult, missingImages: string[]): string {
  const L: string[] = [];
  L.push(`# Card-placement article — change report`);
  L.push(``);
  L.push(`Generated as of **${cur.asof}**${prev ? ` (previous run: ${prev.asof})` : ' (no previous snapshot — first run)'}.`);
  L.push(``);

  if (!prev) {
    L.push(`First run: snapshot established, no diff to show. Review the article render before publishing.`);
  } else {
    // P4P leader / membership
    const diffList = (label: string, a: { name: string; avg: number }[], b: { name: string; avg: number }[]) => {
      const an = a.map(x => x.name), bn = b.map(x => x.name);
      const added = bn.filter(n => !an.includes(n));
      const dropped = an.filter(n => !bn.includes(n));
      if (a[0]?.name !== b[0]?.name) L.push(`- **${label} leader changed:** ${a[0]?.name ?? '—'} → ${b[0]?.name ?? '—'}`);
      if (added.length) L.push(`- ${label} added: ${added.join(', ')}`);
      if (dropped.length) L.push(`- ${label} dropped: ${dropped.join(', ')}`);
    };
    L.push(`## Pound-for-pound boards`);
    diffList('Big Card P4P', prev.p4pBig, cur.p4pBig);
    diffList('Fight Night P4P', prev.p4pNight, cur.p4pNight);
    if (L[L.length - 1] === `## Pound-for-pound boards`) L.push(`- No changes.`);

    L.push(``);
    L.push(`## Division leaders`);
    let divChanged = false;
    for (const wc of Object.keys(cur.divisions)) {
      const p = prev.divisions[wc], c = cur.divisions[wc];
      if (!p) { L.push(`- ${DIV_LABEL[wc]}: NEW division on the board`); divChanged = true; continue; }
      if (p.bigLeader !== c.bigLeader) { L.push(`- ${DIV_LABEL[wc]} Big Event leader: ${p.bigLeader} → ${c.bigLeader}`); divChanged = true; }
      if (p.nightLeader !== c.nightLeader) { L.push(`- ${DIV_LABEL[wc]} Fight Night leader: ${p.nightLeader} → ${c.nightLeader}`); divChanged = true; }
    }
    if (!divChanged) L.push(`- No leader changes.`);

    L.push(``);
    L.push(`## Chart counts (Big Card fighters per division)`);
    const chartDiff = (a: { short: string; count: number }[], b: { short: string; count: number }[]) =>
      b.map(c => { const pc = a.find(x => x.short === c.short)?.count; return pc !== c.count ? `${c.short} ${pc}→${c.count}` : null; }).filter(Boolean);
    const cm = chartDiff(prev.chartMen, cur.chartMen), cw = chartDiff(prev.chartWomen, cur.chartWomen);
    L.push((cm.length || cw.length) ? `- ${[...cm, ...cw].join(', ')}` : `- No changes.`);
  }

  // Prose flags (claims in human-owned copy that depend on regenerated data)
  L.push(``);
  L.push(`## Prose to verify (claims tied to the data)`);
  const flags: string[] = [];
  const nBig1 = cur.perfect1Big.length;
  flags.push(`"A few notes" says **Eight fighters average a perfect 1.0** — current count is **${nBig1}** (${cur.perfect1Big.join(', ')}). ${nBig1 === 8 ? 'OK.' : '⚠ UPDATE the sentence.'}`);
  const lead = r.p4pBig[0]?.name;
  flags.push(`"...so [Ilia Topuria], out most recently, leads." — current Big Card P4P leader is **${lead}**. ${lead === 'Ilia Topuria' ? 'OK.' : '⚠ UPDATE the name/link.'}`);
  const fn1 = cur.perfect1Night.join(', ');
  flags.push(`Fight Night story names **Manel Kape, Gilbert Burns, Israel Adesanya** at a perfect 1.0 — current 1.0 FN fighters: **${fn1 || 'none'}**. ${cur.perfect1Night.length === 3 && ['Manel Kape', 'Gilbert Burns', 'Israel Adesanya'].every(n => cur.perfect1Night.includes(n)) ? 'OK.' : '⚠ UPDATE the names.'}`);
  flags.forEach(f => L.push(`- ${f}`));

  // Missing headshots
  if (missingImages.length) {
    L.push(``);
    L.push(`## Banners missing a headshot (rendered as grey block — add a profileImage or hotlink)`);
    missingImages.forEach(n => L.push(`- ${n}`));
  }

  // REVIEW blocks (not auto-applied)
  L.push(``);
  L.push(`## REVIEW blocks — NOT auto-applied (see suggested.md)`);
  L.push(`These lean on legacy event-order recovery and were hand-curated. The generator’s current output is in **suggested.md**; copy in only what you’ve verified.`);
  if (prev) {
    const careerSame = JSON.stringify(prev.careerAvg) === JSON.stringify(cur.careerAvg);
    const climbsSame = JSON.stringify(prev.climbs) === JSON.stringify(cur.climbs);
    const headSame = JSON.stringify(prev.headliners) === JSON.stringify(cur.headliners);
    L.push(`- Career averages: ${careerSame ? 'unchanged' : '⚠ changed'}`);
    L.push(`- Career climbs: ${climbsSame ? 'unchanged' : '⚠ changed'}`);
    L.push(`- Per-year headliners: ${headSame ? 'unchanged' : '⚠ changed'}`);
  }
  L.push(``);
  return L.join('\n');
}

function suggestedBlocks(r: ComputeResult): string {
  const L: string[] = [];
  L.push(`# Suggested REVIEW blocks (verify before pasting into the article)`);
  L.push(`Generated ${r.asof}. These are NOT auto-applied — legacy event-order recovery can produce false positives in older years.`);
  L.push(``);
  L.push(`## Highest Average Placement Across a Career`);
  r.allTime.careerAvg.forEach((m, i) => L.push(`${i + 1}. ${m.name}: **${m.avg.toFixed(1)}**`));
  L.push(``);
  L.push(`## Steepest career climbs (first third → last third)`);
  r.allTime.climbs.forEach(m => L.push(`- ${m.name}: ${m.from.toFixed(1)} to ${m.to.toFixed(1)}`));
  L.push(``);
  L.push(`## Historical Card Headliners (numbered cards only, count = events headlined that year)`);
  for (const y of r.allTime.headlinersByYear) {
    const flag = y.year <= 2020 ? '  ⚠ verify (legacy order)' : '';
    L.push(``);
    L.push(`**${y.year}**${flag}`);
    L.push(``);
    y.fighters.forEach((f, i) => L.push(`${i + 1}. ${f.name} — ${f.count}`));
  }
  L.push(``);
  return L.join('\n');
}

// ---------- main ----------

async function main() {
  const r = await compute(ASOF);

  // collect missing-headshot banners (P4P leaders + division leaders)
  const missing = new Set<string>();
  const noteMissing = (f?: FighterRow) => { if (f && !f.profileImage) missing.add(f.name); };
  noteMissing(r.p4pBig[0]); noteMissing(r.p4pNight[0]);
  for (const b of r.byDiv.values()) { noteMissing(b.bigcard[0]); noteMissing(b.fightnight[0]); }

  let article = fs.readFileSync(ARTICLE, 'utf8').replace(/\r\n/g, '\n');
  const blocks: Record<string, string> = {
    'p4p-bigcard': p4pList(r.p4pBig),
    'p4p-fightnight': p4pList(r.p4pNight),
    'chart': chartBlock(r),
    'divisions': divisionsBlock(r),
    'alltime-mains': alltimeMainsBlock(r),
  };
  let anyChanged = false;
  for (const [key, content] of Object.entries(blocks)) {
    const { out, changed } = splice(article, key, content);
    article = out;
    if (changed) { anyChanged = true; console.log(`  block ${key}: ${CHECK ? 'WOULD CHANGE' : 'updated'}`); }
    else console.log(`  block ${key}: unchanged`);
  }

  const cur = toSnapshot(r);
  const prev: Snapshot | null = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : null;

  if (CHECK) {
    console.log(anyChanged ? '\nSTALE — article blocks would change.' : '\nUP TO DATE.');
    process.exit(anyChanged ? 1 : 0);
  }

  fs.writeFileSync(ARTICLE, article);
  fs.writeFileSync(SNAP, JSON.stringify(cur, null, 2));
  fs.writeFileSync(CHANGES, changeReport(prev, cur, r, [...missing]));
  fs.writeFileSync(SUGGESTED, suggestedBlocks(r));
  const prevTop5 = prev ? prev.p4pBig.slice(0, 5).map(f => f.name) : null;
  const bannerOk = rebuildBanner(r, prevTop5);

  console.log(`\nArticle blocks rewritten. Banner: ${bannerOk ? 'rebuilt' : 'skipped'}.`);
  console.log(`Reports: ${path.relative(ROOT, CHANGES)} , ${path.relative(ROOT, SUGGESTED)}`);
  if (missing.size) console.log(`! ${missing.size} banner(s) missing a headshot — see CHANGES.md`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
