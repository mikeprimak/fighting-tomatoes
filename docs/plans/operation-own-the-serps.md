# Operation "Own The SERPs" — Multi-Year Combat Sports Search Domination

**Created:** 2026-07-14. **Status:** ACTIVE — this formalizes SEO as a named,
permanent workstream, successor and superset of
`docs/plans/programmatic-seo-2026-07-01.md` (all 7 steps of which shipped
2026-07-01→03 and are the foundation this plan builds on).

## Mission

For every combat sports search query a fan types, a goodfights.app page ranks on
page 1 — with the fan-rating data nobody else has as the reason it deserves to.

## Why we win (the moat)

Every competitor (Tapology, Sherdog, ESPN, MMAFighting, BloodyElbow) has cards,
records, and news. **Nobody has fan ratings, hype scores, rating distributions,
and hype-vs-payoff data.** UFC 329 proved the editorial power of that: a 9.5
pre-fight hype score collapsing to a 1.3 post-fight rating is a story only we
can tell, on every fight page, automatically. Every phase below leads with that
data.

## Current state (July 2026)

- ~5,472 gated programmatic pages live (947 fighters, ~640 events, 3,879
  fights) + hubs (`/fighters`, division facets, `/events`, `/fights/best/[year]`)
  + ~24 blog posts. Sitemaps chunked per type; `shouldIndex` gate enforced;
  JSON-LD (Person / SportsEvent / AggregateRating) server-rendered.
- GSC: sitemaps submitted 2026-07-03; weekly automated report since 2026-07-14
  (`docs/operations/gsc-reports/`). First fight-week proof: UFC 329 week drove
  5,194 clicks / 848k impressions (how-to-watch post alone: 4,123 clicks).
- Analytics: GA4 (`G-WV5RKCMJSB`) + PostHog live. Flywheel conversions
  instrumented 2026-07-14: `rating_submitted`, `hype_submitted`,
  `app_download_click` fire to both (P5 is now measurable).

## The query universe (what "all of them" means)

Ordered roughly by (volume × our ability to win):

1. **Event lifecycle queries** — the recurring cash crop. Per event:
   `ufc 330`, `ufc 330 card`, `ufc 330 start time`, `how to watch ufc 330`,
   `ufc 330 odds`, `ufc 330 predictions`, then post-fight: `ufc 330 results`,
   `who won makhachev garry`. One URL per event rides both intent waves
   (preview → results swap, already shipped). Blog previews catch the head
   terms; programmatic event pages catch the tail forever.
2. **"Tonight / this weekend / schedule" queries** — `ufc tonight`,
   `mma fights this weekend`, `boxing tonight`, `ufc schedule 2026`,
   `bkfc next event`. High volume, weak competition below the top orgs,
   perfect fit for auto-updating hub pages. **We do not have these pages yet —
   biggest gap in the current build.**
3. **Fighter queries** — `[fighter] record`, `[fighter] next fight`,
   `[fighter] last fight`, `[fighter] height/reach/age`. Programmatic fighter
   pages + facts strip already live; needs "next fight / last fight" blocks
   rendered prominently in SSR HTML.
4. **Versus / prediction queries** — `makhachev vs garry`, `x vs y prediction`,
   `x vs y odds`. Fight pages already exist per bout; hype score + odds +
   AI preview is exactly this intent.
5. **Superlative / list queries** — `best ufc fights of 2026`,
   `best fights ever`, `fight of the year`, `best knockouts`. Our ratings are
   the only defensible answer to these. `/fights/best/[year]` shipped; expand to
   per-org, per-division, per-method (best KOs, best title fights), all-time.
6. **Ratings-intent queries (our native turf)** — `was ufc 330 worth watching`,
   `ufc 330 replay worth it`, `best card this year`. Tiny volume individually,
   zero competition, 100% our brand. These convert to users, not just visits.
7. **Explainer / evergreen queries** — `how do ufc rankings work`,
   `what is a catchweight`, `why are 12-6 elbows illegal`, `how long are ufc
   fights`, `mma weight classes in order`, `what does p4p mean`. Blog territory;
   each is a permanent asset. The ruleset-comparison infographics already made
   are seeds for this library.
8. **Underserved-org queries** — BKFC, Oktagon, Karate Combat, Dirty Boxing,
   PFL, RIZIN, GFL: `bkfc rules`, `oktagon 92 card`, `karate combat results`.
   We already scrape and list these orgs; almost nobody competes editorially for
   their queries. Cheap rankings + exactly where the app has coverage
   differentiation.
9. **Broadcast/rights queries** — `what channel is ufc on`, `is ufc on
   paramount`, `ufc ppv price`. Rights chaos (Paramount+ era) regenerates this
   demand every year; our EventBroadcast data feeds it.

## Strategy pillars

- **P1 — Programmatic templates own the tail.** Fighter/event/fight pages,
  gated for quality, auto-fresh from the DB. (Shipped; iterate.)
- **P2 — Hubs own the recurring middle.** Schedule/tonight/weekend pages,
  best-of engines, division hubs. Permanent URLs that auto-update beat articles
  that decay.
- **P3 — Editorial owns the head.** Blog previews/results for majors (the
  UFC 329/330 playbook), explainer library for evergreens. Voice-guide
  compliant, review-before-ship.
- **P4 — Proprietary data is the differentiator everywhere.** Hype scores,
  fan ratings, distributions, hype-vs-payoff gaps — surfaced on every template,
  cited in every article, pitched as data stories for links.
- **P5 — The flywheel: search visitor → rater → data → better pages.** Every
  SEO page carries a rate-this-fight CTA; ratings deepen the moat that ranks
  the pages.

