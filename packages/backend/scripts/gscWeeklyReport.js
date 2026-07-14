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

  const [sitemapsRes, daily, queries, pages, prevQueries] = await Promise.all([
    fetch(`${BASE}/sites/${encodeURIComponent(SITE)}/sitemaps`, { headers: H }).then((r) => r.json()),
    gscQuery(H, { startDate: prevRange.startDate, endDate: thisRange.endDate, dimensions: ['date'], rowLimit: 20 }),
    gscQuery(H, { ...thisRange, dimensions: ['query'], rowLimit: 1000 }),
    gscQuery(H, { ...thisRange, dimensions: ['page'], rowLimit: 1000 }),
    gscQuery(H, { ...prevRange, dimensions: ['query'], rowLimit: 1000 }),
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
