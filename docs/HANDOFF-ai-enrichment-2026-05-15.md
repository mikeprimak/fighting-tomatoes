# Handoff — AI Enrichment, 2026-05-15

Starting AI enrichment work in a fresh window. This doc bridges the conversation.

## Read first

1. `docs/areas/ai-enrichment.md` — area doc / source of truth. Roadmap, schema sketch, cost model, decisions log already in place.
2. `packages/backend/src/services/broadcastDiscovery/` — the *precedent*. Brave search + Claude Haiku 4.5 + JSON-schema extraction + admin review inbox, ~$1/run. Copy this pattern for every new enrichment job.
3. `CLAUDE.md` → "AI Enrichment Sessions" — session protocol.

## What's already shipped vs planned

- ✅ **Broadcast discovery** — the precedent, fully shipped.
- 📋 **Fight enrichment pipeline (Phase 1)** — planned but not started. This is where the user wants to begin.
- 📋 Phase 2 multi-surface render, Phase 3 engagement, Phase 4 Fan DNA, Phase 5 fighter/event enrichment — sequenced after Phase 1.

## What the user wants to build next (this session's direction)

Phase 1 of the existing roadmap, framed in the user's own words:

1. **Pre-event scan** — a job that scans the internet for info about upcoming fights, then with that data does many things:
   - Generates a brief summary per fight ("striker vs striker", "hype train vs grizzled vet"). Matches the planned `aiTags.styleTags` + `aiTags.storylines` and `aiPreviewShort` ("why care" snippet) in the area doc.
   - Feeds the personalization engine. ("you get hyped for striker vs wrestler" / "you rate back-and-forth battles highly"). This is the Fan DNA work in Phase 4 — depends on Phase 1 tags existing first.

2. **Post-event scan, ~5 days after** — *new idea, not yet in the area doc.* Scan the internet for **fan reactions in linguistic form** (Reddit threads, X posts, YouTube comments, MMA media coverage) and extract qualitative sentiment. This is a sibling to Phase 1 but on the *back* end of the fight. Adds to the closure-loop story: after the fight, the app can show *"fans called this 'fight of the night'"* alongside the user's own rating.

The 5-day delay matters: Reddit threads and post-fight analysis pieces aren't fully published immediately. Waiting 5 days catches the bulk of post-fight commentary without missing it to recency decay on social.

### Add to the area doc

The post-event fan-reaction scan should be added to the use case inventory (probably as Tier 1 item J or as a sibling to use case F "Closure-loop enrichment"). Suggested wording:

> **J. Post-event fan-reaction scan** — ~5 days after a fight, scan Reddit threads / MMA media / social for fan linguistic reaction. Extract sentiment tags ("instant classic", "snoozer", "robbery", "FOTN consensus"). Persist on the fight row. Surfaces in: closure-loop UI (alongside user's hype-accuracy comparison), Fan DNA training data (what kinds of fights *did* the community linguistically love?), retrospective recaps.

It also strengthens the closure-loop story shipped today (Hype vs Outcome) — qualitative fan reaction is richer than the community-rating number alone.

## Concrete next steps (start here in the new window)

The area doc says: *"Next concrete piece: source scraping module for UFC.com preview pages."* That's still the right first move. Pick one event (the next UFC card) and prove the loop end-to-end on a handful of fights before generalizing.

Order:

1. **Pick the scope** — one upcoming UFC card, all fights on it. Manual trigger first; cron later.
2. **Source scraping module** — start with UFC.com fight preview pages. Reuse existing scraper infrastructure where possible. Pull raw HTML/text per fight.
3. **LLM extractor** — Claude Haiku 4.5, structured output schema matching the `aiTags` shape in `docs/areas/ai-enrichment.md` line 74. Include `aiPreviewShort` (one-line "why care") and `aiPreview` (2-paragraph editorial).
4. **Persist** — add the columns to `Fight` per the schema sketch. New Prisma migration.
5. **Admin review inbox** — copy the broadcast-discovery pattern. Don't auto-render to users until a human approves the first batch.
6. **Spot-check first 10 outputs** — per the eval section of the area doc.

Only after Phase 1 ships do Phase 2 renders (mobile "why care" line) and Phase 4 Fan DNA become unblocked.

## Decisions to NOT relitigate

These are already locked in the area doc; don't reopen unless something material changes:

- Model = Claude Haiku 4.5 with prompt caching. Step to Sonnet only if quality demands.
- Pattern = search → fetch → LLM-extract → persist → admin review. Copy from broadcast discovery.
- Cost ceiling target = < $300/yr across all AI jobs.
- Fighter-style-from-historical-records is **dead** (only 9% coverage). Fan DNA depends on AI tags, not method records.
- Confidence floor: silent-skip below threshold, never crash the UI.

## Open questions worth raising in the new session

From the area doc, still unresolved:

- Cache LLM outputs vs re-call on refresh? (Lean: cache; re-run only on fight-schedule change.)
- Single LLM call per fight with multi-source input, vs per-source then merge? (Lean: single call, model handles synthesis.)
- "AI-generated" disclosure on rendered output? (Lean: disclosure on web SEO pages; no disclosure on in-app snippets.)

Plus a new one to add:

- Post-event scan timing — exactly 5 days, or event-type dependent? UFC cards generate post-fight discourse fast; smaller orgs may need 7-10 days for any meaningful coverage to exist.

## Cross-references

- `docs/areas/rewarding-users.md` — Fan DNA (Wave 3 of that workstream) depends on Phase 1 of this one. Hype vs Outcome (Wave 2, shipped today) gets richer row copy once tags exist (`Spot on a tactical chess match.`); per the 2026-05-16 rename, hype accuracy folds into Fan DNA as one trait.
- `docs/areas/follow-fighter.md` — fighter-context enrichment (Phase 5) drives "why care" notifications for followed-fighter matches.

## Session-end TODOs (carry into new window)

- Update `docs/areas/ai-enrichment.md` with the new use case J (post-event fan-reaction scan) and the new open question on scan timing.
- Pick the target UFC card and start the source scraping module.
