# EU country-specific broadcasters (UFC only) — design notes

**Status:** Future project. Not started. Captured 2026-05-11 during a how-to-watch session.

## The problem

The current How-to-Watch system treats "EU" as one region with one broadcaster default per promotion. For UFC, that default is DAZN — which is only accurate for the DACH bloc (Germany, Austria, Italy, Spain, Portugal-ish). UFC actually has different rights holders in most European countries, so a French user opening UFC 328 in the app gets told "DAZN," clicks through, and finds nothing.

This proposal: split "EU" into real country codes for UFC only. Other promotions (ONE, BKFC, PFL, etc.) keep "EU = one bucket" until/unless we choose to expand them later.

## Rough broadcaster matrix (UFC, draft — verify before seeding)

| Country | Broadcaster | Tier |
|---|---|---|
| France | RMC Sport | SUB |
| Germany / Austria / Switzerland (DACH) | DAZN | SUB |
| Italy | DAZN Italy | SUB |
| Spain | DAZN Spain (sometimes Eurosport) | SUB |
| Portugal | Eleven Sports | SUB |
| Netherlands | ESPN (via Ziggo) | SUB |
| Sweden / Norway / Denmark / Finland | Viaplay | SUB |
| Poland | Eleven Sports | SUB |
| Czech / Slovakia | Nova Sport | SUB |
| Greece | Nova Greece | SUB |

These shift year-to-year and need verification before any seed run.

## Architecture

Four pieces have to change:

1. **Region schema** — add ISO country codes as valid `region` values alongside the existing `US/CA/GB/AU/NZ/EU` buckets. The "EU" bucket stays valid (other promotions still use it).

2. **Backend fallback chain** — when resolving broadcasters, walk this chain:
   - User's specific country (e.g. `FR`) → if rows exist, use them
   - Generic `EU` → if rows exist, use them
   - Nothing → return empty
   This way UFC gets country precision and ONE/PFL/BKFC continue using "EU."

3. **Mobile region picker** — grows from 6 flags to ~15. IP geolocation already knows the country, so default detection is "free."

4. **Discovery robot** — current prompt tells the AI "EU = one region." For UFC, the prompt would need to be amended to "split EU into per-country findings." This makes the discovery inbox bigger for UFC weeks (potentially 10 countries × every change). Could mitigate by running country-level discovery monthly instead of weekly.

## Effort

Roughly a focused afternoon:
- Schema migration (small)
- Backend resolver + fallback chain (medium — touches `services/region.ts` and `routes/broadcasts.ts`)
- Mobile flag picker + context (small — `RegionPickerSheet.tsx`, `BroadcastRegionContext.tsx`)
- Seed ~10 country defaults for UFC (mostly research, not code)
- Tweak discovery prompt + a separate UFC-only pass (small)
- Testing (medium — touch every country + fallback case)

Total ~6-8 hours, plus the per-country verification research.

## Trade-off

**Pros:**
- French / Italian / Spanish / Nordic UFC users actually find the right channel
- Sets up a precedent for country-level precision if we ever want to expand to other promotions

**Cons:**
- Audience is small — most Good Fights installs are US/CA/GB/AU
- Country-level rights deals shift annually, so the data needs ongoing maintenance
- Discovery inbox grows for UFC weeks

## Cheaper alternative (current state)

Leave EU = DAZN (DACH) with a "primary in Germany/Austria/Italy/Spain — check local listings elsewhere" note shown in the HowToWatch UI for EU users. Revisit if/when European install base grows or a user complaint comes in.

## Decision left open

Whether to do this now, defer to a later push, or skip entirely. Current lean: defer until either (a) European installs grow meaningfully or (b) a user explicitly complains about the wrong broadcaster.
