#!/usr/bin/env node
/**
 * Render the main-event odds-movement graph as a self-contained SVG.
 *
 * Reads an odds-history JSON (see src/content/odds/<event>.json) and emits a
 * dark-theme line chart of each fighter's IMPLIED WIN PROBABILITY over time,
 * to packages/web/public/blog/<eventSlug>-odds-graph.svg.
 *
 * The SVG is referenced from the blog post as a plain <img>, so it must be fully
 * self-contained (no external fonts/CSS). Re-run by the daily updater whenever a
 * new snapshot lands. No external deps.
 *
 * Usage: node render-odds-graph.mjs [path/to/event.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = path.resolve(__dirname, '../..'); // packages/web

/** American moneyline -> implied win probability (percent, 0..100). */
export function impliedProbPct(american) {
  const a = Number(american);
  const frac = a > 0 ? 100 / (a + 100) : -a / (-a + 100);
  return frac * 100;
}

/** Format an American line with explicit sign (e.g. +250, -400). */
function fmtLine(american) {
  const a = Number(american);
  return a > 0 ? `+${a}` : `${a}`;
}

/** "2026-05-16" -> "May 16" */
function fmtShortDate(iso) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${months[m - 1]} ${d}`;
}

function dayNumber(iso) {
  // Days since epoch (UTC), stable and timezone-free for spacing the x-axis.
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function render(data) {
  const W = 760;
  const H = 440;
  const pad = { top: 64, right: 132, bottom: 56, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const snaps = [...data.snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const a = data.mainEvent.fighterA; // McGregor (key matches snapshot field)
  const b = data.mainEvent.fighterB; // Holloway

  const xs = snaps.map((s) => dayNumber(s.date));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(1, xMax - xMin);

  // Y axis fixed 0..100% so the favorite/underdog gap reads honestly.
  const yMin = 0;
  const yMax = 100;

  const xPos = (iso) => pad.left + ((dayNumber(iso) - xMin) / xSpan) * plotW;
  const yPos = (pct) => pad.top + (1 - (pct - yMin) / (yMax - yMin)) * plotH;

  const series = [
    { f: a, vals: snaps.map((s) => ({ iso: s.date, line: s[a.key], pct: impliedProbPct(s[a.key]) })) },
    { f: b, vals: snaps.map((s) => ({ iso: s.date, line: s[b.key], pct: impliedProbPct(s[b.key]) })) },
  ];

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" role="img" aria-label="UFC 329 main event odds movement: implied win probability for ${esc(a.name)} and ${esc(b.name)} over time.">`,
  );
  // Background
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="#0b0d10"/>`);
  // Title
  parts.push(
    `<text x="${pad.left}" y="30" fill="#f5f5f5" font-size="19" font-weight="700">How the ${esc(data.event)} main event odds have moved</text>`,
  );
  parts.push(
    `<text x="${pad.left}" y="50" fill="#9aa3ad" font-size="12.5">Implied win probability from the moneyline. Updated through ${esc(fmtShortDate(snaps[snaps.length - 1].date))}.</text>`,
  );

  // Horizontal gridlines + y labels (every 25%)
  for (let p = 0; p <= 100; p += 25) {
    const y = yPos(p);
    parts.push(
      `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + plotW}" y2="${y.toFixed(1)}" stroke="#1c2127" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" fill="#6b7480" font-size="11" text-anchor="end">${p}%</text>`,
    );
  }

  // X labels (each snapshot date), thinned if crowded.
  const maxLabels = 8;
  const step = Math.ceil(snaps.length / maxLabels);
  snaps.forEach((s, i) => {
    if (i % step !== 0 && i !== snaps.length - 1) return;
    const x = xPos(s.date);
    parts.push(
      `<text x="${x.toFixed(1)}" y="${H - pad.bottom + 20}" fill="#6b7480" font-size="11" text-anchor="middle">${esc(fmtShortDate(s.date))}</text>`,
    );
  });

  // Series lines + points + end labels
  for (const { f, vals } of series) {
    const pts = vals.map((v) => `${xPos(v.iso).toFixed(1)},${yPos(v.pct).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline points="${pts}" fill="none" stroke="${f.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
    vals.forEach((v) => {
      parts.push(
        `<circle cx="${xPos(v.iso).toFixed(1)}" cy="${yPos(v.pct).toFixed(1)}" r="3.2" fill="#0b0d10" stroke="${f.color}" stroke-width="2"/>`,
      );
    });
    const last = vals[vals.length - 1];
    const lx = xPos(last.iso);
    const ly = yPos(last.pct);
    parts.push(
      `<text x="${(lx + 10).toFixed(1)}" y="${(ly - 4).toFixed(1)}" fill="${f.color}" font-size="13" font-weight="700">${esc(f.shortName)}</text>`,
    );
    parts.push(
      `<text x="${(lx + 10).toFixed(1)}" y="${(ly + 12).toFixed(1)}" fill="#9aa3ad" font-size="11.5">${last.pct.toFixed(0)}% (${esc(fmtLine(last.line))})</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** Render `data` to public/blog/<eventSlug>-odds-graph.svg. Returns the path. */
export function writeGraph(data) {
  const svg = render(data);
  const outDir = path.join(WEB_ROOT, 'public/blog');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${data.eventSlug}-odds-graph.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');
  return outPath;
}

// Run directly (CLI): node render-odds-graph.mjs [path/to/event.json]
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const dataPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(WEB_ROOT, 'src/content/odds/ufc-329.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const outPath = writeGraph(data);
  console.log(`Wrote ${outPath} (${data.snapshots.length} snapshots)`);
}
