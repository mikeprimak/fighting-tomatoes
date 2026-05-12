# UFC numbered vs Fight Night event types — design

**Status:** Designed 2026-05-11. Not built. Mike asked for the plan; execution deferred to next session.

## The problem

UFC runs two flavors of event with materially different broadcast deals:

| Flavor | Examples | Main Card broadcaster pattern |
|---|---|---|
| **Numbered** | UFC 328, UFC 329 | Often PPV/premium tier — Sportsnet+ PPV (CA), Foxtel/Kayo PPV (AU), Sky Arena PPV (NZ) |
| **Fight Night** | UFC Fight Night, UFC on ESPN | Standard subscription — Sportsnet+ Sub (CA), Kayo Sports Sub (AU), Sky Sport Now (NZ) |

Today's `PromotionBroadcastDefault` is keyed on `(promotion, region, channelId, cardSection)`. No notion of event type. The 6 UFC defaults auto-applied 2026-05-11 came from the AI scanning `ufc.com/how-to-watch` while it was redirecting to UFC 328's specific page — so those defaults reflect **Numbered** broadcasters. Treating them as universal serves Fight Night users a misleading PPV recommendation.

## Approach

Add an `eventType` dimension to defaults + discoveries, same shape as the cardSection migration already shipped.

### Schema

- `PromotionBroadcastDefault.eventType`: nullable string `'NUMBERED' | 'FIGHT_NIGHT' | null`
  - `null` = universal default (applies to any event type)
- `BroadcastDiscovery.eventType`: matching enum
- Update unique constraint: `(promotion, region, channelId, cardSection, eventType)` with `NULLS NOT DISTINCT`
- Migration backfills existing rows as `eventType=null`

### Event-type detection

Cheap helper using the event name pattern:

```ts
function getUfcEventType(name: string): 'NUMBERED' | 'FIGHT_NIGHT' | null {
  if (/^UFC\s+\d+/i.test(name)) return 'NUMBERED';
  if (/^UFC Fight Night|UFC on (ESPN|FOX|ABC)/i.test(name)) return 'FIGHT_NIGHT';
  return null;
}
```

For non-UFC promotions, return `null` for v1 (no distinction).

**Long-term improvement:** persist `eventType` on the `Event` model so we don't re-derive on every query. Punt for now.

### Resolver order

```
1. EventBroadcast for this event           (per-event override, most specific)
2. Default eventType=detected + cardSection=requested
3. Default eventType=null     + cardSection=requested
4. Default eventType=detected + cardSection=null
5. Default eventType=null     + cardSection=null   (most general)
```

eventType-specific always beats eventType=null. cardSection-specific always beats cardSection=null.

### AI extraction

`extract.ts SYSTEM_PROMPT` adds an `eventType` field to the structured output:

```json
{
  "channelName": "...",
  "tier": "...",
  "cardSection": "MAIN_CARD",
  "eventType": "NUMBERED",
  "sourceUrl": "...",
  "snippet": "...",
  "confidence": 0.95
}
```

Rules for the AI:
- Article about a specific numbered event (UFC 328, etc.) → `eventType: "NUMBERED"`
- Article about Fight Night programming → `eventType: "FIGHT_NIGHT"`
- Article about UFC's overall deal with a broadcaster (no event-type qualifier) → `eventType: null`

### Admin UI

- Discovery card: an Event Type badge next to the Card Section badge ("Numbered events" / "Fight Nights" / "All events")
- Promotion Defaults table: new Event Type column
- Edit Default + Apply Discovery modals: an Event Type dropdown (Numbered / Fight Night / Any)

### Data cleanup

Once the schema lands:

1. Re-tag the 6 UFC defaults auto-applied 2026-05-11 as `eventType: NUMBERED` (they came from a numbered-event page):
   - UFC US Prelims → Paramount+ (NUMBERED)
   - UFC US Main Card → Paramount+ + CBS (NUMBERED)
   - UFC AU Prelims → Paramount+ (NUMBERED)
   - UFC AU Main Card → Foxtel + Kayo Sports (NUMBERED)

2. Run discovery against Fight Night-specific sources to populate the Fight Night defaults. Brave queries like `"UFC Fight Night Australia broadcaster 2026"` should surface the right data.

### Mobile

No mobile change. Resolver does the right thing server-side; HowToWatch component keeps receiving broadcasts per section.

## Effort

Roughly the same shape as the cardSection migration: **3–4 hours of focused work**.

## Scope decision

**Recommendation: UFC only for v1, schema-ready for others.**

Add the `eventType` column with the right values. AI prompt is UFC-aware (knows about numbered vs Fight Night). Other promotions always emit `eventType: null`. Future expansion to BKFC (KnuckleMania vs regular events), PFL (playoffs vs regular season), etc., requires only a prompt update — no migration.

## Open question

Whether to also persist `Event.eventType` on the event row directly (cleaner) vs. derive from name every time (cheaper to ship). Punt to the second iteration.
