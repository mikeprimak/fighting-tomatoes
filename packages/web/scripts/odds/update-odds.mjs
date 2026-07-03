#!/usr/bin/env node
/**
 * Daily odds updater for the UFC 329 main-event graph.
 *
 * Flow:
 *   1. Read the odds-history JSON.
 *   2. No-op if the event is over (past eventDate + 1 day).
 *   3. Fetch current main-event odds from The Odds API (free tier, h2h/MMA).
 *      Consensus = median implied probability across books -> representative line.
 *   4. Append/replace today's snapshot (one point per date).
 *   5. Regenerate the SVG graph.
 *   6. Rewrite the article's <!--ODDS-SNAPSHOT--> block + `updated:` frontmatter.
 *
 * Honesty: if the API key is missing or the fetch fails, we DO NOT invent a
 * data point. We log and exit 0 so the daily job is a harmless no-op that day.
 *
 * Env:
 *   ODDS_API_KEY  - The Odds API key (https://the-odds-api.com, free tier).
 *
 * Usage: node update-odds.mjs [path/to/event.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeGraph, impliedProbPct } from './render-odds-graph.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..'); // packages/web
const POSTS_DIR = path.join(WEB_ROOT, 'src/content/posts');

const dataPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(WEB_ROOT, 'src/content/odds/ufc-329.json');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function todayISO() {
  // UTC date stamp, stable across CI runners.
  return new Date().toISOString().slice(0, 10);
}

function fmtLongDate(iso) {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

function fmtMonth(iso) {
  const [, m] = iso.split('-').map((n) => parseInt(n, 10));
  return MONTHS_LONG[m - 1];
}

function fmtLine(american) {
  const a = Math.round(Number(american));
  return a > 0 ? `+${a}` : `${a}`;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Implied probability fraction (0..1) -> representative American line. */
function probToAmerican(prob) {
  if (prob >= 0.5) return -Math.round((prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

function lastName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Fetch consensus American odds for the main event from The Odds API.
 * Returns { [keyA]: american, [keyB]: american } or null on any failure.
 */
async function fetchConsensus(data) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log('[odds] ODDS_API_KEY not set - skipping fetch (no point appended).');
    return null;
  }
  const a = data.mainEvent.fighterA;
  const b = data.mainEvent.fighterB;
  const url =
    `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/` +
    `?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[odds] API responded ${res.status} - skipping fetch.`);
      return null;
    }
    const events = await res.json();
    const lnA = lastName(a.name);
    const lnB = lastName(b.name);
    const ev = events.find((e) => {
      const blob = `${e.home_team} ${e.away_team}`.toLowerCase();
      return blob.includes(lnA) && blob.includes(lnB);
    });
    if (!ev) {
      console.log('[odds] Main-event bout not found in API feed yet - skipping.');
      return null;
    }
    const probsA = [];
    const probsB = [];
    for (const bk of ev.bookmakers || []) {
      const h2h = (bk.markets || []).find((m) => m.key === 'h2h');
      if (!h2h) continue;
      for (const o of h2h.outcomes || []) {
        const ln = lastName(o.name);
        if (ln === lnA) probsA.push(impliedProbPct(o.price) / 100);
        else if (ln === lnB) probsB.push(impliedProbPct(o.price) / 100);
      }
    }
    if (!probsA.length || !probsB.length) {
      console.log('[odds] No h2h prices parsed - skipping.');
      return null;
    }
    const out = {};
    out[a.key] = probToAmerican(median(probsA));
    out[b.key] = probToAmerican(median(probsB));
    console.log(`[odds] Consensus from ${ev.bookmakers.length} books: ${a.shortName} ${fmtLine(out[a.key])}, ${b.shortName} ${fmtLine(out[b.key])}`);
    return out;
  } catch (err) {
    console.log(`[odds] Fetch failed (${err.message}) - skipping.`);
    return null;
  }
}

/** Insert or replace today's snapshot. Returns true if the data changed. */
function upsertSnapshot(data, today, consensus) {
  const a = data.mainEvent.fighterA;
  const b = data.mainEvent.fighterB;
  const snap = { date: today, source: 'The Odds API (US consensus median)' };
  snap[a.key] = consensus[a.key];
  snap[b.key] = consensus[b.key];

  const idx = data.snapshots.findIndex((s) => s.date === today);
  if (idx >= 0) {
    const prev = JSON.stringify(data.snapshots[idx]);
    data.snapshots[idx] = snap;
    return prev !== JSON.stringify(snap);
  }
  data.snapshots.push(snap);
  data.snapshots.sort((s1, s2) => (s1.date < s2.date ? -1 : 1));
  return true;
}

