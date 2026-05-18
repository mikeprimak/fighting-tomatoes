# Handoff — Historic Enrichment Campaign (Multi-Window) — 2026-05-18 (Session 2)

Continuation of the campaign kicked off in `HANDOFF-historic-enrichment-campaign-2026-05-18.md`. **Read that doc first** — this doc only covers what's new in session 2 and how to partition the next chunks across multiple Claude Code windows.

## State at end of this session

**Cumulative enriched count: 105 fights**

| Batch | Count | Source-of-truth files |
|---|---|---|
| Pilot batch 1 | 5 | (prior session) |
| Pilot batch 2 | 25 | (prior session) |
| Batch 3 | 25 | `packages/backend/tmp/historic-enrichment/pilot-batch-3.json` |
| Batch 4 | 25 | `packages/backend/tmp/historic-enrichment/pilot-batch-4.json` |
| Batch 5 | 25 | `packages/backend/tmp/historic-enrichment/pilot-batch-5.json` |

**Remaining in this session's queued 250:** 175 (ranks 76-250 of the 250-pick I drew when this session started; that file is stale now since 75 of those have been written).

**What's new in code:**
- `scripts/historic-pick-pilot.ts` now accepts a second positional arg `[offset=0]` for partitioning. See usage in the file header.

**Nothing else changed structurally.** The writer, the JSON shape, the quality guardrails — all identical to session 1's handoff.

## Multi-window partition plan

