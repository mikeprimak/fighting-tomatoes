# Handoff — broadcast discovery pickup 2026-05-12

End of day 2026-05-11. Picking up tomorrow.

## Where the system is right now

### The weekly cron is live and healthy

- `.github/workflows/broadcast-discovery.yml` runs Mondays 09:00 UTC
- Anthropic credits topped up today; auth errors now fail loud (extract.ts patched)
- Auto-apply step runs after the main discovery, applying findings with confidence ≥ 0.90 additively
- Source pages cached for UFC, ONE, BKFC, PFL, Karate Combat in `fetchHowToWatch.ts`

### Schema is section-aware

- `PromotionBroadcastDefault` and `BroadcastDiscovery` both have a `cardSection` column (`EARLY_PRELIMS | PRELIMS | MAIN_CARD | null`)
- `null` = "Fallback" (relabeled from "Whole Event"). Used when no section-specific data exists for that (promotion, region)
- Backend resolver drops Fallback rows when section-specific rows exist for the same (promotion, region) — prevents the dual How-to-Watch card display we hit today
- Unique constraint: `(promotion, region, channelId, cardSection)` with `NULLS NOT DISTINCT`

### Admin UI is functional

- Discovery cards show the full (org × country) section tree with the suggested channel highlighted in cyan in its target section
- Add / Replace are distinct actions (Replace deactivates siblings only within the same section)
- Create Channel button on cards whose suggested channel doesn't exist yet — pre-fills the channel modal, and backend auto-resolves the discovery row on save
- Reject and Duplicate both suppress for 90 days

### Today's auto-applied UFC defaults (6 of them)

⚠️ **These came from ufc.com's UFC 328 page → they're NUMBERED-event broadcasters.** Once event-type support lands tomorrow, retag them.

| Org | Region | Section | Channel | Tier |
|---|---|---|---|---|
| UFC | US | Prelims | Paramount+ | SUB |
| UFC | US | Main Card | Paramount+ | SUB |
| UFC | US | Main Card | CBS | FREE |
| UFC | AU | Prelims | Paramount+ | SUB |
| UFC | AU | Main Card | Foxtel | PPV |
| UFC | AU | Main Card | Kayo Sports | PPV |

## What's still in the admin inbox to triage

**10 PENDING UFC section findings** as of EOD 2026-05-11. Lower-confidence (0.65–0.88) so they didn't auto-apply. Includes:

- UFC NZ Main Card → Sky Sport Now (new channel, 0.75)
- UFC NZ Prelims → TVNZ+ (0.88)
- UFC NZ Main Card → TVNZ+ as PPV (0.85 — weird tier, worth a source check)
- UFC EU Fallback → Discovery+ (new channel, 0.90)
- UFC CA Fallback → TVA Sports (0.88)
- UFC AU Early Prelims → UFC Fight Pass + Paramount+ (0.75)
- UFC AU Prelims → Network 10 (Free, 0.75)
- UFC CA Early Prelims → UFC Fight Pass (0.65)

To review: `https://fightcrewapp-backend.onrender.com/admin.html` → Broadcasts tab → Pending filter.

## Tomorrow's top priority

**Implement UFC numbered vs Fight Night event types.** Plan written: `docs/plans/ufc-event-type-numbered-vs-fight-night-2026-05-11.md`. Estimated 3–4 hours focused work. Mirrors the cardSection migration pattern shipped today.

After that lands, the immediate follow-ups are:

1. Re-tag the 6 numbered-event defaults applied today with `eventType=NUMBERED`
2. Run a Fight Night-targeted discovery pass to populate `eventType=FIGHT_NIGHT` defaults
3. Triage the remaining PENDING inbox with event-type awareness

## To test in the mobile app

Before any new work, verify today's fixes landed:

- [ ] Open the mobile app, navigate to a UFC AU event → confirm only **one** How-to-Watch card above each section (not the dual-card bug)
- [ ] Same for a UFC US event
- [ ] UFC NZ events should still show three Fallback broadcasters (UFC Fight Pass, TVNZ+, Sky Sport NZ) until section-specific entries are applied — that's expected, not a bug
- [ ] MVP MMA 1 (May 16) — open event detail, confirm Netflix shows up

Backend changes are live on Render auto-deploy; mobile uses these via React Query so should pick up on next refresh without an EAS update.

## Lower-priority follow-ups stacked

- **Zuffa Boxing NZ default** — Sky Sport NZ likely the right pick (no upcoming Zuffa NZ user yet, deferred)
- **RAF international gap** — Fox Nation is US-only; could surface a "not available in your region" hint for other regions
- **Past-events HowToWatch** — completed event screens don't show replay info; "Replays on X" could render when source supports it
- **EU country-specific broadcasters** — separate plan at `docs/plans/eu-country-specific-broadcasters-2026-05-11.md`. Deferred until European installs grow or user complaint.
- **Fallback cleanup pass** — when section-specific defaults cover every section for a (promotion, region), the legacy cardSection=null rows for the same channels are dead data. Resolver already hides them, but a cleanup script would tidy the data.

## Quick commands

Trigger discovery on demand (from any session):

```bash
curl -X POST \
  -H "Authorization: token $(cat github-key.txt)" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/mikeprimak/fighting-tomatoes/actions/workflows/broadcast-discovery.yml/dispatches" \
  -d '{"ref":"main","inputs":{"promotions":"UFC","skip_fresh_days":"0"}}'
```

Inspect inbox state:

```bash
cd packages/backend && npx tsx prisma/inbox-summary.ts
```

Run auto-apply manually:

```bash
cd packages/backend && AUTO_APPLY_DRY_RUN=1 npx tsx scripts/auto-apply-discoveries.ts
# Remove the env var to actually apply
```

Audit upcoming-event coverage:

```bash
cd packages/backend && npx tsx prisma/audit-upcoming-coverage.ts
```