## Timeline philosophy (revised 2026-07-14, Mike)

"Multi-year" describes how long RANKINGS take to mature, not how long we take
to build. Google's trust curve is the slow part — a new page can take 3-9
months to rank for anything competitive no matter how good it is. So the plan
is: **front-load ALL the build work now** (next ~90 days), then run a light
ongoing rhythm while the authority compounds on its own clock. We should never
be waiting on ourselves; only on Google.

### The front-load (now → ~October 2026, roughly in order)

1. **Schedule hubs** — `/schedule`, "MMA fights tonight / this weekend"
   auto-updating pages (biggest current gap; weak competition, high volume).
   Freshness must be machine-visible: sitemap `lastmod` moves when content
   changes, dynamic dates in titles/descriptions, visible updated stamps —
   Google only treats a "tonight" page as live if it can see it changing.
2. **Explainer library, batched** — the top ~25 evergreen questions (category
   7) written in focused batches, not dripped weekly. These age like wine;
   every month they're not live is compounding lost.
   **Kill criterion (added 2026-07-14):** ship the first ~10, then checkpoint —
   if none crack the top 20 within 6 months of publication, stop at 10 and
   reallocate the effort to best-of variants (where the ratings moat defends
   us) instead of grinding out 15 more against Wikipedia/Reddit/MMA media.
3. **Underserved-org hubs** — BKFC / Oktagon / Karate Combat / DBX / PFL /
   RIZIN org pages (schedule + results + ratings per org). We already have the
   data; nobody competes editorially for these queries.
4. **Best-of engine expansion** — per-division, per-org, per-method (best KOs,
   best submissions, best title fights), all-time. DB-driven, auto-updating.
5. **Fighter page blocks** — next-fight / last-fight SSR sections ("who is X
   fighting next" is a huge recurring query family).
6. **Internal-linking pass (added 2026-07-14)** — template work that makes
   Google discover and weigh the 5,500-page corpus: fight page → both fighter
   pages → division hub → relevant best-of lists; event page → org hub →
   schedule hub; blog posts → programmatic pages. One-time template change,
   compounding crawl benefit, zero marginal cost.
7. **Event-week playbook, systematized** — preview (T-14) → how-to-watch (T-7)
   → odds refresh (T-2) → results swap (T+0) → reactions (T+1), run for every
   major card. UFC 329/330/OKC are the template reps.
8. **GSC hygiene** — weekly review; fix coverage exclusions, thin pages,
   duplicate titles as they surface.

### The ongoing rhythm (after the front-load)

- **Every fight week:** run the event playbook (2-4 hrs/card).
- **Weekly:** GSC striking-distance review — pages at positions 5-15 get
  on-page attention first; that's where the cheap wins live.
- **Monthly:** one template audit (rotate fighter/event/fight), one new
  explainer or best-of variant.
- **Quarterly:** a digital-PR data story from our proprietary ratings (e.g.
  "hype vs payoff by promotion, 2026") pitched for links, plus a strategy
  review against this doc.

### What to expect while it compounds (SEO physics, not work phases)

- **Months 0-3:** indexing consolidates; long-tail wins appear (org-tail
  queries, `[fighter] record`, old best-of years).
- **Months 3-9:** middle terms move (event previews rank during fight week,
  schedule hubs get pulled into "fights tonight" results).
- **Months 9-18:** authority terms contested (`best fights of 2026`, org
  hubs, explainers outranking forums).
- **18+ months:** head terms become winnable (`ufc schedule`, `ufc rankings`)
  IF the link/authority work landed. Milestones: Mediavine Journey threshold →
  100k organic visits/mo → 250k+/mo and $3k+/mo web revenue.

Monetization at scale (display ads, affiliate re-approach —
`project_affiliate_too_small_revisit`) turns traffic into income, and the
traffic itself strengthens the ONE asset we are building: brand + web + app +
users + data, grown and sold together (`docs/areas/sale-value.md` Posture,
2026-07-14 — traffic is never framed as a separate carve-out; its GSC/GA4
history is a receipt that makes the whole asset more credible).

## Operating cadence

- **Weekly**: GSC review — AUTOMATED 2026-07-14: `gsc-weekly-report.yml`
  commits a report to `docs/operations/gsc-reports/` every Monday (WoW totals,
  striking-distance list, new queries). The human job is reading it and
  picking 1-2 striking-distance pages to improve.
- **Daily (automated)**: `content-freshness-check.yml` canary — results
  landing, enrichment attempting, critical workflows green, sitemaps serving.
  Red = GitHub email; act same day (silent decay is this plan's main enemy).
- **Every fight week**: run the event playbook.
- **Monthly**: template audit (one of fighter/event/fight per month, rotating);
  refresh best-of pages sanity check.
- **Quarterly**: strategy review against this doc; one digital-PR data story.

## Constraints & discipline

- Solo founder, ~$100/mo budget: everything must be automatable or batchable.
- **No mass thin AI content.** The indexing gate is the law; article-length
  mass generation stays de-scoped (helpful-content risk). Compose from
  structured fields; long-form is curated.
- Voice guide governs editorial; no AI tells; review-before-ship on articles.
- Never split intent across URLs (no separate results articles — swap in place).

## Related

- `docs/plans/programmatic-seo-2026-07-01.md` — the shipped foundation.
- `docs/areas/sale-value.md` — traffic as sellable asset.
- `docs/operations/maintenance.md` — recurring GSC/aggregate tasks.
- `packages/backend/scripts/gsc.js`, `scripts/ga.js` — measurement from the repo.