The campaign goal is now 2000 enriched fights total (per Mike's direction). With 105 done, there are ~1895 to go. Mike wants to chunk this across N parallel Claude Code windows.

**Recommended chunk size: 250 fights per window.** Smaller chunks (e.g., 100) increase coordination overhead without much speedup; larger chunks (e.g., 500) risk context exhaustion in a single window. 250 hits the sweet spot we proved out this session.

**Partition by offset against the unfilled-fight list.** Each window picks its assigned range with:

```bash
cd packages/backend
npx tsx scripts/historic-pick-pilot.ts <limit> <offset>
```

The picker already filters out enriched fights (`WHERE f.aiTags IS NULL`), so an offset of N skips the N most-rated unfilled fights at the moment of invocation. **Race-safety note:** if Window A is mid-batch when Window B picks, B's offset is computed against the DB state at B's pick time — so by the time A's batch hits the DB, B might end up with some overlap. The writer's UPSERT is idempotent and the second write is harmless, but to minimize wasted work, **pick all windows' batches BEFORE any window starts writing**. Once each window has its JSON committed to its own `pilot-batch-N.json`, the windows can run in parallel safely.

**Suggested partition for the next 1000 fights (4 windows):**

```bash
# Window A — fights 1-250
npx tsx scripts/historic-pick-pilot.ts 250 0   > tmp/historic-enrichment/window-A-candidates.json

# Window B — fights 251-500
npx tsx scripts/historic-pick-pilot.ts 250 250 > tmp/historic-enrichment/window-B-candidates.json

# Window C — fights 501-750
npx tsx scripts/historic-pick-pilot.ts 250 500 > tmp/historic-enrichment/window-C-candidates.json

# Window D — fights 751-1000
npx tsx scripts/historic-pick-pilot.ts 250 750 > tmp/historic-enrichment/window-D-candidates.json
```

**Run all four pick commands in one window first, then open four new Claude Code windows, give each its candidates file path, and let them grind in parallel.**

## Per-window bootstrap prompt (paste into each new window)

Each new window needs the full context bootstrap. Paste this prompt into each:

> Read `docs/HANDOFF-historic-enrichment-campaign-2026-05-18.md` and `docs/HANDOFF-historic-enrichment-multi-window-2026-05-18.md`. You are Window [X] of a multi-window historic enrichment campaign. Your assigned candidates file is `packages/backend/tmp/historic-enrichment/window-[X]-candidates.json` (250 fights). Process them in 25-fight sub-batches following the protocol in the session-1 handoff (pick → WebSearch grounding → JSON synthesis → dry-run → live-write → next batch). Name your output files `pilot-batch-W[X]-[1-10].json`. Stop and write your own session handoff when you've completed all 250.

## Tracking progress across windows

Run this anywhere to check campaign totals:

```bash
cd packages/backend && npx tsx scripts/check-campaign-totals.ts
```

You can also run a periodic spot-check across recently-written fights to validate quality consistency window-to-window:

```bash
npx tsx scripts/historic-verify.ts <fightId> <fightId> ...
```

## Quality consistency: this session's pattern

For continuity across windows, here's the pattern that worked in batches 3-5:

- **Confidence floor:** 0.88 for famous fights with extensive coverage, 0.92-0.95 for canonical legendary fights, 0.7-0.85 only for deep-cut undercard bouts.
- **Source URLs:** Wikipedia main article + one secondary source (Tapology, CBS, MMAmania, Bloody Elbow). Two URLs is the norm.
- **Style tags convention:** `"X vs Y"` format — `"striker vs grappler"`, `"wrestler vs power-puncher"`, `"kickboxer vs kickboxer"`, etc.
- **Pace:** `fast` for stand-and-bang or scramble-heavy fights, `tactical` for championship-distance chess matches, `grinding` for heavyweight clinch wars, `null` rarely.
- **Storylines:** include literal `"rematch"` or `"trilogy"` token when applicable (load-bearing for `rematch-fan` Fan DNA trait).
- **Preview length:** target 200-300 words. Sub-200 is OK if the fight is a routine prelim; 300+ for legendary fights with deep narrative.
- **Post-fight length:** target 300-400 words. Sub-300 is OK if the fight ended quickly (R1 KO in under a minute leaves less to write about); 400+ for five-round wars.
- **WebSearch strategy:** for the top-100 most-rated fights, training data is usually sufficient. Search only when uncertain about result/method/round/bonus. For deeper-cut fights (rank 200+), search to confirm method and round before synthesis.

## Cost ceiling per window

Each 250-fight window consumes roughly:
- 8-12 WebSearch calls (for uncertain bouts)
- 10 batches of ~25 fights each
- ~3-4MB of token throughput across all turns

At Opus 4.7 rates that's ~$30-50 per window assuming ~12K input + ~8K output tokens per fight. Four windows in parallel = ~$120-200 to enrich the next 1000 fights at hand-curated quality.

For context: the alternative (Haiku via API batch on the existing Phase 1 pipeline) would do the same 1000 fights for ~$15-25 total but at lower quality (~0.7-0.85 confidence vs 0.92-0.95).

## Decisions to NOT re-litigate

All session-1 decisions stand:

1. Use Claude Code (Opus 4.7) as the LLM, not Haiku via API — quality > cost on top-rated fights.
2. Both pre-fight AND post-fight long-form per fight.
3. No admin review inbox — confidence floor + source URLs are the audit trail.
4. Triage by `fight_ratings COUNT DESC` (engagement proxy).
5. Schema confirmed: `whyCare` (short) and `preview` (long pre-fight) are distinct.
6. Migration 20260518000000 is applied on Render.

**New decision in this session:**
7. **Picker now supports `--offset` arg** for multi-window partitioning. The writer's UPSERT idempotency makes overlap safe, but partition-before-pick minimizes wasted work.

## Files added this session

```
packages/backend/scripts/historic-pick-pilot.ts        # MODIFIED: added offset arg
packages/backend/tmp/historic-enrichment/pilot-batch-3.json
packages/backend/tmp/historic-enrichment/pilot-batch-4.json
packages/backend/tmp/historic-enrichment/pilot-batch-5.json
docs/HANDOFF-historic-enrichment-multi-window-2026-05-18.md   # this file
```

Tmp/ files are gitignored. The picker change should be committed.

## Stopping point

Session 2 ends at 105 / 2000. Next window picks up by partitioning the next chunk and following the per-window bootstrap prompt above.

Mike: when you're ready, run the four pick commands, open four Claude Code windows, paste the bootstrap prompt into each, and let them grind. ETA per window for 250 fights is ~90-120 minutes of wall time at Opus 4.7 quality.