/**
 * Every post slug this odds data feeds. Supports a `postSlugs` array (preferred)
 * and falls back to the legacy single `postSlug`. Any post that embeds the
 * <!--ODDS-SNAPSHOT--> markers + the graph gets kept in sync.
 */
function articleSlugs(data) {
  const slugs = Array.isArray(data.postSlugs) ? data.postSlugs : [];
  if (data.postSlug && !slugs.includes(data.postSlug)) slugs.unshift(data.postSlug);
  return slugs.filter(Boolean);
}

/** Rewrite the snapshot block + `updated:` frontmatter for every linked post. */
function updateArticles(data) {
  if (!fs.existsSync(POSTS_DIR)) return;
  for (const slug of articleSlugs(data)) updateArticle(data, slug);
}

/** Rewrite a single post's snapshot block + `updated:` frontmatter from latest data. */
function updateArticle(data, slug) {
  const file = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .find((f) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
      const m = raw.match(/^slug:\s*["']?([^"'\n]+)["']?\s*$/m);
      return m && m[1].trim() === slug;
    });
  if (!file) {
    console.log(`[odds] Post for slug ${slug} not found - skipping article update.`);
    return;
  }
  const fp = path.join(POSTS_DIR, file);
  let raw = fs.readFileSync(fp, 'utf8');

  const snaps = [...data.snapshots].sort((s1, s2) => (s1.date < s2.date ? -1 : 1));
  const latest = snaps[snaps.length - 1];
  const first = snaps[0];
  const a = data.mainEvent.fighterA;
  const b = data.mainEvent.fighterB;

  const probA = impliedProbPct(latest[a.key]);
  const probB = impliedProbPct(latest[b.key]);
  const favIsB = probB >= probA;
  const fav = favIsB ? b : a;
  const dog = favIsB ? a : b;
  const favProb = favIsB ? probB : probA;
  const dogProb = favIsB ? probA : probB;
  const favLine = latest[fav.key];
  const dogLine = latest[dog.key];

  // Honest open-vs-now comparison (no invented narrative direction).
  const favProbOpen = impliedProbPct(first[fav.key]);
  const drift =
    favProb > favProbOpen + 1
      ? `${fav.shortName} has firmed as the favorite since the line opened in ${fmtMonth(first.date)}.`
      : favProb < favProbOpen - 1
        ? `${dog.shortName} has gained ground since the line opened in ${fmtMonth(first.date)}.`
        : `The line has held fairly steady since it opened in ${fmtMonth(first.date)}.`;

  const sentence =
    `As of ${fmtLongDate(latest.date)}, ${fav.name} is the favorite at around ${fmtLine(favLine)}, ` +
    `roughly a ${favProb.toFixed(0)}% implied chance, and ${dog.name} is the underdog at about ${fmtLine(dogLine)}, ` +
    `roughly ${dogProb.toFixed(0)}%. ${drift}`;

  const block = `<!--ODDS-SNAPSHOT-->\n${sentence}\n<!--/ODDS-SNAPSHOT-->`;
  const blockRe = /<!--ODDS-SNAPSHOT-->[\s\S]*?<!--\/ODDS-SNAPSHOT-->/;
  if (blockRe.test(raw)) {
    raw = raw.replace(blockRe, block);
  } else {
    console.log('[odds] Snapshot markers not found in post - leaving body unchanged.');
  }

  // Bump `updated:` frontmatter.
  raw = raw.replace(/^updated:\s*["']?[^"'\n]*["']?\s*$/m, `updated: "${latest.date}"`);

  fs.writeFileSync(fp, raw, 'utf8');
  console.log(`[odds] Updated article ${file}`);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const today = todayISO();
  // No-op once the event is over (event day + 1 grace day).
  const cutoff = new Date(`${data.eventDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  if (new Date(`${today}T00:00:00Z`) > cutoff) {
    console.log(`[odds] ${data.event} is over (>${data.eventDate}). No-op.`);
    return;
  }

  const consensus = await fetchConsensus(data);
  if (!consensus) {
    console.log('[odds] No new consensus - regenerating graph from existing data only.');
    writeGraph(data); // keep SVG in sync even if no new point
    return;
  }

  const changed = upsertSnapshot(data, today, consensus);
  if (!changed) {
    console.log('[odds] Today already recorded with identical values. No-op.');
    return;
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const svgPath = writeGraph(data);
  updateArticles(data);
  console.log(`[odds] Done. Snapshot for ${today} written. Graph: ${path.basename(svgPath)}`);
}

main().catch((err) => {
  console.error('[odds] Unexpected error:', err);
  process.exit(1);
});
