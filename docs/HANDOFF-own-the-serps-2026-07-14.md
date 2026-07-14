# HANDOFF — Operation "Own The SERPs" (dedicated session)

**Written:** 2026-07-14. **Read this first, then:**
`docs/plans/operation-own-the-serps.md` (the strategy) and
`docs/plans/programmatic-seo-2026-07-01.md` (the shipped foundation).
Trigger phrase suggestion: "own the serps session".

## What this workstream is

Own page 1 of every combat sports search query, using the one dataset nobody
else has (fan ratings / hype scores / hype-vs-payoff). The strategy doc maps a
**9-category query universe**; the foundation (slugs, SSR, gated sitemaps,
JSON-LD, hubs, ~5,500 indexable pages) shipped 2026-07-01→03 and is LIVE.
**Timeline philosophy (Mike, 2026-07-14): front-load ALL build work in ~90
days, then light ongoing rhythm. Multi-year refers to Google's ranking clock,
never to our build pace. We wait on Google, not on ourselves.**

## State as of 2026-07-14

- Sitemaps live and serving (fighters 1,130 URLs incl. division hubs; ~640
  events; 3,879 fights; 18 best-of years). Submitted to GSC 2026-07-03.
- GSC indexing is young — monitor weekly (`node packages/backend/scripts/gsc.js query|sitemaps`),
  GA4 via `scripts/ga.js`. No meaningful ranking data yet; too early.
- Best-of-year pages just got editorial retrospectives + FAQ + FAQPage JSON-LD
  (`src/lib/bestFightYearNotes.ts`). Copy is rank-shift-proof by design (never
  anoints a fixed #1 — keep this rule for all future copy).
- Blog has the `gf-event-fights` embed (full interactive hype/rating fight
  list in any post — one `<div class="gf-event-fights" data-event-id="SLUG">`).
  Event-week articles should always include it.
- Event-week playbook has 3 live reps: UFC 329 (results+reactions),
  UFC 330 + UFC OKC (previews). All three articles live with embeds.
- AI enrichment: API credits were exhausted, Mike topped up $20 on 2026-07-14.
  UFC 330 + OKC event summaries now live. Watch the balance — enrichment run
  ≈ $0.015/event, but the daily crons add up; if pages stop getting summaries,
  check billing FIRST.

## The front-load backlog (do in this order)

1. **`/schedule` + "fights tonight / this weekend" hubs — THE gap, do first.**
   - Routes: `/schedule` (all upcoming, grouped by week), `/schedule/tonight`,
     `/schedule/this-weekend` (or query-param variants of one page — decide,
     but each target query needs its own indexable URL + title).
   - SSR from the existing events API (type=upcoming already exists; add
     date-window filtering). Auto-updating = permanent URLs that never decay.
   - Title patterns: "MMA & Boxing Fights Tonight (July 14, 2026) — Cards,
     Start Times, How to Watch". Dynamic date in title/description is fine;
     URL stays static.
   - Include per-event: start times (mainStartTime), broadcast (EventBroadcast),
     hype scores, links to event pages. SportsEvent JSON-LD list.
   - Add to navbar + root sitemap + footer. Internal-link from event pages.
2. **Explainer library, batched.** Top ~25 evergreen questions (weight classes
   in order, why 12-6 elbows are illegal, how scoring works, what is a
   catchweight, how long fights are, what BMF means, ruleset comparisons — the
   infographics in docs/marketing/infographics/ are ready-made assets). Blog
   posts, voice-guide compliant, review-before-ship per house rule. Batch-draft
   5+ per session, Mike reviews in one pass.
3. **Underserved-org hubs.** `/promotions/[org]` (BKFC, Oktagon, Karate Combat,
   Dirty Boxing, PFL, RIZIN, ONE): org blurb + upcoming events + recent results
   + top-rated fights of the org (all from DB). promotionRegistry.ts is the org
   source of truth. Almost zero SERP competition for these.
4. **Best-of engine expansion.** `/fights/best/[year]` exists; add per-org and
   per-division variants once URL design is settled (avoid combinatorial thin
   pages — apply the ≥10-rated-fights gate everywhere; noindex below it).
5. **Fighter next-fight/last-fight SSR blocks.** "Who is X fighting next" /
   "when did X last fight" — render as visible Q-styled headings on fighter
   pages (data already in fight history; it's a formatting/heading job).
6. **Event-week playbook, every major card.** T-14 preview → T-7 how-to-watch
   → T-2 odds refresh → T+0 results swap (same URL!) → T+1 reactions. The
   UFC 329/330/OKC trio is the template. Always embed gf-event-fights.
7. **GSC hygiene weekly.** Coverage report: what's excluded and why; fix as
   found. Positions 5-15 = striking distance; improve those pages first.

## Rules that bind this workstream

- **Indexing gate is law** (`packages/backend/src/lib/seoIndex.ts`). Never
  index thin pages; the sitemap IS the whitelist. Helpful-content demotions
  are sitewide — one bad template poisons everything.
- **No mass article-length AI generation.** Compose from structured DB fields;
  long-form is curated and reviewed.
- **Never split an event's search intent across URLs** — preview and results
  live on ONE URL (event page + one blog hub per event max).
- **Blog copy: no em dashes, voice guide applies, review before ship.**
- **Rank-shift-proof copy** — lists are live; prose never hard-codes a #1.
- **One asset framing** (Mike, 2026-07-14): web traffic grows the single
  brand+web+app+users+data asset. Never pitch/plan it as a separate carve-out.
- Cheap-research rule: WebSearch snippets only for editorial fact-finding.

## Measurement cadence

- Weekly: GSC clicks/impressions trend + striking-distance list (already in
  `docs/operations/maintenance.md`).
- Per fight week: did the preview/results pages get impressions during the
  event window? (This is the earliest signal the playbook works.)
- Milestones to watch: first page-1 tail rankings (org-tail, `[fighter]
  record`) → Mediavine Journey threshold → 100k organic/mo.

## Open items / loose ends relevant here

- Mobile blog does NOT render `gf-event-fights` yet (native rich-block
  support; needs mobile work + a build eventually).
- `/fights/best/[year]` FightColumnHeader sits above the list container —
  cosmetic alignment with rank badges unverified on real data; eyeball it.
- Pre-existing mobile bug (unrelated, noted 2026-07-14): `app/event/[id].tsx`
  fires a debug Alert when an event has zero fights.
- GSC weekly review may not have run since 2026-07-03 — check first thing.
