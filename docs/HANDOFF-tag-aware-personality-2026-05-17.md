# Handoff — Tag-aware Fan DNA personality (Phase 2 of Wave 3)

End of session 2026-05-16. Phase 1 scaffolding shipped + 5 traits live + the rate/hype reveal-modal "first-rater" race fixed. **Next session picks up the layer that quotes the fight's character.**

## Read first

1. `docs/areas/rewarding-users.md` § "Wave 3 — Fan DNA personality engine" — roadmap.
2. `docs/areas/ai-enrichment.md` § "Schema" — what's actually on `Fight.aiTags`.
3. This file.

## What's already shipped (don't redo)

| Layer | Status | Shipped |
|---|---|---|
| File-per-trait registry + engine | ✅ | `9e14040` |
| Peek endpoint (instant reveal) | ✅ | `949785c` / `2c28f57` |
| Trailblazer trait (first/early) | ✅ | `44143fe` |
| Rating-bias as primary on rate path | ✅ | `c42eaeb` |
| Hype-bias (rating-bias mirror for hype) | ✅ | `1298739` |
| Hype-accuracy (closure-loop, dramatic-only) | ✅ | `c42eaeb` (rescoring) |
| Org-affinity (needs batchCompute — never run) | 🟡 | `017ec27` (live but silent) |
| Session-streak, night-owl, promotion-debut | ✅ | `ea98a7b` |
| Reveal modal "first to rate/hype" race | ✅ | `454f3e2` / `f5cdc75` |

5 traits firing reliably, plus org-affinity dormant pending batchCompute cron.

## What this session is building

**Tag-aware copy.** The traits we have now compare numbers (your rating vs room, first-hyper, time-of-day, etc.). The next layer reads `Fight.aiTags` so the engine can quote the *fight's character*:

- *"You hyped this a 9 — striker vs grappler is your kind of math."*
- *"A 10 on a rematch. Fan of unfinished business."*
- *"Hyped the Netflix card 8 — you show up for the spectacles."*
- *"Heavyweight slugfest at 9. Big-man fights get the big-number treatment."*

This is **Layer 2** from the architecture conversation — rules-based traits that *read* AI tags but still pick from a static copy pool. Layer 3 (LLM-generated lines) is later.

## The data is already there

Phase 1 of AI enrichment shipped 2026-05-15 (`fb0622a`). Every upcoming Fight gets `aiTags` populated 2-10 days before fight night. Schema:

```ts
aiTags: {
  stakes: string[],          // ["Netflix flagship MMA event", "comeback spectacle"]
  storylines: string[],      // ["Carano returns after 17 years away"]
  styleTags: string[],       // ["judo-based grappler vs striker", "rematch narrative"]
  pace: "fast"|"tactical"|"grinding"|null,
  riskTier: "lopsided"|"favorite-leans"|"pickem"|null,
  rankings: { red: number|null, blue: number|null } | null,
  odds: { red: string|null, blue: string|null } | null,
  isMainEvent: boolean,
  cardSection: "EARLY_PRELIMS"|"PRELIMS"|"MAIN_CARD"|null,
  weightClass: string|null,
}
aiConfidence: float 0..1  // floor at ~0.5
```

**Test fight:** MVP MMA 1 (Rousey vs. Carano, eventId `8a9ead55-657b-4175-845b-b63829f46581`) has 9 enriched fights. Use these for trait development.

## Trait build order — recommendation

Build in this order so each one validates the pattern before the next:

### 1. `style-clash` — fires when `styleTags` includes a contrast pattern

- Detects: `styleTags` contains "striker vs grappler", "wrestler vs striker", "rematch narrative", etc.
- Fires on hype AND rate (different copy each)
- Score 75 — wins over rating-bias mild (72) but loses to single-big (88)
- Copy pulls the matching style tag verbatim:
  - *"A {hype} on a {styleTag}. You like the clash."*
  - *"Striker-vs-grappler at {rating}. Style-purist tonight."*

### 2. `rematch-fan` — fires when `styleTags` or `storylines` mention rematch

- Builds a user-level pattern: count of rematches they've hyped/rated high
- After N rematches hyped 7+, fires "fan of unfinished business" copy
- Tier 2 — needs batchCompute. Defer if pattern detection feels heavy on first pass; **single-event firing is enough for v1**.

### 3. `stakes-aware` — fires on `aiTags.stakes` containing notable phrases

- Detects: "title fight", "Netflix flagship", "comeback", "main event"
- Single-event only, no history needed
- Copy uses the stakes verbatim: *"A {hype} on a {stakes}. You show up for the big ones."*

### 4. `pace-affinity` — fires on `aiTags.pace`

- Detects: pace is "fast"/"tactical"/"grinding"
- Combined with user's hype number — high hype on grinding = "you respect a slow burn", high on fast = "you came for chaos"
- Score 70 — adds variety alongside hype-bias

## Reference: trait file template

Every trait lives at `packages/backend/src/services/fanDNA/traits/{id}/`:

```
{trait-id}/
  trait.ts    # logic
  copy.ts     # copy pool
```

`trait.ts` exports a default `Trait` object satisfying the interface in `packages/backend/src/services/fanDNA/types.ts`. Copy file exports a `CopyVariants` with `lines: { [copyKey]: { soft: [], humor: [] } }`. Registry auto-discovers — no central registration.

Look at `packages/backend/src/services/fanDNA/traits/rating-bias/` as the canonical pattern. The mid-event work this session (`hype-bias`, `session-streak`, `night-owl`, `promotion-debut`) are all working models.

## Scoring tiers (informal — document this properly when adding trait #10)

- **95**: Single dramatic moment (first-ever, hot-take landed)
- **88**: Big single-event delta (rating-bias / hype-bias big)
- **80**: Notable single-event delta
- **72-75**: Primary-tier (mild delta, agreement, style-clash, stakes-aware)
- **65-70**: Mid-tier flavor (mild streaks, pace-affinity)
- **<50**: Background / boring closure cases

Tag-aware traits should mostly land **72-78** — primary-tier flavor that beats vanilla rating-bias mild when triggered.

## Operating principle for tag-aware copy

> *Never bare-quote a tag.* Interpolate it into a worms-tone sentence. The user shouldn't feel like they're reading a database dump. Bad: *"styleTag: striker vs grappler. rating: 8."* Good: *"An 8 on a striker-vs-grappler. You came for the clash."*

## Gotchas

1. **`aiTags` can be null or partially populated.** Always check `fight.aiTags && fight.aiTags.styleTags?.length` before assuming a field is there. Coverage is great for UFC, thinner for small orgs.
2. **`aiConfidence < 0.5` should suppress firing** even if the tag is present. The Phase 1 pipeline writes confidence per-fight.
3. **Three enrichment passes overwrite the same row** (T-10, T-5, T-2). If a trait fires at T-5 and the tag changes at T-2, the user might see different copy on a re-open. That's working as intended — don't add stickiness logic.
4. **Cards with `aiConfidence: null`** never got enriched. Skip silently.

## When you're done

Each tag-aware trait shipped should:
- Push to main (backend auto-deploys via Render)
- No EAS OTA needed (backend-only change)
- Log a daily doc entry under `docs/daily/YYYY-MM-DD.md`
- Update `docs/areas/rewarding-users.md` Wave 3 status

## Pick-up summary

> Build `style-clash` first. ~45 min. It validates the pattern, fires on real data (MVP MMA 1 has style tags populated), and gives you a feel for the tag-aware copy aesthetic before you commit to building 3 more.
