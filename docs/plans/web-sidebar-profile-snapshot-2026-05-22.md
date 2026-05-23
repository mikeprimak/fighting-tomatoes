# Web Sidebar — Profile Snapshot

**Status:** brainstorm + tonight's build plan
**Created:** 2026-05-22
**Surface:** `packages/web` — right-rail sidebar on events pages
**Aesthetic:** Letterboxd / Strava / Last.fm. **Not** Duolingo.

---

## Why a sidebar at all

The legacy site had one; modern dumping-ground sidebars are dead but contextual rails are alive (Letterboxd profile stats, Linear filters, Reddit about-this-community).

The sidebar's job here is **"About you, [username]"** — a self-portrait the user enjoys returning to. Identity + closure + light discovery. **No leaderboards, no XP, no badges, no streak guilt.**

It's also a sale-narrative asset: a per-user data display proves the depth of the underlying dataset to a buyer.

---

## Rotation model

**Stable spine + one rotating spotlight tile.** Strava model. Identity anchors stay put; one tile cycles daily so returning users get a small "what's new" hit without the sidebar becoming a slot machine.

---

## Tile inventory

Grouped by the job they do. We won't ship all of these — this is the menu.

### Identity (always at top, stable)
- Avatar + username + Fan DNA personality type as headline (e.g. "Hot Take Artist · 247 ratings since Mar 2026")
- Member since / "Active for X weeks"
- Optional 1-line bio or user-set favorite fight

### Volume — closure metrics (stable)
- # ratings, # hype predictions, # reviews/comments
- # fighters followed
- # fights closed (hyped → rated) — the core Strava-style activity number
- Avg rating given (calibrates them: "you're a 6.8 average rater, community is 7.2")
- Weekend rating streak — **event weekends only**, not day-streaks (respects sport rhythm, avoids Duolingo guilt)

### Distribution — taste charts (stable)
- Rating distribution histogram (harsh? generous? bimodal?)
- Hype distribution histogram
- **Hype calibration delta** — "your hype is on average 0.4 above outcome" — *uniquely yours*, no other combat-sports app has this
- Method preference pie (decisions / KOs / subs)
- Weight-class affinity bar
- Org mix (UFC % / BKFC % / ONE %)

### Recency (stable, auto-updating)
- Last fight rated (card thumb + score)
- Next followed-fighter fight (countdown)
- This week: X rated, Y hyped

### Upcoming awareness — **what the user explicitly asked for**
- **"Upcoming fights you're hyped for"** — list of upcoming fights where the user has placed a high hype score (e.g. ≥7); sort by event date asc
- **"Upcoming fights you might like"** — upcoming fights involving (a) fighters the user follows OR (b) fighters they've rated highly in their past fights. Collab-filter lite. Hide overlap with the hyped list.

### Discovery / Recs (rotating spotlight candidates)
- "A fighter you might like" — collab filter from follow patterns
- "A past fight you'd probably love" — high community rating, spoiler-safe presentation
- "Underrated by you" — community darling you haven't followed
- "Your taste twin" — "247 users rate like you" (when social ships)
- Compatibility with one specific user/friend

### Hot takes / consensus (rotating)
- "Your hottest take this month" — biggest delta vs community
- "Your sharpest call" — best hype-vs-outcome prediction
- "Where you agree with everyone" — strong consensus rating

### Calendar awareness (stable bottom)
- "This weekend: 3 followed fighters across 2 cards"
- Next 3 upcoming fights of followed fighters

### Identity milestones (rotating quarterly)
- Most-rated weight class
- Favorite fighter (by follow activity)
- Highest-rated fight you've seen
- Year-in-review preview (always show Nov–Dec)

---

## What to avoid

- Streaks framed as guilt
- XP, levels, badges
- "You're behind X friends" comparisons
- Leaderboards
- Anything that punishes a break

---

## Empty-room handling (non-negotiable)

Each tile has a data floor. New-user sidebar is a museum where rooms light up as you walk through:

> Rate 5 fights → unlock your taste profile
> Follow 3 fighters → unlock recommendations
> Rate 25 fights → unlock Fan DNA type

The sidebar must never display a card that says "no data yet" without a clear unlock action.

Floors (initial proposal):
| Tile | Floor |
|---|---|
| Identity block | always render (signed in) |
| Volume counts | always render |
| Rating dist chart | ≥5 ratings |
| Hype dist chart | ≥5 hype scores |
| Hype calibration | ≥10 hyped fights that have completed |
| Fan DNA type | engine returns non-null (already gated) |
| "Hyped upcoming" | ≥1 upcoming hyped fight |
| "Might like" recs | ≥3 follows OR ≥10 ratings |
| Past fight pick | ≥10 ratings |
| Hottest take | ≥10 ratings |

---

## Layout

- Desktop (lg+): two-column grid, main ~720px, sidebar ~320px, gap-6
- Below lg: sidebar collapses below main content (or hides if pure-discovery user — TBD)
- Sticky sidebar (`sticky top-16` under navbar)
- Widen `layout.tsx` main from `max-w-4xl` to `max-w-7xl` to make room

---

## Build order — tonight

1. **Identity block** — avatar + username + Fan DNA type + total counts (ratings/hype/follows). Includes layout widening + sidebar mount.
2. **Distribution charts** — wire existing `DistributionChart` into sidebar for rating + hype.
3. **Recency block** — last rated fight + next followed-fighter fight countdown.
4. **Rotating spotlight tile** — 3 starter variants: "fighter you might like" / "hottest take" / "past fight pick". Daily rotation keyed off `userId + date`.

Deferred for later sessions:
- Upcoming hyped + "might like" lists (needs backend endpoints — `/api/me/upcoming-hyped`, `/api/me/upcoming-recommended`)
- Hype calibration delta (needs completed-fight join logic)
- Weight class / method / org breakdowns
- Taste twin / compatibility
- Year-in-review

---

## API surface to add (later)

- `GET /api/me/upcoming-hyped` — fights with userHype ≥7 where event in future
- `GET /api/me/upcoming-recommended` — fights where (fighter followed by user) OR (fighter previously rated ≥8 by user), dedupe vs hyped, future events
- `GET /api/me/hype-calibration` — avg(hype - rating) over completed fights with both
- `GET /api/me/hottest-take?period=month` — biggest |userRating - communityRating| in window

---

## Sale-narrative note

Every sidebar tile is a public proof-of-depth: "Good Fights tracks not just ratings but taste, calibration, follow patterns, hype-vs-outcome, weight-class affinity, method preference, weekend cadence." Screenshots of a rich sidebar belong in pitch decks. Build with that in mind.
