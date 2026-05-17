# Handoff — AI Enrichment cron → "hands-off MVP today"

End-of-session 2026-05-17. Mike wants the AI enrichment pipeline running on autopilot for **all promotions, all upcoming fights** so he can go hands-off and the Fan DNA tag-aware traits get fed continuously. **Surprise:** the cron is already live. This handoff captures the real state, the gaps, and the short list to hit MVP today.

## Read first

1. `docs/areas/ai-enrichment.md` — source of truth, but **stale on cron status** (says "not implemented"; it is).
2. `docs/HANDOFF-tag-aware-personality-2026-05-17.md` — what consumes the enrichment output (Fan DNA traits).
3. This file.

## Current state (verified 2026-05-17 ~18:30 local)

### The cron is shipped + active

| Aspect | Reality |
|---|---|
| Workflow file | `.github/workflows/fight-enrichment.yml` — exists, `state: active` |
| Schedule | Daily at 14:00 UTC (cron `0 14 * * *`); actual fire time drifts to ~14:51 UTC |
| Trigger script | `packages/backend/scripts/run-fight-enrichment.ts` |
| Orchestrator | `packages/backend/src/services/aiEnrichment/run.ts` (`runFightEnrichment`) |
| Per-event primitive | `packages/backend/src/services/aiEnrichment/enrichOneEvent.ts` |
| Recent runs | 2026-05-17 14:51 UTC ✅, 2026-05-16 14:51 UTC ✅, 2026-05-16 01:11 UTC manual ✅ |
| Secrets confirmed live | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `BRAVE_API_KEY` (runs exit 0 with these checked) |

### Today's run summary (2026-05-17 14:51 UTC, run id 25994099600)

```
candidates: 66 UPCOMING events
ran:        4 events
skipped:    62 (most "recently-enriched 24h ago" or "out-of-window")
errors:     0
totalCostUsd: ~$0.04
```

Per-event detail (sampled from the log):
- **2 events wrote 10 fights each, 100% matched** — pipeline working.
- **BKFC 90 (Tierny vs Franco) + Jones vs Carranza 2 (BKFC?)** — 2 unmatched extractions, 0 wrote. **Investigate.** Likely Tapology URL detection or pair-matching delta.
- **OKTAGON 94: Frankfurt** — skipped before extraction.

### What `runFightEnrichment` actually does (read `run.ts` for the full version)

1. Pull all UPCOMING events.
2. For each event, compute `daysUntil`. Eligible windows: T-10 (6-10d), T-5 (3-5d), T-2 (0-2d). Else skip with `out-of-window`.
3. Dedup: if any fight on the event has `aiEnrichedAt < 36h ago`, skip with `recently-enriched`.
4. Dispatch to `enrichOneEvent` (promotion-aware: UFC → Puppeteer+UFC.com+editorial; everything else → Tapology+editorial).
5. Persist matched extractions; non-zero exit only on fatal setup failure, not per-event errors.

### Coverage: what runs automatically

| Promotion | Source backbone | Editorial layer | Status |
|---|---|---|---|
| UFC | UFC.com via Puppeteer/stealth | Brave (9-outlet allowlist) | ✅ Confirmed writing rows |
| Anything with a `Tapology` `ufcUrl` | Tapology fetch+cheerio | Brave | ✅ Mostly working — BKFC + Jones vs Carranza 2 had matching gaps today |
| Anything else (no `ufcUrl`) | Editorial only | Brave | ⚠️ Will only enrich if editorial covers it |

**The orchestrator already covers all promotions and all upcoming fights** in the cadence windows. There's no per-promotion gate.

### DB coverage right now

- 52 fights have `aiTags` populated (checked 2026-05-17).
- Of those, 20 have non-empty `stakes[]`, 0 mention `rematch` anywhere, most have `pace: null`.
- Vocabulary is rich for title fights, comebacks, debuts, style clashes; thin elsewhere.

## What's left to call this MVP today

### 1. Fix the source-of-truth doc (5 min)

`docs/areas/ai-enrichment.md` has these stale lines:

- Line 14: "cron not yet wired" → cron is shipped, daily 14:00 UTC
- Line 59: "Trigger: **not yet wired**. Plan: T-10d, T-5d, T-2d passes per event" → trigger is wired exactly as planned
- Line 142: "📋 Cron trigger — three-pass cadence (T-10/T-5/T-2) decided but not implemented" → ✅ shipped

Action: change to ✅ and note `.github/workflows/fight-enrichment.yml`.

### 2. Investigate today's 2 failed-match events (~30 min)

Two events extracted but matched 0 fights:
- BKFC 90 Birmingham (Tierny vs Franco) — 0 unmatched but 0 wrote — likely a dryRun or empty-extraction path
- Jones vs Carranza 2 — 2 unmatched records (Till vs Chalmers extracted but no DB hit)

Pull the full run log and check what the LLM extracted vs what's in DB for those events:

```bash
TOKEN=$(cat github-key.txt)
curl -sL -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/jobs/76405433926/logs" \
  | grep -B2 -A40 "BKFC 90\|Jones vs. Carranza"
```

