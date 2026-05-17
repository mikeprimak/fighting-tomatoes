# AI Enrichment

A first-class workstream: use LLMs to extract structured, narrative metadata from scraped sources, then surface that data across the app to deepen user engagement and context.

## North Star

Good Fights becomes the app that doesn't just rate fights — it tells you *why every fight matters*. Squeeze every ounce of contextual value out of AI and deliver it to users.

## Existing AI usage (precedent)

| Job | Files | Cost | Status |
|-----|-------|------|--------|
| Broadcast discovery | `packages/backend/src/services/broadcastDiscovery/` | ~$1/weekly run (Brave + Claude Haiku 4.5) | Shipped — admin review inbox |
| Fight enrichment (Phase 1) | `packages/backend/src/services/aiEnrichment/` | ~$0.023/event × 3 passes/event ≈ $21/year | Shipped to DB — no review inbox; cron live (`.github/workflows/fight-enrichment.yml`, daily 14:00 UTC) |

Pattern: **search → fetch → LLM-extract with structured output → diff against current state → persist for review → admin applies.** This is the template all future enrichment jobs follow.

## Architectural pattern

```
[source scraping] → [LLM enrichment w/ JSON schema] → [persist on entity] → [render in multiple surfaces]
```

1. **Source scraping** — gather raw text from per-feature sources (fight previews, fighter bios, event articles). Reuse existing scrapers + Brave Search where possible.
2. **LLM enrichment** — Claude Haiku 4.5 with prompt caching; structured output schemas; confidence scores.
3. **Storage** — persist as JSON column on the target row (e.g. `Fight.aiTags`, `Fighter.aiProfile`). Include `aiEnrichedAt`, `aiSourceUrls`, `aiConfidence`.
4. **Multi-surface rendering** — mobile cards, web app, push notifications, SEO pages, Fan DNA math.

Default model: **Claude Haiku 4.5** (cheap, structured output reliable, prompt caching). Step up to Sonnet only when quality warrants.

## Use case inventory

### Tier 1 — Direct user context (highest leverage)
- [x] **A. Fight card "Why care" snippet** — one-line context on every upcoming fight card. Shipped 2026-05-15 on `UpcomingFightCard` (single-line, ellipsized, confidence floor 0.5). Backend select fixed on `/api/events?includeFights=true`.
- [~] **B. Pre-fight stakes box** — editorial context on the rating screen. Hype modal variant (full one-liner under fighter row) wired 2026-05-15, **uncommitted**. Stakes-bullets card from `aiTags.stakes[]` still TODO.
- [ ] **C. Fan DNA fuel** — feeds the personality engine. Replaces the failed fighter-style-from-records approach (see Decisions §1).

### Tier 2 — Engagement
- [ ] **D. Smart push notifications** — fight-specific copy. "Tonight: rematch of last year's FOTY" beats "UFC 328 is live."
- [ ] **E. Weekly digest** — top storylines email via Resend.
- [ ] **F. Closure-loop enrichment** — post-fight context shown alongside hype-accuracy comparison.

### Tier 3 — Growth & moats
- [ ] **G. SEO landing pages** — long-form fight previews on web. Every fight card spawns ~12 indexed pages. Probably the best organic growth lever in this list.
- [ ] **H. Tag-based discovery** — browse by rematch / title / style.
- [ ] **I. Marketing copy reuse** — Reddit posts, ads, store copy.

## Roadmap

**Phase 1 — Fight enrichment pipeline** (foundation) — ✅ SHIPPED 2026-05-15
- Sources implemented:
  - `fetchUFCEventPreview.ts` — UFC events (Puppeteer + stealth against ufc.com JA3 protection)
  - `fetchTapologyEventPreview.ts` — non-UFC events (plain fetch+cheerio)
  - `fetchEditorialPreviews.ts` — Brave search across 9-outlet allowlist, replaces single-site MMA Fighting search
