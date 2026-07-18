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
- **P6 — Earned links via proprietary-data stories (ADDED 2026-07-17).**
  Links are the bottleneck for a young domain (5k+ pages sitting in Google's
  discovered-not-crawled queue). Cadence: one original-data article per
  quarter minimum ("Hype vs. reality: the most overhyped fights of 2026",
  "worst card of the year by fan ratings", hype-vs-payoff by promotion) built
  to be *cited* — clear stat callouts, embeddable charts watermarked with the
  brand. **Distribution = direct email to MMA journalists, sent by Mike**
  (Claude drafts the pitches; Mike presses send — one action at a time per
  `feedback_marketing_handholding`). **Reddit is NOT a distribution channel:
  everything Mike posts gets removed (confirmed 2026-07-17) — do not plan
  around Reddit posts.** Expectations: a handful of links per story, ranking
  benefit lags months; this is compounding, not instant.

## Timeline philosophy (revised 2026-07-14, Mike)

"Multi-year" describes how long RANKINGS take to mature, not how long we take
to build. Google's trust curve is the slow part — a new page can take 3-9
months to rank for anything competitive no matter how good it is. So the plan
is: **front-load ALL the build work now** (next ~90 days), then run a light
ongoing rhythm while the authority compounds on its own clock. We should never
be waiting on ourselves; only on Google.

### The front-load (now → ~October 2026, in order — RE-SEQUENCED 2026-07-17)

Order revised in the 2026-07-17 design session: what the first fight-week of
data validated (programmatic event pages + underserved orgs) gets doubled
down on first; explainers — weakest evidence, strongest competition — demoted
to last.

1. ✅ **Schedule hubs** — SHIPPED 2026-07-14 (`/schedule`,
   `/schedule/tonight`, `/schedule/this-weekend`). Young; watch positions in
   the weekly GSC report before touching again.
2. **Internal-linking pass** — NEXT UP. Template work that makes Google
   discover and weigh the 5,500-page corpus: fight page → both fighter
   pages → division hub → relevant best-of lists; event page → org hub →
   schedule hub; blog posts → programmatic pages. One-time template change,
   compounding crawl benefit, zero marginal cost. Directly attacks the
   discovered-not-crawled backlog.
3. **Underserved-org hubs** — BKFC / Oktagon / Karate Combat / DBX / PFL /
   RIZIN org pages (schedule + results + ratings per org). We already have the
   data; nobody competes editorially for these queries — and RAF Georgia
   proved the thesis (~450 real clicks to a programmatic event page).
4. **Best-of engine expansion** — per-division, per-org, per-method (best KOs,
   best submissions, best title fights), all-time. DB-driven, auto-updating.
   Doubles as the citable backbone for P6 data stories.
5. **Fighter page blocks** — next-fight / last-fight SSR sections ("who is X
   fighting next" is a huge recurring query family).
6. **Event-week playbook, systematized** — **upgraded 2026-07-17: how-to-watch
   moves to T-14 (was T-7) and gains per-country sections** (Canada/UK/Ireland
   watch/price queries were all over the UFC 329 striking-distance list).
   Full cycle: preview + how-to-watch (T-14) → odds refresh (T-2) → results
   swap (T+0) → reactions (T+1), run for every major card. UFC 330 is the
   first rep on the new template.
7. **GSC hygiene** — weekly review; fix coverage exclusions, thin pages,
   duplicate titles as they surface.
8. **Explainer library (DEMOTED to last, 2026-07-17)** — the top evergreen
   questions, written in batches. No ratings moat, competes head-on with
   Wikipedia/Reddit/MMA media, and nobody links to the 500th "what is a
   catchweight". **Kill criterion stands:** ship ~10, checkpoint at 6 months,
   stop if none crack the top 20.

### The ongoing rhythm (after the front-load)

- **Every fight week:** run the event playbook (2-4 hrs/card).
- **Weekly:** GSC striking-distance review — pages at positions 5-15 get
  on-page attention first; that's where the cheap wins live.
- **Monthly:** one template audit (rotate fighter/event/fight), one new
  best-of variant (explainers only after the front-load, per the demotion).
- **Quarterly:** a P6 data story from our proprietary ratings (e.g.
  "hype vs payoff by promotion, 2026") — Claude drafts article + journalist
  pitch emails, Mike sends them directly (no Reddit) — plus a strategy
  review against this doc.

## How we judge success (DECIDED 2026-07-17)

The UFC 329 week taught us the headline numbers lie: of ~5.2k clicks, the
largest single slice was free-stream-intent traffic showing up as Singapore
(2,373 users, exactly 1 session each — VPN-concentrated stream seekers), on
top of a McGregor-sized card that won't recur often. So:

- **Primary metric: weekly CATALOG clicks from tier-1 countries**
  (US/CA/UK/AU/IE/NZ/EU) — clicks to fighters, past events/fights, and hub
  pages, i.e. everything except current-event pages and blog. **Corrected
  2026-07-17 (Mike): there are very few non-fight weeks** — combat sports runs
  nearly every weekend — so the split is by *page cohort*, not by calendar.
  Catalog tier-1 clicks are the compounding back-catalog: immune to fight-week
  spikes and free-stream/VPN traffic, and the number that must grow month over
  month. Automated in the weekly report ("Compounding baseline" section,
  `gscWeeklyReport.js`). **Starting line, measured 2026-07-17: ~6
  catalog tier-1 clicks/week** (and only ~29% of all clicks were tier-1 during
  UFC 329 week). Current-event pages are judged per event, never as trend.
- **Secondary: flywheel conversions** — search visitors who `rating_submitted`
  / `hype_submitted` / `app_download_click` (instrumented, live in GA4+PostHog
  as of 2026-07-17).
- **Free-stream searchers are explicitly not a target** (decided 2026-07-17):
  don't build for them, don't count them. Discount "free/stream/torrent"
  query clicks and 1-session Singapore-style traffic when reading reports.

## Decision log

- **2026-07-17 (design session with Mike):** (1) P6 links workstream added —
  quarterly original-data articles, distributed by Mike emailing MMA
  journalists directly; Reddit dropped entirely (his posts get removed).
  (2) Front-load re-sequenced: internal-linking pass next, then org hubs;
  explainers demoted to last (kill criterion intact). (3) Event playbook
  upgraded: how-to-watch at T-14 + per-country sections. (4) Free-stream
  searchers out of scope. (5) Success metrics fixed as above — same evening,
  Mike corrected "non-fight-week clicks" to the catalog-cohort definition
  (there are almost no non-fight weeks); `gscWeeklyReport.js` now computes
  the "Compounding baseline" section automatically every Monday.

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
