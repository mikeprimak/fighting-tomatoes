#!/usr/bin/env node
/*
 * Google Search Console helper. No gcloud/OAuth flow — uses the same
 * service-account key as ga.js (packages/backend/ga-service-account.json).
 *
 * Setup (done 2026-07-03): Search Console API enabled on GCP project
 * fight-app-ba5cd; ga-reader@fight-app-ba5cd.iam.gserviceaccount.com added
 * as Full user on the https://goodfights.app/ URL-prefix property.
 *
 * Usage (from packages/backend/):
 *   node scripts/gsc.js sites                       properties the SA can see
 *   node scripts/gsc.js sitemaps                    submitted sitemaps + submitted/indexed counts
 *   node scripts/gsc.js submit <sitemapUrl>         (re)submit a sitemap
 *   node scripts/gsc.js query [days] [dimension]    search analytics (default 7d by page;
 *                                                   dimensions: page | query | date | country | device)
 */
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const SITE = process.env.GSC_SITE_URL || 'https://goodfights.app/';

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2);
  const keyFile = path.resolve(__dirname, '..', 'ga-service-account.json');
  const auth = new GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const H = { Authorization: `Bearer ${token}` };
  const base = 'https://www.googleapis.com/webmasters/v3';
  const site = encodeURIComponent(SITE);

  if (cmd === 'sites') {
    const r = await fetch(`${base}/sites`, { headers: H });
    console.log(r.status, JSON.stringify(await r.json(), null, 2));
  } else if (cmd === 'sitemaps') {
    const r = await fetch(`${base}/sites/${site}/sitemaps`, { headers: H });
    const data = await r.json();
    for (const s of data.sitemap || []) {
      const c = (s.contents || [])[0] || {};
      console.log(
        `${s.path}\n  submitted=${c.submitted ?? '?'} indexed=${c.indexed ?? '?'} errors=${s.errors} warnings=${s.warnings} lastDownloaded=${s.lastDownloaded}`
      );
    }
    if (!data.sitemap) console.log(r.status, JSON.stringify(data, null, 2));
  } else if (cmd === 'submit') {
    if (!arg1) throw new Error('usage: gsc.js submit <sitemapUrl>');
    const r = await fetch(`${base}/sites/${site}/sitemaps/${encodeURIComponent(arg1)}`, {
      method: 'PUT',
      headers: H,
    });
    console.log('submit', arg1, '->', r.status, await r.text());
  } else if (cmd === 'query') {
    const days = parseInt(arg1, 10) || 7;
    const dimension = arg2 || 'page';
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const r = await fetch(`${base}/sites/${site}/searchAnalytics/query`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: [dimension],
        rowLimit: 100,
      }),
    });
    const data = await r.json();
    for (const row of data.rows || []) {
      console.log(
        `${row.keys[0]}  clicks=${row.clicks} impressions=${row.impressions} pos=${row.position.toFixed(1)}`
      );
    }
    if (!data.rows) console.log(r.status, JSON.stringify(data, null, 2));
  } else {
    console.log(
      'usage: gsc.js sites | sitemaps | submit <sitemapUrl> | query [days] [page|query|date|country|device]'
    );
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
