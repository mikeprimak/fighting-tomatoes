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
- `persist.ts` — fightId-anchored write against UPCOMING-only DB fights; upserts straight to DB (no review inbox). DB is authoritative for the card; LLM enriches each fightId from supplementary editorial (see Decisions §9).
- Migration `20260516000000_add_ai_fight_enrichment_fields` — added 6 nullable columns to `fights`.
- CLI: `scripts/enrich-event.ts --event-id <id> [--persist]` (default dry-run).
- Trigger: ✅ wired. Daily GitHub Actions cron at 14:00 UTC (`.github/workflows/fight-enrichment.yml` → `scripts/run-fight-enrichment.ts` → `services/aiEnrichment/run.ts`). Per-event T-10/T-5/T-2 window logic + 36h dedup live in `run.ts`.

**Phase 2 — Multi-surface render** — 🟡 IN PROGRESS
- ✅ Mobile fight cards: "Why care" line — shipped 2026-05-15 (`UpcomingFightCard`, single-line, ellipsized).
- ✅ Upcoming detail screen: `aiPreviewShort` italic one-liner + `aiTags.stakes[]` bullets — shipped 2026-05-18 (after hype-modal revert per `ee8d7e8`).
- ✅ Completed detail screen: same shape, mirrored from upcoming — shipped 2026-05-18 (`6b98ba9`). Renders regardless of spoiler-free mode (pre-fight content, no outcome).
- 📋 Web fight pages: full preview section (SEO) — uses `aiPreview` (currently null; Phase 1 only ships `aiPreviewShort`).

**Phase 3 — Engagement layers**
- Push notification copywriter (uses `aiPreview` + `aiTags`).
- Weekly digest email assembler.

**Phase 4 — Fan DNA**
- Personality engine using `aiTags` + base metadata (weight class, org, title flag, card position, rematch flag).
- Profile UI gated behind N ratings.

**Phase 5 — Beyond fights**
- Event-level enrichment (card narrative, "why this card matters"). _Not started._

