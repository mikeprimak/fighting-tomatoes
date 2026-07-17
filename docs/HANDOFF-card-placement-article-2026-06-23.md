# HANDOFF — Card-Placement blog article (continue in fresh window)

> ✅ DONE 2026-06-23. Article fully rewritten per points 2-9 (current + all-time P4P, time-machine
> board, "formula" section, personality section, repetition cut, em-dash swept). See
> `docs/daily/2026-06-23.md`. Remaining: publish to blog + add slug to `blog_highlights` when ready.

Date: 2026-06-23. Continues the "card placement rankings" article work from 2026-06-22.

## ⚠️ READ FIRST — token rule (this is why we restarted)
Research must be done the CHEAP way (see `docs/daily/2026-06-20.md` top section):
- **Use `WebSearch` (snippets only). DO NOT `WebFetch` full pages** — each big HTML page lands
  in context and is re-billed every turn (compounding). That blew a 5hr budget once already.
- **DO NOT spawn research subagents** (parallel agents each WebFetch many pages = worst case).
  A prior attempt spawned 14 agents and was killed.
- Lean on existing knowledge; use WebSearch only to confirm specific numbers/quotes.
- Reuse already-scraped local files in repo root if useful (e.g. `Joe-justin.txt`, Instagram*.html).

## The deliverable
Mike wants ONE blog article (build on the existing draft) covering card placement, with:
1. **Current rankings by division** — already in the draft.
2. **Pound-for-pound (current)** — single cross-division list by placement SCORE (use the
   0-100 score version, NOT slot, because slot can't compare across divisions). NEW — add it.
3. **Historical pound-for-pound** — all-time, by career placement. NEW.
4. **Historical divisions where possible** — historical rankings split by division where data
   supports it (older snapshots get fuzzy; may need to be one overall board pre-~2015). NEW.
5. **Interesting insights** throughout.
6. **Wins/losses mentions:** keep the "this list doesn't consider wins/losses" note ONCE in the
   intro only. REMOVE the repeated mentions (the "Why no wins or losses?" footnote, the per-bullet
   "no credit/penalty" lines, etc.). Mike clarified: just reduce repetition, not delete entirely.
7. **Don't keep explaining "how this is different"** — drop the methodology-vs-old-version and
   defensive meta-commentary; let the rankings stand.
8. **"Formula for the top of the card" section** — from the correlation analysis (below) +
   pay + social research.
9. **Personality section** — getting to the top on personality: Chael Sonnen, Conor McGregor,
   **Josh Hokit** (confirm identity via WebSearch — UFC HW prospect, ex-NFL; he's at HW #17 /
   score 51.2 in our data; verify the personality framing fits or flag), plus others (Sean
   O'Malley, Paddy Pimblett, Colby Covington, Nate Diaz). Get 1-2 real quotes via WebSearch.

## Files
- Draft (0-100 score version, build on THIS): `docs/marketing/card-placement-rankings-article.md`
- Alt (avg-slot version, secondary): `docs/marketing/card-placement-rankings-article-v2-position.md`
- Ranking engine (read-only): `packages/backend/scripts/card-placement-rankings.ts`
  - `--all` full lists, `--csv path`, `--asof YYYY-MM-DD` snapshot, `--position` slot metric.
- All-time/career: `packages/backend/scripts/historical-placement-analysis.ts`
- Divergence vs official rankings: `packages/backend/scripts/divergence-analysis.ts`
- **NEW correlation script (DONE this session):** `packages/backend/scripts/placement-correlates-analysis.ts`
  → CSV at `packages/backend/scripts/output/placement-correlates.csv`
- Run scripts from `packages/backend` (`npx tsx scripts/<x>.ts`); Prisma auto-loads prod DB.

## DONE this session: in-DB correlation results (no web cost — already computed)
What predicts placement score (Pearson r vs 0-100 score, n=615 active fighters):
- **career UFC fights      r = 0.44**  ← strongest in-DB signal (experience/tenure)
- **win rate               r = 0.34**
- in-app follower count    r = 0.39  (our app's follows, NOT real social — minor, weak data)
- finish rate (of wins)    r = 0.12  ← being a finisher barely matters
- KO/TKO share             r = 0.17
- submission share         r = -0.06
- decision share of wins   r = -0.12

Bucket averages:
- HEADLINERS (score>=80, n=38): 16.3 career fights, 75% win rate, 53% finish rate
- MID-CARD (50-79, n=166):      12.4 fights, 65% win rate
- PRELIM (<50, n=411):           7.6 fights, 52% win rate
Finishers (>=70% finishes) avg placement 54.1 vs decision fighters (<=30%) 46.2 — small gap.

**Takeaway for the "formula":** the top of the card correlates most with TENURE (number of
fights) and WINNING, and only weakly with HOW you win (finishes). The big missing levers are
external: pay and social following (research below) + personality (qualitative).
Data coverage caveat: winner decided on 67% of legacy fights, method on 96%.

## STILL TODO (do in fresh window, cheaply)
1. WebSearch (snippets only, ~5-6 queries max):
   - Josh Hokit UFC identity + Instagram following (confirm personality framing).
   - A few Instagram counts: Conor, O'Malley, Paddy, Adesanya vs Evloev/Merab/Pantoja (to show
     follower-vs-placement mismatch).
   - UFC disclosed-purse main-event-vs-prelim gap + PPV points cliff + $50k bonuses (1-2 facts).
   - 1 Chael "placement is everything"-style quote + 1 Conor promo quote.
2. Generate P4P current (sort full CSV across all divisions by score) + historical P4P/divisions
   (run historical-placement-analysis.ts; for divisions use --asof snapshots, accept fuzziness).
3. Rewrite the article per points 2-9 above. Em-dash ban ([[feedback_blog_no_ai_tells]]) — use
   "-"/comma/colon. Sweep before saving.
4. Log to `docs/daily/2026-06-23.md`. Consider a memory for the cheap-research rule.

## Scripts are all read-only — nothing writes to prod DB. Safe to re-run.
