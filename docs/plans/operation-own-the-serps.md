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
- GSC: sitemaps submitted 2026-07-03; indexing being monitored (weekly review in
  `docs/operations/maintenance.md`).
- Analytics: GA4 (`G-WV5RKCMJSB`) + PostHog live.

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

## Phasing (multi-year)

### Phase 1 — Index & Playbook (now → end 2026)

Goal: the shipped corpus actually indexed, ranking on tail terms, and an
event-week routine that runs like clockwork.

- Monitor GSC weekly: coverage, what indexed, what got excluded and why. Fix
  crawl waste, orphans, duplicate titles as they surface.
- **Ship `/schedule` + "fights this weekend/tonight" hub pages** (gap #2 above).
- Run the **event-week playbook** for every major card: preview post (T-14),
  how-to-watch (T-7), odds refresh (T-2), results swap (T+0), reactions section
  (T+1). UFC 329→331 are the template reps.
- Per-event blog posts embed live fight cards (`gf-fight-card` placeholders) so
  search readers see ratings and rate in place.
- KPIs: indexed pages (target: >80% of gated corpus), GSC clicks/week trend,
  first page-1 rankings on `[fighter] record` and org-tail queries.

### Phase 2 — Coverage & Authority (2027)

Goal: no query category unserved; goodfights.app recognized (by Google's
entity graph) as a combat sports authority.

- **Explainer library**: 30–50 evergreen posts across category 7, one per week
  at a sustainable solo pace.
- **Underserved-org domination**: org hub pages (BKFC/Oktagon/KC/DBX/PFL/RIZIN)
  with schedules, results, ratings; editorial for their majors.
- **Best-of engine expansion**: per-division, per-org, per-method, all-time
  lists — all DB-driven, all auto-updating.
- **Digital PR with rating data**: quarterly data stories (e.g. "the most
  overhyped fights of 2027", "hype vs payoff by promotion") pitched to MMA
  media for links. Our data is genuinely novel; links are the currency Phase 3
  needs.
- Fighter pages: next-fight/last-fight SSR blocks; "who is X fighting next"
  coverage.
- KPIs: 100k organic visits/mo by end 2027 (stretch), Mediavine Journey
  threshold crossed, 50+ referring domains from data stories.

### Phase 3 — Head Terms & Harvest (2028+)

Goal: compete for the big ones and convert the traffic asset.

- Contest head terms: `ufc schedule`, `ufc rankings`, `mma news adjacent`
  formats, `best fights of all time`. Only winnable after Phase 2's authority.
- Internationalization assessment (UK/AU/CA spellings and rights pages first —
  same language, different broadcast answers).
- Monetization at scale: display ads (Mediavine/Monumetric), affiliate
  re-approach (networks that rejected at small scale — `project_affiliate_too_small_revisit`),
  and the sale narrative: **organic search traffic is a separately-sellable
  asset with public GSC receipts** (`docs/areas/sale-value.md`).
- KPIs: 250k+ organic visits/mo, $3k+/mo web revenue, top-3 on ≥5 head terms.

## Operating cadence

- **Weekly**: GSC review (already in maintenance.md) — indexing, new queries,
  striking-distance terms (positions 5–15 get on-page attention first).
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
