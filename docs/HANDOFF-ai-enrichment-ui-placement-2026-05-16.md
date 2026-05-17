# Handoff — AI Enrichment UI placement, 2026-05-16

End of session 2026-05-15. Phase 1 pipeline shipped to DB + daily cron is live. **Nothing renders yet.** Next session picks render surfaces and wires up UI.

## Read first

1. `docs/areas/ai-enrichment.md` — area doc / source of truth. Roadmap, schema, decisions log all current.
2. `docs/daily/2026-05-15.md` (AI Enrichment section) — full account of yesterday's build.
3. This file.

You can skim the code if you want — the schema below is the only thing UI work actually needs.

## Where the system is right now

### Pipeline live (server-side)

- **Fetch → extract → match → persist** runs daily at 14:00 UTC via `.github/workflows/fight-enrichment.yml` (commit `fb0622a` on main).
- **3 passes per event:** T-10 days, T-5 days, T-2 days. Skipped if any fight on the event was enriched in the last 36h.
- **Cost:** ~$0.02/event. Projected ~$15/year.
- **Cron dry-run from 2026-05-15** processed 8 events successfully (UFC, OKTAGON, BKFC, Matchroom, ONE, PFL, Golden Boy). Real persists begin from the 2026-05-16 14:00 UTC run.

### One real event is fully enriched in DB

**MVP MMA 1: Rousey vs. Carano** (eventId `8a9ead55-657b-4175-845b-b63829f46581`, 2026-05-16). Nine UPCOMING fights have populated `ai*` fields, two undercard fights (Aline Pereira vs. Jade Masson-Wong, Chris Avila vs. Brandon Jenkins) are intentionally empty.

Use this event for all UI test renders — it's the only event with full real data until the cron's first persisting run lands tomorrow.

### Schema (what's on every Fight row)

```ts
fights.aiTags          // JSONB — see shape below
fights.aiPreviewShort  // text — 1-line "why care" snippet (the main render target)
fights.aiPreview       // text — reserved for future SEO/web, currently always null
fights.aiEnrichedAt    // timestamp — null if never enriched
fights.aiSourceUrls    // text[] — grounding URLs (audit trail; could surface as "Sources" link)
fights.aiConfidence    // float 0..1 — drop renders below threshold
```

`aiTags` JSON shape (every key may be missing/null/empty for low-coverage fights):

```ts
{
  stakes: string[],          // e.g. ["Netflix flagship MMA event", "comeback spectacle"]
  storylines: string[],      // e.g. ["Carano returns after 17 years away; last fought Cris Cyborg in 2009"]
  styleTags: string[],       // e.g. ["judo-based grappler vs striker", "comeback narrative"]
  pace: "fast"|"tactical"|"grinding"|null,
  riskTier: "lopsided"|"favorite-leans"|"pickem"|null,
  rankings: { red: number|null, blue: number|null } | null,
  odds: { red: string|null, blue: string|null } | null,  // strings like "-625"
  isMainEvent: boolean,
  cardSection: "EARLY_PRELIMS"|"PRELIMS"|"MAIN_CARD"|null,
  weightClass: string|null,
}
```

## The next session's job

Pick a render surface for `aiPreviewShort` (the one-liner) and ship it. Anything else (`aiTags.stakes`, `storylines`, etc.) is a stretch goal once a first surface is live.

### Render targets the area doc proposes (in priority order)

These are from `docs/areas/ai-enrichment.md` § "Use case inventory":

**A. Fight card "Why care" snippet** *(Tier 1 — recommended starting point)*

- Surface: every upcoming fight card in the mobile app
- Render: italic grey one-liner under the fighter names, e.g. *"Two pioneering MMA legends meet for the first time after a combined 27 years away from competition."*
- Closes the "I don't know these prelim fighters" gap
- Lowest-friction; touches one component

**B. Pre-fight stakes box on rating/hype screen** *(Tier 1)*

- Surface: hype modal / rating modal before submit
- Render: a small "Stakes" card showing `aiTags.stakes[]` as bullets
- Heavier UI work; touches modal screens

**G. SEO landing pages on web** *(Tier 3)*

- `packages/web` — long-form preview section on each fight detail page
- Use `aiPreview` (currently null — Phase 1 only ships `aiPreviewShort`) and structured tags for headings
- Bigger lift; defer until A is live and shipping value

### Recommended first move: A on the mobile fight card

Why A first:
- One component change (the card that lists upcoming fights)
- Visible to every user on every fight card scroll, not gated behind taps
- Easy to A/B-feel before/after on the Rousey card

How to wire it (rough plan, not prescriptive):

1. **Backend** — ensure `aiPreviewShort` and `aiConfidence` are in whatever query feeds the upcoming fight card. Likely `GET /api/fights` or `GET /api/events/:id`. May need to add the fields to the response shape if they're being filtered by `select`.
2. **Mobile** — find the upcoming-fight card component (in `packages/mobile/components/`), add a small italic grey line below the fighter row showing `aiPreviewShort` when present.
3. **Confidence floor** — don't render if `aiConfidence < 0.5`. Below that the LLM was hedging.
4. **Empty state** — if `aiPreviewShort` is null/empty, render nothing. The card should look the same as before. **Critical: no placeholder text, no skeleton, no "AI is thinking…" — silence is correct.**
5. **AI disclosure** — area doc says no disclosure on the in-app snippet (it reads as editorial). Decision is in `ai-enrichment.md` § "Open questions", confirmed for the in-app surface. Web SEO pages will need a small "AI-summarized" tag later.