**Phase 5a — Fighter profile enrichment** — 🟢 PIPELINE + CRON + SURFACES + PROVENANCE SHIPPED (2026-05-26)
A `Fighter.aiProfile*` set that catches a newbie up on a fighter: career arc, style, highlights, signature fights, the **draw** (`appeal` + `personaType`), and — per Mike — both `whyFansLove` AND `whyFansHate` ("share it all"; polarizing fighters draw both). Schema: migration `20260525000000_add_ai_fighter_profile_fields` (6 nullable cols: `aiProfile` JSONB, `aiProfileSummary`, `aiProfileEnrichedAt`, `aiProfileSourceUrls[]`, `aiProfileConfidence`, `aiProfileRecordAtEnrich`) + `20260527000000_add_ai_profile_source` (`aiProfileSource` — provenance). Mirrors the fight pipeline.
- LLM extractor: `services/aiEnrichment/fighterProfile/extractFighterProfile.ts` — Haiku 4.5; DB authoritative for identity+record (passed null when DB record is all-zeros so the model takes it from sources instead of asserting 0-0-0). **`whyFansHate` is constrained to IN-SPORT heel material only** (trash talk, ducking, controversial decisions, weight misses, dirty tactics) — no criminal/civil/political/personal-life content, even if well-documented (Mike's call after the McGregor test surfaced a rape civil ruling). Confidence floor 0.5.
- Bio fetcher: `fighterProfile/fetchFighterBio.ts` — different source ladder from fights (career depth): UFC athlete page (stealth, fresh page per fetch) + **Wikipedia action API** + Brave editorial/Sherdog/Tapology. Wikipedia + Sherdog/Tapology alone produce 0.75-0.9 confidence; UFC.com is supplementary (and `__name`-fails under tsx locally but works under the cron's ts-node).
- Persist: `fighterProfile/persistFighterProfile.ts` — additive, floor-gated, REPLACES `aiProfileSourceUrls` (single synthesized artifact, not accumulated). `fighterRecordKey()` snapshot = `W-L-D-NC`; cron re-enriches when the live record diverges from it.
- Single-fighter + orchestrator: `fighterProfile/enrichOneFighter.ts`, `fighterProfile/runFighterProfile.ts` — engagement-ranked selection from `fight_ratings` + follows (NOT the denormalized `totalRatings`), needs-work filter (never-enriched / record-changed / stale >180d), dedup, cap.
- Cron: `scripts/run-fighter-profile-enrichment.ts` + `.github/workflows/fighter-profile-enrichment.yml` (daily **18:00 UTC**, offset from 14:00 pre-fight / 16:00 post-fight). **Cron bar `min_ratings` = 25**; the one-time backfill bar was **≥100 ratings (367 fighters)** off the triage curve (`scripts/fighter-profile-triage.ts`).
- **Backfill = no-API Phase 6.5 pattern (Claude Code as LLM), per Mike** — not paid Haiku. `fighter-profile-dump.ts` fetches bios → author profiles by hand → `fighter-profile-write.ts` persists (floor + record-key; `--sources` pulls grounding URLs from the dump). Helpers: `-split.ts`, `-digest.ts`. **Top-367 backfill COMPLETE (2026-05-26):** wave 1 (top-25) + multi-window blocks A–H (`docs/HANDOFF-fighter-profile-backfill-multi-window-2026-05-26.md`). 369 fighters now carry hand-authored profiles. **Final reconciliation pass 2026-05-28** confirmed no stragglers above the cutoff: a default-mode dump (missing-profile only, engagement-ranked) returned its highest unwritten fighter at just **91 ratings** — below the ≥100 bar — so every top-367 fighter is covered; the ≥25-rating cron owns everything below.
- **Provenance / overwrite-protection (`aiProfileSource`, shipped 2026-05-26):** `persistFighterProfile()` now takes a required `source: 'handauthored' | 'cron-haiku'`. Hand-author writes stamp `'handauthored'`; the Haiku cron stamps `'cron-haiku'`. The cron's candidate filter has `AND aiProfileSource IS DISTINCT FROM 'handauthored'`, so **Haiku never re-touches a premium Opus bio** (even after a record change). Hand-author writes stay unconditional (confidence floor only), so **Opus always overwrites Haiku on conflict.** One-time backfill marked all 369 then-profiled rows `'handauthored'` (the cron had barely run; ≤ a couple of true cron-tail bios over-pinned, reconciled by the Opus re-author routine below). Tradeoff: a pinned Opus bio goes **stale** when the fighter fights again — Haiku won't refresh it, by design.
- Surfaces: `/api/fighters/:id` selects + serializes the fields (JSON needs `additionalProperties:true` or fast-json-stringify drops it). Mobile `app/fighter/[id].tsx` + web `FighterDetailClient.tsx` render an "About" section (tldr + summary + love/hate draw blocks, gender-neutral labels), confidence-gated 0.5. Web `generateMetadata` uses `aiProfile.tldr` for a richer indexable description. **Caveat:** the mobile fighter detail screen may not have a nav entry point yet (follow button is `false &&`-gated for the same reason) — verify reachability before relying on the mobile surface.

**Phase 5a — NEXT SESSION (two follow-ups, both deferred 2026-05-26):**
1. **Opus re-author routine for stale hand-authored bios.** A pinned `'handauthored'` bio now goes stale when the fighter fights again (Haiku won't refresh it — by design). Build a scheduled **Claude Code** routine (`/schedule`, Opus-as-LLM, no per-token API cost — same path as the backfill) that finds `aiProfileSource='handauthored'` rows whose live record ≠ `aiProfileRecordAtEnrich` (or > N days old), re-authors them, and re-writes via `fighter-profile-write.ts`. This is the intended way to keep premium bios current AND reconciles any cron-tail rows the one-time backfill over-pinned. Selection query = the cron's needs-work clause but filtered to `aiProfileSource='handauthored'` (inverse of the cron). **Do NOT switch the Haiku cron model to Opus** — blows the <$300/yr ceiling; the Claude Code routine is the cost-free path for the premium tier.
2. **Fix the Haiku prompt's em dashes.** Cron/Haiku bios emit em dashes (`—`), violating the house "no em dashes" blog/style rule (43 of 369 profiled rows had them pre-cleanup). Patch `extractFighterProfile.ts`'s system prompt to ban em dashes (prefer `-`, commas, colons) so the cron-tail bios match house style without a hand pass. Cheap, prompt-only.

**Phase 6.5 — Historic backfill campaign** — 🟢 INITIAL TARGET HIT (2026-05-20)
Triaged sweep of the 16K-fight legacy DB. **2,022 fights enriched** with full schema (pre + post long-form, structured tags both directions, ~500-600w/fight) — initial 2,000-fight hand-curated target reached across pilot batches + rounds 1 and 2 (10 parallel windows × 100 fights each, twice). Decision shifted from "Haiku via API" to **using Claude Code as the LLM directly** (Mike already pays for Claude Code; this is a one-off, not a cron; Opus 4.7 quality > Haiku 4.5 for narrative content). Pulled Phase 6 schema design forward — both pre-fight and post-fight long-form per fight because post-fight is the higher-value SEO surface for historic completed fights. Full multi-window protocol at `docs/HANDOFF-historic-enrichment-multi-window-2026-05-18.md`. Open: 25,834 rated fights still null (long tail, suitable for Haiku-via-API if/when needed); web + mobile rendering of the enrichment not yet shipped; parallel programmatic `ufcstats.com` sweep for winner/method/weightClass (97% gap on top-500) not started.

**Phase 6 — Post-fight enrichment** — 🟢 PIPELINE + CRON SHIPPED (2026-05-25)
Migration `20260518000000_add_ai_post_fight_enrichment_fields` added `aiPostFightTags` (JSONB), `aiPostFightSummary` (TEXT), `aiPostFightEnrichedAt` (TIMESTAMP). The recurring **T+5d recap pipeline now runs** — the manual Phase 6.5 historic campaign (2,022 fights) is no longer the only thing writing these columns.
Sibling to Phase 1, runs against COMPLETED fights instead of UPCOMING. Reuses the Phase 1 fetchers directly. Shipped surfaces:
- LLM extractor: `services/aiEnrichment/postFight/extractPostFightEnrichment.ts` — Haiku 4.5, `aiPostFight` JSON (`methodNarrative`, `momentDescription`, `bonuses[]`, `callouts[]`, `aftermath[]`, `fotyConsideration`) + long-form `summary`. Card carries the **authoritative DB result** (winner/method/round/time); the LLM narrates but never overrides it. Null-ish strings ("N/A", "none") coerced to null.
- Single-event enrich: `postFight/enrichOnePostFightEvent.ts` — loads COMPLETED card (winner-set, recap-missing), pulls ufc.com/Tapology/BKFC page + Brave editorial in `mode:'recap'`, persists.
- Persist: `postFight/persistPostFight.ts` — additive write to `aiPostFight*` only; confidence floor 0.5; appends recap URLs to `aiSourceUrls` (never clobbers pre-fight sources).
- Orchestrator: `postFight/runPostFight.ts` — selects COMPLETED events in the **T+5d → T+45d** window (older = historic campaign's job), per-fight dedup on `aiPostFightEnrichedAt`, most-recent first, default cap 25 events.
- Entry + cron: `scripts/run-post-fight-enrichment.ts` + `.github/workflows/post-fight-enrichment.yml` (daily **16:00 UTC**, offset from Phase 1's 14:00 to avoid Puppeteer contention).
- **Editorial fetcher change:** `fetchEditorialPreviews.ts` gained a `mode: 'preview' | 'recap'` option (default 'preview' — Phase 1 unchanged). 'recap' flips the Brave query to results/recap/highlights and stops excluding results URLs.
- **Deliberately diverged from the planned folder split:** did NOT move Phase 1 files into `preFight/` or hoist a `shared/` dir — that refactor risked breaking the live pre-fight cron for no functional gain. The pre-fight fetchers are already standalone modules; `postFight/` imports them directly.
- Cost: **~$0.025/event** (verified on UFC Allen vs. Costa — 12-fight card, all grounded against play-by-play recaps).
- Consumers (still TODO): closure-loop screens (Use Case F), weekly digest (E), completed-card detail FOTY sticker, post-fight push (D). Data now flows; rendering surfaces are the next session.

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

**10. Prompt rewrite to unblock pace + rematch inference (2026-05-17)**
Pace was populating on 6% of enriched fights (3/52 in Render, all "fast"), rematches were never flagged (0/52 with "rematch"/"trilogy" tokens). Root cause was prompt under-instruction, not data scarcity — the LLM read the hard "don't invent" rule and erred to null on every inferential field. Fix: new "Inference rules" section in SYSTEM_PROMPT that explicitly distinguishes safe stylistic inference (pace, styleTags, rematch detection) from narrative fabrication. The hard "don't invent" rule now scopes to STORY events ("fighter X said Y"), not analyst-level matchup reads. Required output: pace inference rubric (volume strikers → fast, technical → tactical, wrestlers → grinding), styleTags contrast tags ("striker vs grappler") emitted even when editorial doesn't spell it out, and a literal "rematch" / "trilogy" token in storylines on confirmed prior meetings. Verified on Jones vs Carranza 2 (3/3 pace, 1/3 rematch correctly) and Usyk vs Rico (main event got pace=fast + 2 style-clash tags; sparse-editorial undercards correctly stayed null). Unblocks `pace-affinity` and `rematch-fan` Fan DNA traits shipped same session. Commit `fa938e8`.

**9. DB is the authoritative card source; LLM enriches by fightId (2026-05-17)**
Original Phase 1 flow asked the LLM to extract fights from editorial text, then surname-matched the extractions back to DB rows. Two problems surfaced in prod: (a) 50/66 UPCOMING events had `ufcUrl` pointing to a promotion page (bkfc.com, pflmma.com, onefc.com, oktagonmma.com, etc.) that the dispatch didn't recognize as a backbone source, so those events ran editorial-only; (b) when editorial was sparse, the LLM filled gaps with fights it saw mentioned in adjacent-event articles — on 2026-05-17 the BKFC Palm Desert run hallucinated Till/Chalmers and Alex Terrible/Delano onto the wrong card. **Fix:** load the card from the DB by eventId, pass it to the LLM as the authoritative input, ask the LLM to enrich each fightId from supplementary editorial. Records with fightIds not in the card are dropped as ghosts. Eliminates the surname matcher entirely; works uniformly for all promotions. Side benefit: honest "no narrative" instead of empty padded records — previous "10/10 wrote" on PFL Brussels was 9 empty shells + 1 real record. Consumers unaffected (Fan DNA reads `aiTags.styleTags`/`aiTags.stakes` which were empty in the padded version anyway). Commit `2a01f76`.

## Status (2026-05-17)

- ✅ Broadcast discovery shipped (precedent).
- ✅ Phase 1 fight enrichment pipeline shipped: fetch (3 sources) → extract (Haiku 4.5) → match → persist. End-to-end run against MVP Rousey vs. Carano wrote 9/11 UPCOMING fights at $0.023.
- ✅ Phase 2.A shipped (`UpcomingFightCard` one-liner) — committed locally `f050c64`, **not pushed to prod**. Backend `/api/events?includeFights=true` Prisma select updated to include the 6 `ai*` fields.
- 🟡 Phase 2.B partial (`UpcomingFightModal` full one-liner) — wired, **uncommitted**.
- ✅ Cron trigger — three-pass cadence (T-10/T-5/T-2) shipped via daily GH Actions workflow.
- ✅ DB-as-card-source refactor (2026-05-17) — eliminated 76% coverage gap, killed hallucinated-card failure mode. See Decisions §9.
- 📋 Use cases B (stakes-bullets), G (web SEO) are the next two render targets.
- 📋 Phase 6 post-fight enrichment — design recorded; build queued as its own session once Phase 1 render quality is locked in.

## Open questions

- Do we cache LLM outputs and re-render, or re-call on every refresh? (Lean: cache, re-run only when fight schedule changes.)
- Single LLM call per fight, or per source then merge? (Lean: per fight, multi-source input — cheaper and the model handles synthesis well.)
- Render `aiPreview` raw or with a small "AI-generated" disclosure? (Lean: disclosure on web SEO pages for transparency; no disclosure on the in-app "why care" snippet since it reads as editorial.)
- Do we localize? (Defer — English only for now.)

## Session protocol

See `CLAUDE.md` → "AI Enrichment Sessions" for how to start a session on this workstream.