- `extractFightEnrichment.ts` — Claude Haiku 4.5, structured-output JSON, prompt caching on system prompt, hard rule against fabrication.
- `persist.ts` — pair-agnostic surname-anchored matching against UPCOMING-only DB fights; upserts straight to DB (no review inbox).
- Migration `20260516000000_add_ai_fight_enrichment_fields` — added 6 nullable columns to `fights`.
- CLI: `scripts/enrich-event.ts --event-id <id> [--persist]` (default dry-run).
- Trigger: ✅ wired. Daily GitHub Actions cron at 14:00 UTC (`.github/workflows/fight-enrichment.yml` → `scripts/run-fight-enrichment.ts` → `services/aiEnrichment/run.ts`). Per-event T-10/T-5/T-2 window logic + 36h dedup live in `run.ts`.

**Phase 2 — Multi-surface render** — 🟡 IN PROGRESS
- ✅ Mobile fight cards: "Why care" line — shipped 2026-05-15 (`UpcomingFightCard`, single-line, ellipsized).
- 🟡 Mobile hype/rating modal: full one-liner under fighter row — wired 2026-05-15, **uncommitted**. Stakes-bullets card still TODO.
- 📋 Web fight pages: full preview section (SEO) — uses `aiPreview` (currently null; Phase 1 only ships `aiPreviewShort`).

**Phase 3 — Engagement layers**
- Push notification copywriter (uses `aiPreview` + `aiTags`).
- Weekly digest email assembler.

**Phase 4 — Fan DNA**
- Personality engine using `aiTags` + base metadata (weight class, org, title flag, card position, rematch flag).
- Profile UI gated behind N ratings.

**Phase 5 — Beyond fights**
- Fighter profile enrichment (career arc, style summary).
- Event-level enrichment (card narrative, "why this card matters").

## Schema (Phase 1 — shipped)

```prisma
model Fight {
  // existing fields...
  aiTags         Json?     // { stakes[], storylines[], styleTags[], pace, riskTier, rankings, odds, isMainEvent, cardSection, weightClass }
  aiPreviewShort String?   // 1-line "why care" snippet for in-app surfacing
  aiPreview      String?   // longer editorial blurb (reserved for future SEO/web)
  aiEnrichedAt   DateTime?
  aiSourceUrls   String[]  // grounding URLs used for the extraction
  aiConfidence   Float?    // 0-1, drop renders below threshold
}
```

`aiTags` is JSONB. The shape is set by `extractFightEnrichment.ts` and consumed by `persist.ts` — keep them in sync.

## Cost model

| Job | Per-run cost | Frequency | Annual |
|-----|--------------|-----------|--------|
| Broadcast discovery | ~$1 | Weekly | ~$50 |
| Fight enrichment — Phase 1 (actual) | $0.023/event | 3 passes × ~6 events/wk | ~$21 |
| Fighter profile enrichment (est.) | ~$5 backfill, then incremental | One-shot + on-demand | <$50 |

Total AI ceiling target: **< $300/year**. Phase 1 actuals well under estimate (rich-event Rousey vs Carano measured 2026-05-15).

## Quality / eval

- Spot-check first 10 outputs of every new schema before scaling.
- Maintain a hand-tagged eval set of ~20 fights; re-run on schema changes to catch regressions.
- Confidence floor per use case: below threshold → don't render (silent skip), don't break the UI.

## Decisions log

**1. Don't derive fighter style from historical fight records (2026-05-14)**
Data check showed only 9% of fighters on upcoming cards have ≥5 historical fights with method recorded in the DB. AI preview enrichment delivers richer signal (narrative > average) with near-100% coverage on cards that matter. Method-record-based style derivation deferred indefinitely.

**2. Fan DNA shifts to metadata + AI tags, not fighter style (2026-05-14)** *(originally "Hype DNA"; renamed 2026-05-16)*
Personality engine inputs: weight class, org, title flag, main vs prelim, rematch, gender, ranking gap — plus `aiTags` once Phase 1 ships. Fighter style returns as a *bonus dimension* only if we backfill ufcstats methods later.