## What's already in place vs what's missing

| | Status |
|---|---|
| Schema columns on Fight | ✅ migrated 2026-05-15 |
| Pipeline code | ✅ in `packages/backend/src/services/aiEnrichment/` |
| Cron firing daily | ✅ `.github/workflows/fight-enrichment.yml` |
| Real enriched data in DB | ✅ MVP Rousey vs. Carano (9 fights) |
| Backend API returning ai* fields | ❓ unknown — needs check |
| Mobile component rendering | ❌ not started |
| Confidence floor / empty-state policy | ❌ documented above, not implemented |
| Web preview rendering | ❌ Phase 2.G, deferred |

## Test plan for the next session

Before touching UI:
- [ ] Confirm `aiPreviewShort` lands in whatever API response feeds the upcoming-fight card. If not, that's the first backend change.

After wiring UI:
- [ ] Open the Rousey vs. Carano event detail in the mobile app. The 9 enriched fights should show their one-liners; the 2 unenriched undercard fights should look normal (no preview line, no placeholder).
- [ ] Open an event with **no** enrichment at all (e.g. any event >10 days out, like `UFC 329`) — confirm cards look exactly like they did before.
- [ ] Open the next UFC card after 2026-05-16 14:00 UTC has run. Those fights should now have their own previews.

## Gotchas + decisions to surface

1. **Empty is the norm, not the exception, for thin cards.** OKTAGON, PFL, and most non-UFC small-org events get structural enrichment but `aiPreviewShort` will often be empty. Don't optimize the UI for the rich case (Rousey); design for the long tail of empty.
2. **Three passes overwrite the same row.** A user who reads the T-10 line and re-opens at T-2 may see different copy. That's working as intended (better data → better line). No "last updated" marker needed; if you want one, `aiEnrichedAt` is there.
3. **`aiSourceUrls` is the audit trail.** Worth exposing somewhere quiet — maybe a long-press or a tiny "sources" link below the preview. Decide before shipping or punt explicitly.
4. **Rendering structured tags (`aiTags.stakes`, `storylines`) is a separate decision.** A is just `aiPreviewShort`. B (stakes box on rating modal) is where structured tags first surface. Don't try to do both in one session.
5. **BKFC Palm Desert had 2 LLM records / 0 DB matches** in yesterday's dry-run. There's a name-matching gap for that promotion. Not a UI concern — log it for a follow-up session if it keeps happening.

## Quick checks if something looks wrong

```bash
# Is the next cron run scheduled?
gh workflow view fight-enrichment.yml  # or: GitHub Actions UI

# Re-enrich one event manually (no schema changes, safe):
cd packages/backend
npx ts-node scripts/enrich-event.ts --event-id <id> --persist

# Dry-run to inspect output without writing:
npx ts-node scripts/enrich-event.ts --event-id <id>

# See a written row:
npx ts-node -e "import { PrismaClient } from '@prisma/client'; (async () => { const p = new PrismaClient(); const f = await p.fight.findFirst({ where: { aiPreviewShort: { not: null } }, include: { fighter1: true, fighter2: true } }); console.log(f); await p.\$disconnect(); })();"
```

## Files added 2026-05-15 (for context, no need to edit)

```
packages/backend/src/services/aiEnrichment/
  fetchUFCEventPreview.ts          # Puppeteer for ufc.com
  fetchTapologyEventPreview.ts     # fetch+cheerio for tapology.com
  fetchEditorialPreviews.ts        # Brave search across 9 MMA outlets
  extractFightEnrichment.ts        # Haiku 4.5 with structured output
  enrichOneEvent.ts                # single-event primitive
  persist.ts                       # UPCOMING-only matching + upsert
  run.ts                           # cron orchestrator with T-10/T-5/T-2 window logic
packages/backend/scripts/
  enrich-event.ts                  # manual single-event CLI
  run-fight-enrichment.ts          # cron entry point
  dump-ufc-event-preview.ts        # raw-text dump for source inspection
packages/backend/prisma/migrations/20260516000000_add_ai_fight_enrichment_fields/
  migration.sql                    # 6 new nullable columns on fights
.github/workflows/fight-enrichment.yml  # daily cron, 14:00 UTC
```

## What to expect first thing next session

1. Read the area doc + this handoff (5 min).
2. Decide: is A (mobile card one-liner) still the right first target? Or has Mike's priority shifted?
3. Check the backend response shape — does `aiPreviewShort` make it through? If not, add it.
4. Wire one component. Test on the Rousey card. Ship.

Don't over-design. The data sits there until something renders it; the user will get more signal from seeing the one-liner in the app than from spec'ing the perfect render surface.
