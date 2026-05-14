# UTM Conventions

**Locked 2026-05-14.** Every outbound `goodfights.app` link must carry UTM params, or attribution is invisible. The work isn't optional — the spine (legacy redirect UTM + landing-page install-referrer forwarding + PostHog `identify()`) only fires when query params exist on the URL the user clicks.

---

## Pattern

```
https://goodfights.app/?utm_source=<where>&utm_medium=<how>&utm_campaign=<what>
```

### Rules

- `utm_source` — lowercase platform/site name (`twitter`, `reddit`, `instagram`, `email`, `press`, `youtube`, `tiktok`, `discord`, `substack`, `linkedin`)
- `utm_medium` — broad category (`organic`, `paid`, `email`, `broadcast`, `bio`, `earned`, `affiliate`, `redirect`)
- `utm_campaign` — specific content unit, hyphen-separated, lowercase, **under 100 chars** (App Store `ct` token limit)
- All values: lowercase, hyphens not underscores, no spaces, no special chars
- Optional: `utm_content` (creative variant), `utm_term` (paid keyword) — same rules

---

## Ready-to-paste examples

| Channel | Paste-from URL |
|---|---|
| Twitter / X Hype Index post | `https://goodfights.app/?utm_source=twitter&utm_medium=organic&utm_campaign=hype-index-<card>` |
| Twitter retrospective post | `https://goodfights.app/?utm_source=twitter&utm_medium=organic&utm_campaign=verdict-<card>` |
| Reddit organic verdict post | `https://goodfights.app/?utm_source=reddit&utm_medium=organic&utm_campaign=verdict-<card>` |
| Reddit paid (promoted) | `https://goodfights.app/?utm_source=reddit&utm_medium=paid&utm_campaign=<card>` |
| Resend email broadcast | `https://goodfights.app/?utm_source=email&utm_medium=broadcast&utm_campaign=<broadcast-slug>` |
| Instagram bio link | `https://goodfights.app/?utm_source=instagram&utm_medium=bio&utm_campaign=evergreen` |
| Instagram Story | `https://goodfights.app/?utm_source=instagram&utm_medium=story&utm_campaign=<card>` |
| Press hit citing GF | `https://goodfights.app/?utm_source=press&utm_medium=earned&utm_campaign=<outlet-slug>` |
| Discord bot link | `https://goodfights.app/?utm_source=discord&utm_medium=bot&utm_campaign=<server-slug>` |

Replace `<card>` with the card slug (e.g. `ufc328`, `ufc-white-house`, `mvp-netflix`).

---

## What happens after a tagged link is clicked

1. User clicks tagged link → lands on `goodfights.app/?utm_*`
2. `packages/landing/attribution.js` reads `utm_*` and rewrites every store button on the page
3. **App Store** gets `?ct=<utm_campaign or utm_source>` → appears in App Store Connect Analytics → Sources
4. **Play Store** gets `&referrer=<urlencoded utm string>` → Android Install Referrer API surfaces it to the installed app on first launch, and Play Console shows it under Acquisition Reports
5. After install + login, `posthog.identify()` ties the events to the user account

Untagged link = none of this fires. Default state is no attribution.

---

## When NOT to use UTM

- Internal navigation between `goodfights.app` pages — already on the site, no source to track
- Direct typed URLs / QR codes for casual sharing where attribution doesn't matter
- Links from the app TO the app (those are obviously attributed to the app itself)

For everything else: **tag it.**

---

## Future: programmatic UTM builder

If outbound link production scales (it will, with the Hype Index cadence weekly), consider a tiny helper at `packages/backend/scripts/buildMarketingUrl.ts` that takes `{source, medium, campaign}` and emits the URL. For now, paste-from this doc is sufficient.

---

*Created 2026-05-14 alongside the attribution spine ship.*
