#!/usr/bin/env node
/*
 * GA4 report puller. No gcloud/OAuth flow — uses the service-account key.
 *
 * Auth: packages/backend/ga-service-account.json (analytics.readonly scope,
 *   granted Viewer on the property). google-auth-library -> bearer token ->
 *   GA4 Data API runReport.
 * Property: GA4_PROPERTY_ID in packages/backend/.env (numeric, not G-xxxx).
 *
 * Usage (from packages/backend/):
 *   node scripts/ga.js                         last 7d pages by page path
 *   node scripts/ga.js --report 404            only not-found pages
 *   node scripts/ga.js --report top            top pages
 *   node scripts/ga.js --report overview       sessions/users/views totals
 *   node scripts/ga.js --report sources        traffic by source/medium
 *   node scripts/ga.js --report countries      sessions by country
 *   node scripts/ga.js --report devices        sessions by device category
 *   node scripts/ga.js --report daily          per-day sessions/users
 *   node scripts/ga.js --report events         top event names
 *   node scripts/ga.js --days 28
 *   node scripts/ga.js --start 2026-06-01 --end 2026-06-16
 *   node scripts/ga.js --dimensions pagePath,pageTitle --metrics screenPageViews
 */
require('dotenv').config();
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

function parseArgs(argv) {
  const a = { report: 'pages', days: 7 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--report') { a.report = v; i++; }
    else if (k === '--days') { a.days = parseInt(v, 10); a.daysExplicit = true; i++; }
    else if (k === '--start') { a.start = v; i++; }
    else if (k === '--end') { a.end = v; i++; }
    else if (k === '--dimensions') { a.dimensions = v.split(','); i++; }
    else if (k === '--metrics') { a.metrics = v.split(','); i++; }
    else if (k === '--limit') { a.limit = parseInt(v, 10); i++; }
  }
  return a;
}

const REPORTS = {
  pages: {
    dimensions: ['pagePath'],
    metrics: ['screenPageViews', 'activeUsers'],
    orderBy: 'screenPageViews',
  },
  top: {
    dimensions: ['pageTitle', 'pagePath'],
    metrics: ['screenPageViews', 'activeUsers'],
    orderBy: 'screenPageViews',
  },
  404: {
    dimensions: ['pagePath'],
    metrics: ['screenPageViews'],
    orderBy: 'screenPageViews',
    filter: { fieldName: 'pageTitle', stringFilter: { matchType: 'CONTAINS', value: '404', caseSensitive: false } },
  },
  overview: {
    dimensions: [],
    metrics: ['sessions', 'activeUsers', 'newUsers', 'screenPageViews', 'engagedSessions', 'averageSessionDuration', 'bounceRate'],
  },
  sources: {
    dimensions: ['sessionSource', 'sessionMedium'],
    metrics: ['sessions', 'activeUsers', 'engagedSessions'],
    orderBy: 'sessions',
  },
  countries: {
    dimensions: ['country'],
    metrics: ['activeUsers', 'sessions'],
    orderBy: 'sessions',
  },
  devices: {
    dimensions: ['deviceCategory'],
    metrics: ['sessions', 'activeUsers'],
    orderBy: 'sessions',
  },
  daily: {
    dimensions: ['date'],
    metrics: ['sessions', 'activeUsers', 'newUsers', 'screenPageViews'],
    orderBy: 'date',
    orderDesc: false,
  },
  events: {
    dimensions: ['eventName'],
    metrics: ['eventCount', 'activeUsers'],
    orderBy: 'eventCount',
  },
  // The buyer-credible web metric: real organic-search visitors, per month.
  // Excludes the bot/redirect junk automatically (those aren't "Organic Search").
  organic: {
    dimensions: ['yearMonth'],
    metrics: ['sessions', 'activeUsers', 'engagedSessions'],
    orderBy: 'yearMonth',
    orderDesc: false,
    filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: false } },
    defaultDays: 365,
  },
};

async function run() {
  const args = parseArgs(process.argv);
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) { console.error('GA4_PROPERTY_ID missing in .env'); process.exit(1); }

  const keyFile = path.resolve(__dirname, '..', 'ga-service-account.json');
  const auth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const preset = REPORTS[args.report] || REPORTS.pages;
  const dimensions = (args.dimensions || preset.dimensions).map((name) => ({ name }));
  const metrics = (args.metrics || preset.metrics).map((name) => ({ name }));

  const windowDays = args.daysExplicit ? args.days : (preset.defaultDays || args.days);
  const dateRange = args.start && args.end
    ? { startDate: args.start, endDate: args.end }
    : { startDate: `${windowDays}daysAgo`, endDate: 'today' };

  const body = {
    dateRanges: [dateRange],
    dimensions,
    metrics,
    limit: args.limit || 50,
  };
  if (preset.orderBy) {
    body.orderBys = [{
      metric: metrics.find((m) => m.name === preset.orderBy) ? { metricName: preset.orderBy } : undefined,
      dimension: !metrics.find((m) => m.name === preset.orderBy) ? { dimensionName: preset.orderBy } : undefined,
      desc: preset.orderDesc !== false,
    }];
  }
  if (preset.filter) {
    body.dimensionFilter = { filter: preset.filter };
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error('GA4 API error:', JSON.stringify(data, null, 2)); process.exit(1); }

  printTable(data, dimensions, metrics, dateRange);
}

function printTable(data, dimensions, metrics, dateRange) {
  const dimNames = dimensions.map((d) => d.name);
  const metNames = metrics.map((m) => m.name);
  console.log(`\nRange: ${dateRange.startDate} -> ${dateRange.endDate}`);
  console.log(`Dimensions: [${dimNames.join(', ') || '(totals)'}]  Metrics: [${metNames.join(', ')}]\n`);

  const rows = data.rows || [];
  if (!rows.length) { console.log('(no rows)'); return; }

  const header = [...dimNames, ...metNames];
  const table = rows.map((r) => [
    ...(r.dimensionValues || []).map((v) => v.value),
    ...(r.metricValues || []).map((v) => v.value),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => String(row[i] ?? '').length)));
  const fmt = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  table.forEach((row) => console.log(fmt(row)));
  console.log(`\n${rows.length} rows.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