**3. Three enrichment passes per event: T-10d, T-5d, T-2d (2026-05-15)**
Editorial coverage drops as the event approaches. A single weekly cron misses both the early baseline and fight-week stories. Three passes per event: T-10 gets baseline structure (light coverage, mostly Tapology backbone + early articles), T-5 picks up the bulk of preview articles, T-2 catches fight-week stories and late replacements. Each pass overwrites the prior `aiTags`/`aiPreviewShort`; `aiEnrichedAt` records which pass produced the current row. Implementation deferred — needs a scanner that finds events at those windows and dispatches `enrich-event.ts`.

**4. No admin review inbox for AI enrichment (2026-05-15)**
Broadcast discovery uses a review inbox because broadcaster facts are wrong/right. AI narrative is soft — confidence floor + `aiSourceUrls[]` provenance is sufficient audit. The LLM honesty rule (empty arrays when ungrounded) means low-coverage events produce silence, not fabrication. If render-side quality slips, we can add review later without restructuring.

**5. Match LLM records only against `fightStatus = UPCOMING` (2026-05-15)**
Stale CANCELLED rows are a real footgun. Rousey vs. Carano had 49 DB rows / 38 CANCELLED — Tapology re-imports leave dead matchups behind. Persist matches UPCOMING-only to avoid writing enrichment to scratched bouts. Surfaced by reality check on first persist dry-run.

**6. Promotion-aware source dispatch (2026-05-15)**
UFC events → `fetchUFCEventPreview` (Puppeteer, JA3-protected host) + `fetchEditorialPreviews` (Brave). Everything else → `fetchTapologyEventPreview` (plain fetch) + `fetchEditorialPreviews`. Single code path through `extractFightEnrichment`. Editorial allowlist: mmafighting, mmajunkie, bloodyelbow, sherdog, espn, mmamania, mmaweekly, cbssports, bjpenn. One article per domain, top N.

**7. Hype square + flame stretch with card body when preview is present (2026-05-15)**
On `UpcomingFightCard`, the left aggregate-hype square and the right user-hype flame are absolutely positioned. To keep the AI preview from visually extruding below them when the card grows, the squares' positioned ancestor was moved to a new outer wrapper and their fixed `height: 50` was replaced with `top: 6/20, bottom: 6` so they stretch with the full card body. Names + images stay put because the inner View's `minHeight: 62` + `justifyContent: 'center'` is untouched (preview is a sibling outside it). Side effect: when a preview is present, the colored heatmap fill on the left square becomes a taller vertical pill rather than a 48×50 square. Mike accepted this on review.

**8. Card variant uses single-line ellipsized preview; modal variant uses full multi-line (2026-05-15)**
The card is dense and lives in a scrolling list — long previews truncate at the line. The hype modal has more room and is the moment the user is *deciding* about the fight, so they get the full one-liner. Two distinct visual contracts for the same field. If a third surface needs different treatment, follow this pattern.

## Status (2026-05-15)

- ✅ Broadcast discovery shipped (precedent).
- ✅ Phase 1 fight enrichment pipeline shipped: fetch (3 sources) → extract (Haiku 4.5) → match → persist. End-to-end run against MVP Rousey vs. Carano wrote 9/11 UPCOMING fights at $0.023.
- ✅ Phase 2.A shipped (`UpcomingFightCard` one-liner) — committed locally `f050c64`, **not pushed to prod**. Backend `/api/events?includeFights=true` Prisma select updated to include the 6 `ai*` fields.
- 🟡 Phase 2.B partial (`UpcomingFightModal` full one-liner) — wired, **uncommitted**.
- ✅ Cron trigger — three-pass cadence (T-10/T-5/T-2) shipped via daily GH Actions workflow.
- 📋 Use cases B (stakes-bullets), G (web SEO) are the next two render targets.

## Open questions

- Do we cache LLM outputs and re-render, or re-call on every refresh? (Lean: cache, re-run only when fight schedule changes.)
- Single LLM call per fight, or per source then merge? (Lean: per fight, multi-source input — cheaper and the model handles synthesis well.)
- Render `aiPreview` raw or with a small "AI-generated" disclosure? (Lean: disclosure on web SEO pages for transparency; no disclosure on the in-app "why care" snippet since it reads as editorial.)
- Do we localize? (Defer — English only for now.)

## Session protocol

See `CLAUDE.md` → "AI Enrichment Sessions" for how to start a session on this workstream.