Probable cause: `persist.ts` matches by surname-anchored pair against UPCOMING fights. If the DB fight name punctuation differs (e.g. "Till vs Chalmers" vs "Darren Till vs. Aaron Chalmers"), the match fails. The fix lives in `packages/backend/src/services/aiEnrichment/persist.ts`.

### 3. Decide observability bar (15-60 min depending on choice)

Options for "I can see this is running" without opening GH Actions:

- **A. Nothing extra.** GH Actions UI + email notifications on failure are already wired. Acceptable for solo dev.
- **B. Admin page row.** Add an `Enrichment` widget to `https://<backend-host>/admin.html` showing: last run timestamp, candidates/ran/skipped/errors, cost, last 5 runs. Reuses the same "health widget" pattern from the retroactive results admin work. ~45 min.
- **C. Daily Slack/email summary.** Resend already wired; add a post-run hook in `run-fight-enrichment.ts` that fires a one-line summary. ~30 min.

Mike's pattern in other workstreams (retroactive results, Phase 2 broadcast discovery) → **option B**. Recommend B.

### 4. Verify per-promotion coverage (~20 min)

Run an audit query:

```sql
SELECT e.promotion,
       COUNT(*) FILTER (WHERE f."aiTags" IS NOT NULL) AS enriched,
       COUNT(*) AS total
FROM "Event" e
JOIN "fights" f ON f."eventId" = e.id
WHERE e."eventStatus" = 'UPCOMING'
GROUP BY e.promotion
ORDER BY total DESC;
```

This tells you which promotions are getting fed and which aren't. Any promotion at 0% enriched after a week of cron runs is a coverage gap worth filing.

### 5. (Optional) Tighten the dedup window (~5 min)

`FRESH_THRESHOLD_HOURS = 36` in `run.ts`. With daily cron + 3-window cadence, this means an event in T-5 enriched today won't re-enrich for 36h. If you want each pass (T-10 → T-5 → T-2) to fire even when consecutive, drop the threshold to `20h`. **Recommend leaving at 36 for v1** — cheaper and the windows are 4-5 days apart anyway, so it doesn't suppress passes.

## Files / commands cheat sheet

```
Service:
  packages/backend/src/services/aiEnrichment/
    run.ts                  ← orchestrator
    enrichOneEvent.ts       ← per-event primitive
    extractFightEnrichment.ts ← LLM call (Haiku 4.5)
    persist.ts              ← surname-anchored matcher
    fetchUFCEventPreview.ts ← Puppeteer + stealth
    fetchTapologyEventPreview.ts
    fetchEditorialPreviews.ts ← Brave search

CLI:
  packages/backend/scripts/run-fight-enrichment.ts     ← cron entry point
  packages/backend/scripts/enrich-event.ts             ← single-event ad-hoc

Workflow:
  .github/workflows/fight-enrichment.yml  ← daily 14:00 UTC
```

### Manual dispatch

```bash
TOKEN=$(cat github-key.txt)
curl -X POST -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/fight-enrichment.yml/dispatches" \
  -d '{"ref":"main"}'
```

Or with overrides (dry-run, ignore window, single event):

```bash
curl -X POST -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/fight-enrichment.yml/dispatches" \
  -d '{"ref":"main","inputs":{"dry_run":"1","only_event_id":"<UUID>","ignore_window":"1"}}'
```

### Local dry-run

```bash
cd packages/backend
AI_ENRICHMENT_DRY_RUN=1 npx ts-node --transpile-only scripts/run-fight-enrichment.ts
```

## Why this matters for the Fan DNA work

Every tag-aware Fan DNA trait reads `Fight.aiTags`. The two trait-aware traits live today are `style-clash` (reads `aiTags.styleTags`) and `stakes-aware` (reads `aiTags.stakes`). More are queued (`pace-affinity`, `rematch-fan`) but their effectiveness is **directly gated by enrichment coverage**. The cron running daily means the coverage grows automatically as new cards get booked — no human-in-the-loop.

## Quick state check (run this first when picking up)

```bash
# Last 3 enrichment runs
TOKEN=$(cat github-key.txt)
curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/fight-enrichment.yml/runs?per_page=3" \
  | grep -E '"status"|"conclusion"|"created_at"|"event"'

# Current enriched-fight count
node --env-file=packages/backend/.env -e "
import('@prisma/client').then(async ({ PrismaClient }) => {
  const p = new PrismaClient();
  const n = await p.fight.count({ where: { aiTags: { not: null } } });
  console.log('enriched:', n);
  await p.\$disconnect();
});
"
```

## Pick-up summary

> The cron is live; today's run wrote 20 fights at $0.04. MVP-today work is: (1) fix the stale source-of-truth doc, (2) chase the 2 events that extracted but failed to match (likely surname-pair edge case in `persist.ts`), (3) decide observability bar (recommend a small admin-page widget — option B above), (4) audit per-promotion coverage so you know which promotions are getting fed. None are blockers — the system is already running hands-off.
