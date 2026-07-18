#!/usr/bin/env node
/*
 * GSC weekly report generator — Operation "Own The SERPs" measurement loop.
 *
 * Pulls Search Console data and writes a dated markdown report to
 * docs/operations/gsc-reports/YYYY-MM-DD.md:
 *   - sitemap submission status
 *   - week-over-week clicks/impressions totals
 *   - top queries + top pages by clicks
 *   - striking-distance queries (avg position 5-15) — the actionable list
 *   - new queries that appeared this week
 *
 * Auth: same service account as gsc.js. Locally it reads
 * packages/backend/ga-service-account.json; in CI set GA_SERVICE_ACCOUNT_JSON
 * to the key file's contents and the script writes it to a temp file itself.
 *
 * Usage (from packages/backend/):
 *   node scripts/gscWeeklyReport.js            write the report file
 *   node scripts/gscWeeklyReport.js --stdout   print to stdout only
 *
 * Runs weekly via .github/workflows/gsc-weekly-report.yml (commits to main).
 * GSC data lags ~2 days, so "this week" = the 7 full days ending 2 days ago.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const SITE = process.env.GSC_SITE_URL || 'https://goodfights.app/';
const BASE = 'https://www.googleapis.com/webmasters/v3';
const STDOUT_ONLY = process.argv.includes('--stdout');

function resolveKeyFile() {
  const inline = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim().startsWith('{')) {
    const tmp = path.join(os.tmpdir(), 'ga-sa-key.json');
    fs.writeFileSync(tmp, inline);
    return tmp;
  }
  return path.resolve(__dirname, '..', 'ga-service-account.json');
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

async function gscQuery(H, body) {
  const site = encodeURIComponent(SITE);
  const r = await fetch(`${BASE}/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`GSC query failed ${r.status}: ${JSON.stringify(data)}`);
  return data.rows || [];
}

// --- Compounding-baseline metric (decided 2026-07-17) ---------------------
// Almost every week is a fight week, so the durable-growth signal is not
// "quiet weeks" — it's clicks to CATALOG pages (fighters, past events/fights,
// hubs) from tier-1 countries, split away from current-event spike pages.
// Free-stream/VPN traffic (the UFC 329 Singapore lesson) mostly lands outside
// tier-1, so the country filter also discounts that.

// GSC country dimension uses ISO-3166-1 alpha-3, lowercase.
const TIER1_COUNTRIES = new Set([
  'usa', 'can', 'gbr', 'irl', 'aus', 'nzl',
  'deu', 'fra', 'nld', 'esp', 'ita', 'prt', 'bel', 'aut', 'che',
  'swe', 'nor', 'dnk', 'fin', 'pol', 'cze',
]);

const API_BASE = process.env.GOODFIGHTS_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

// Events whose date falls inside [weekStart-7d, weekEnd+7d] are "current":
// their pages ride the event's search wave (how-to-watch before, results
// after) and must not be read as baseline growth.
async function fetchCurrentEventKeys(weekStart, weekEnd) {
  const keys = new Set();
  const DAY = 86400000;
  const lo = new Date(weekStart.getTime() - 7 * DAY);
  const hi = new Date(weekEnd.getTime() + 7 * DAY);
  try {
    const [upcoming, past] = await Promise.all([
      fetch(`${API_BASE}/events?type=upcoming&limit=100`).then((r) => r.json()),
      fetch(`${API_BASE}/events?type=past&limit=100`).then((r) => r.json()),
    ]);
    for (const e of [...(upcoming.events || []), ...(past.events || [])]) {
      const d = new Date(e.mainStartTime || e.date);
      if (Number.isNaN(d.getTime()) || d < lo || d > hi) continue;
      if (e.slug) keys.add(e.slug);
      if (e.id) keys.add(e.id);
    }
  } catch (err) {
    console.error(`current-event fetch failed (cohort split degrades to catalog/blog/other): ${err.message}`);
  }
  return keys;
}

function classifyPage(url, currentEventKeys) {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    p = url.replace(SITE, '/');
  }
  if (p.startsWith('/blog')) return 'blog';
  if (p.startsWith('/events/')) {
    const key = p.split('/')[2] || '';
    return currentEventKeys.has(key) ? 'current' : 'catalog';
  }
  if (p.startsWith('/fighters') || p.startsWith('/fights') || p.startsWith('/schedule') || p.startsWith('/events')) {
    return 'catalog';
  }
  return 'other';
}

function cohortTotals(pageCountryRows, currentEventKeys) {
  const t = {
    all: { clicks: 0, impressions: 0 },
    catalog: { clicks: 0, impressions: 0 },
    current: { clicks: 0, impressions: 0 },
    blog: { clicks: 0, impressions: 0 },
    other: { clicks: 0, impressions: 0 },
  };
  for (const row of pageCountryRows) {
    const [page, country] = row.keys;
    if (!TIER1_COUNTRIES.has(country)) continue;
    t.all.clicks += row.clicks;
    t.all.impressions += row.impressions;
    const c = t[classifyPage(page, currentEventKeys)];
    c.clicks += row.clicks;
    c.impressions += row.impressions;
  }
  return t;
}
// --------------------------------------------------------------------------

function mdTable(header, rows) {
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

async function main() {
  const auth = new GoogleAuth({
    keyFile: resolveKeyFile(),
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const H = { Authorization: `Bearer ${token}` };

  // GSC data lags ~2 days. This week = 7 full days ending 2 days ago.
  const DAY = 86400000;
  const end = new Date(Date.now() - 2 * DAY);
  const start = new Date(end.getTime() - 6 * DAY);
  const prevEnd = new Date(start.getTime() - 1 * DAY);
  const prevStart = new Date(prevEnd.getTime() - 6 * DAY);
  const thisRange = { startDate: fmt(start), endDate: fmt(end) };
  const prevRange = { startDate: fmt(prevStart), endDate: fmt(prevEnd) };

  const [sitemapsRes, daily, queries, pages, prevQueries, pageCountry, prevPageCountry, currentEventKeys] = await Promise.all([
    fetch(`${BASE}/sites/${encodeURIComponent(SITE)}/sitemaps`, { headers: H }).then((r) => r.json()),
    gscQuery(H, { startDate: prevRange.startDate, endDate: thisRange.endDate, dimensions: ['date'], rowLimit: 20 }),
    gscQuery(H, { ...thisRange, dimensions: ['query'], rowLimit: 1000 }),
    gscQuery(H, { ...thisRange, dimensions: ['page'], rowLimit: 1000 }),
    gscQuery(H, { ...prevRange, dimensions: ['query'], rowLimit: 1000 }),
    gscQuery(H, { ...thisRange, dimensions: ['page', 'country'], rowLimit: 5000 }),
    gscQuery(H, { ...prevRange, dimensions: ['page', 'country'], rowLimit: 5000 }),
    fetchCurrentEventKeys(start, end),
  ]);

  // Week-over-week totals from the daily rows.
  const totals = { cur: { clicks: 0, impressions: 0 }, prev: { clicks: 0, impressions: 0 } };
  for (const row of daily) {
    const bucket = row.keys[0] >= thisRange.startDate ? totals.cur : totals.prev;
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
  }
  const delta = (cur, prev) => {
    if (!prev) return 'n/a';
    const pct = ((cur - prev) / prev) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

  const topQueries = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 25);
  const topPages = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 25);

  // Striking distance: position 5-15 with meaningful impressions, biggest
  // opportunity (impressions) first. These pages get on-page attention first.
  const striking = queries
    .filter((r) => r.position >= 5 && r.position <= 15 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  const prevSet = new Set(prevQueries.map((r) => r.keys[0]));
  const newQueries = queries
    .filter((r) => !prevSet.has(r.keys[0]) && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  const lines = [];
  lines.push(`# GSC Weekly Report — ${fmt(new Date())}`);
  lines.push('');
  lines.push(`Window: **${thisRange.startDate} → ${thisRange.endDate}** (prior: ${prevRange.startDate} → ${prevRange.endDate}). GSC data lags ~2 days.`);
  lines.push('');
  lines.push('## Totals (week over week)');
  lines.push('');
  lines.push(mdTable(
    ['Metric', 'This week', 'Prior week', 'Change'],
    [
      ['Clicks', totals.cur.clicks, totals.prev.clicks, delta(totals.cur.clicks, totals.prev.clicks)],
      ['Impressions', totals.cur.impressions, totals.prev.impressions, delta(totals.cur.impressions, totals.prev.impressions)],
      ['Distinct queries (top 1000 cap)', queries.length, prevQueries.length, delta(queries.length, prevQueries.length)],
    ]
  ));
  lines.push('');
  lines.push('## Compounding baseline — tier-1 countries only (THE metric, decided 2026-07-17)');
  lines.push('');
  const coh = cohortTotals(pageCountry, currentEventKeys);
  const prevCoh = cohortTotals(prevPageCountry, currentEventKeys);
  lines.push(mdTable(
    ['Cohort', 'Clicks', 'Prior', 'Change', 'Impressions', 'Prior'],
    [
      ['**Catalog (fighters / fights / past events / hubs)**', coh.catalog.clicks, prevCoh.catalog.clicks, delta(coh.catalog.clicks, prevCoh.catalog.clicks), coh.catalog.impressions, prevCoh.catalog.impressions],
      ['Current-event pages (this week ±7d)', coh.current.clicks, prevCoh.current.clicks, delta(coh.current.clicks, prevCoh.current.clicks), coh.current.impressions, prevCoh.current.impressions],
      ['Blog (mixed evergreen + event-week)', coh.blog.clicks, prevCoh.blog.clicks, delta(coh.blog.clicks, prevCoh.blog.clicks), coh.blog.impressions, prevCoh.blog.impressions],
      ['Other (home, auth, misc)', coh.other.clicks, prevCoh.other.clicks, delta(coh.other.clicks, prevCoh.other.clicks), coh.other.impressions, prevCoh.other.impressions],
      ['All pages (tier-1)', coh.all.clicks, prevCoh.all.clicks, delta(coh.all.clicks, prevCoh.all.clicks), coh.all.impressions, prevCoh.all.impressions],
    ]
  ));
  lines.push('');
  lines.push('_**Catalog tier-1 clicks** is the number that must grow month over month — it is the compounding back-catalog, immune to fight-week spikes and free-stream/VPN traffic. Current-event rows will always spike and decay; judge those per event, never as trend. Caveats: fight pages of current cards count as catalog (their click volume is tiny); blog is a mixed cohort._');
  lines.push('');
  lines.push('## Sitemaps');
  lines.push('');
  const sitemapRows = (sitemapsRes.sitemap || []).map((s) => {
    const c = (s.contents || [])[0] || {};
    return [esc(s.path.replace(SITE, '/')), c.submitted ?? '?', s.errors, s.warnings, (s.lastDownloaded || '').slice(0, 10)];
  });
  lines.push(mdTable(['Sitemap', 'Submitted URLs', 'Errors', 'Warnings', 'Last crawled'], sitemapRows));
  lines.push('');
  lines.push('_The API "indexed" count is unreliable; judge indexing by impressions growth and the GSC UI coverage report._');
  lines.push('');
  lines.push('## Striking distance (positions 5-15, by impressions) — work these first');
  lines.push('');
  lines.push(mdTable(
    ['Query', 'Position', 'Impressions', 'Clicks'],
    striking.map((r) => [esc(r.keys[0]), r.position.toFixed(1), r.impressions, r.clicks])
  ));
  lines.push('');
  lines.push('## Top queries by clicks');
  lines.push('');
  lines.push(mdTable(
    ['Query', 'Clicks', 'Impressions', 'Position'],
    topQueries.map((r) => [esc(r.keys[0]), r.clicks, r.impressions, r.position.toFixed(1)])
  ));
  lines.push('');
  lines.push('## Top pages by clicks');
  lines.push('');
  lines.push(mdTable(
    ['Page', 'Clicks', 'Impressions', 'Position'],
    topPages.map((r) => [esc(r.keys[0].replace(SITE, '/')), r.clicks, r.impressions, r.position.toFixed(1)])
  ));
  lines.push('');
  lines.push('## New queries this week (not seen prior week, ≥10 impressions)');
  lines.push('');
  lines.push(newQueries.length
    ? mdTable(
        ['Query', 'Impressions', 'Clicks', 'Position'],
        newQueries.map((r) => [esc(r.keys[0]), r.impressions, r.clicks, r.position.toFixed(1)])
      )
    : '_None above threshold._');
  lines.push('');

  const md = lines.join('\n');

  if (STDOUT_ONLY) {
    console.log(md);
    return;
  }

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const outDir = path.join(repoRoot, 'docs', 'operations', 'gsc-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${fmt(new Date())}.md`);
  fs.writeFileSync(outFile, md);
  console.log(`Wrote ${outFile}`);
  console.log(`Clicks ${totals.cur.clicks} (${delta(totals.cur.clicks, totals.prev.clicks)}), impressions ${totals.cur.impressions} (${delta(totals.cur.impressions, totals.prev.impressions)}), striking-distance queries: ${striking.length}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
