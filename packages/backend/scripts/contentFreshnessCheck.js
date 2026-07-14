#!/usr/bin/env node
/*
 * Content-freshness health check — catches the SILENT failure modes that
 * starve the SEO corpus without any workflow turning red:
 *
 *   1. Results stopped landing (live trackers / scrapers dead, or the
 *      Render GITHUB_TOKEN expired so trigger endpoints silently 401):
 *      recent COMPLETED events must have winners on their fights.
 *   2. AI enrichment stopped attempting (cron dead or API credits
 *      exhausted — enrichment run ≈ $0.015/event, credits ran dry once
 *      on 2026-07-14): near-term upcoming events must have a non-null
 *      aiEventEnrichedAt.
 *   3. Critical scheduled workflows' latest runs failed (needs
 *      GITHUB_TOKEN with actions:read — provided automatically in CI).
 *   4. goodfights.app + sitemaps stopped serving.
 *
 * Zero DB access, zero Google secrets — public API + GitHub API only, so
 * it tests the real serving path. Exits 1 with a summary on any failure;
 * the workflow turns red and GitHub emails Mike.
 *
 * Usage: node scripts/contentFreshnessCheck.js
 * Runs daily via .github/workflows/content-freshness-check.yml.
 */
const API = process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com';
const WEB = 'https://goodfights.app';
const REPO = process.env.GITHUB_REPOSITORY || 'mikeprimak/fighting-tomatoes';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

const CRITICAL_WORKFLOWS = [
  'fight-enrichment.yml',
  'post-fight-enrichment.yml',
  'ufc-scraper.yml',
  'oktagon-scraper.yml',
  'bkfc-scraper.yml',
  'onefc-scraper.yml',
  'news-scraper.yml',
  'broadcast-discovery.yml',
  'start-time-discovery.yml',
  'gsc-weekly-report.yml',
];

const problems = [];
const notes = [];
const DAY = 86400000;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'gf-freshness-check' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function checkResultsFreshness() {
  const { events } = await getJson(`${API}/api/events?type=past&limit=6`);
  // Only judge events that ended comfortably long ago (main start > 24h back).
  const settled = (events || [])
    .filter((e) => e.eventStatus === 'COMPLETED')
    .filter((e) => new Date(e.mainStartTime || e.date).getTime() < Date.now() - DAY)
    .slice(0, 3);
  for (const e of settled) {
    const { fights } = await getJson(`${API}/api/fights?eventId=${e.id}&limit=50`);
    const withWinner = (fights || []).filter((f) => f.winner).length;
    if ((fights || []).length > 0 && withWinner === 0) {
      problems.push(`RESULTS: "${e.name}" (${e.slug}) completed >24h ago but 0/${fights.length} fights have a winner — live tracker/scraper/results-backfill may be dead.`);
    } else {
      notes.push(`results ok: ${e.slug} ${withWinner}/${(fights || []).length} winners`);
    }
  }
  if (!settled.length) notes.push('results: no settled completed events in window (quiet week)');
}

async function checkEnrichmentAttempts() {
  const { events } = await getJson(`${API}/api/events?type=upcoming&limit=20`);
  const soon = (events || []).filter((e) => {
    const t = new Date(e.mainStartTime || e.date).getTime();
    return t > Date.now() && t < Date.now() + 5 * DAY;
  });
  const unattempted = soon.filter((e) => !e.aiEventEnrichedAt);
  if (unattempted.length >= 2) {
    problems.push(`ENRICHMENT: ${unattempted.length}/${soon.length} events starting within 5 days have never been enrichment-attempted (${unattempted.map((e) => e.slug).join(', ')}). Check the fight-enrichment cron AND the Anthropic credit balance FIRST.`);
  } else {
    notes.push(`enrichment ok: ${soon.length - unattempted.length}/${soon.length} near-term events attempted`);
  }
}

async function checkWorkflows() {
  if (!GH_TOKEN) {
    notes.push('workflows: skipped (no GITHUB_TOKEN)');
    return;
  }
  const H = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gf-freshness-check' };
  for (const wf of CRITICAL_WORKFLOWS) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=2&status=completed`, { headers: H });
      if (!r.ok) { notes.push(`workflows: ${wf} lookup ${r.status}`); continue; }
      const data = await r.json();
      const runs = data.workflow_runs || [];
      if (!runs.length) continue;
      // Two consecutive failures = systemic (expired token, dead credits,
      // broken selector); a single failure is usually transient — skip it.
      if (runs.length >= 2 && runs.every((run) => run.conclusion !== 'success')) {
        problems.push(`WORKFLOW: ${wf} last ${runs.length} completed runs failed (${runs[0].html_url})`);
      } else if (runs[0].conclusion !== 'success') {
        notes.push(`workflows: ${wf} latest run ${runs[0].conclusion} (once — watching)`);
      }
    } catch (e) {
      notes.push(`workflows: ${wf} check errored (${e.message})`);
    }
  }
}

async function checkServing() {
  for (const url of [`${WEB}/`, `${WEB}/sitemap.xml`, `${WEB}/fighters/sitemap.xml`, `${WEB}/events/sitemap.xml`, `${WEB}/fights/sitemap.xml`]) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'gf-freshness-check' } });
      if (!r.ok) problems.push(`SERVING: ${url} -> ${r.status}`);
      else notes.push(`serving ok: ${url}`);
    } catch (e) {
      problems.push(`SERVING: ${url} unreachable (${e.message})`);
    }
  }
}

(async () => {
  await Promise.all([
    checkResultsFreshness().catch((e) => problems.push(`RESULTS check errored: ${e.message}`)),
    checkEnrichmentAttempts().catch((e) => problems.push(`ENRICHMENT check errored: ${e.message}`)),
    checkWorkflows(),
    checkServing(),
  ]);

  console.log('--- content freshness check ---');
  notes.forEach((n) => console.log('  ' + n));
  if (problems.length) {
    console.error(`\n${problems.length} PROBLEM(S):`);
    problems.forEach((p) => console.error('  ✗ ' + p));
    process.exit(1);
  }
  console.log('\nAll fresh.');
})();
