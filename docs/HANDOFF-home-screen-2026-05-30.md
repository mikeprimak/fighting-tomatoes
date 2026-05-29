# HANDOFF — Mobile Home tab, session 2 (2026-05-30)

Continues `docs/HANDOFF-home-screen-2026-05-29.md`. Same branch, **`home-screen`,
still NOT pushed** — Mike is deving this privately; do not push/merge to `main`
until he says.

This session: tuned the Home feed sections, added two new ones, made the blog a
**native in-app reader** (was an in-app web browser), and pointed all web links
at the new `goodfights.app` domain.

## Commits this session (on top of the day-1 handoff)

- `4eaab64` feat(home): rework Hot Fighters, add Most Followed + Recently Booked, throwback comments
- `bed0692` feat(home): rotate top comments, horizontal Most Followed, richer fighter subtitles
- `b2dd9a1` feat(home): hyped sub-sort, simplify fighter subtitles, rename section
- `a5fe821` fix(mobile): point blog links + images at goodfights.app
- `6794152` feat(mobile): native in-app blog reader (Option B)
- `742e580` fix(mobile): remove double top inset on blog screens

(Plus the earlier day-1 Upcoming Events grid tweaks — half-width 2×3 grid with
top-aligned crop — which were committed in the day-1 range.)

## What the Home feed looks like now (top to bottom)

1. **From the Blog** — horizontal carousel. Cards + "See all" now open the
   **native** reader/list (see below), not the web browser.
2. **Upcoming Events** — next **6** UPCOMING events in a **2×3 half-width grid**
   of `EventThumbnail`s (16:9, top-aligned crop for portrait posters, promo-logo
   chip). Selection = backend `/events` (soonest-first), sliced to 6.
3. **Most Hyped Upcoming** — top upcoming fights by avg hype, **tiebroken by hype
   count** (`/community/top-upcoming-fights`).
4. **Recent Good Fights** — `/community/top-recent-fights?period=week`; **falls
   back to `period=month` when the week returns < 4** (second query, enabled
   conditionally in `home.tsx`).
5. **Hot Fighters** — interleaves recently-rated + upcoming-hyped fighters.
   Subtitle: `Fought {opponent} {N weeks} ago` / `Fights {opponent} in {N weeks}`.
   (Score suffix was added then removed at Mike's request — endpoint still
   returns `rating`/`hype`/`opponentName` if you want it back.)
6. **Recently Booked** — VIP fighters (100+ ratings) booked to an upcoming card
   in the last 14 days. Subtitle: `vs {opponent} at {event name}`.
7. **Most Followed** — **horizontal avatar rail** (web-sidebar style:
   `FollowedFighterChip`, circular headshot + name + follower count).
8. **Top Comments** — daily-rotating top 3 (no "See all" button).
9. **Classic Throwback** — one daily-rotating top comment on a fight > 1yr old.

## Backend changes (`packages/backend/src/routes/community.ts`)

- **`/hot-fighters`** rewritten: 60-day windows each way. `recent` = fighters
  from the highest-rated completed fights (`averageRating` desc, `totalRatings ≥ 3`);
  `upcoming` = fighters in the most-hyped upcoming fights (avg `predictedRating`,
  fallback to soonest). Each item now also returns `opponentName` + `rating`
  (recent) / `hype` (upcoming). Returns up to 6 each.
- **`/top-comments`** window 10d→30d. Pulls a top-12 pool and serves
  **non-overlapping chunks of 3 keyed off the UTC day index** → never the same
  set two days running (cycles every 4 days). Falls back to plain top-3 when
  there are < 6 comments. Adds a `throwback` field (top comment on a fight from
  > 1yr ago, also day-rotated through a top-10 pool).
- **NEW `/recently-booked-fighters`** — VIP threshold computed by **summing
  `Fight.totalRatings`** across a fighter's fights (NOT `Fighter.totalRatings`,
  which is one of the "fields that lie"). VIP = ≥ 100. "Booked" = `Fight.createdAt`
  within 14 days on an UPCOMING card.
- **`/top-upcoming-fights`** sort now tiebreaks by `hypeCount`.

`/community/top-followed-fighters` already existed and is reused for Most Followed.

## Native blog reader (Option B) — the big one

Mike chose a native reader over the in-app web browser. SEO requirement: **share
buttons point at the `goodfights.app` web URL**, not the app screen.

- **Backend `GET /api/editorial/:slug`** (`routes/editorial.ts`) returns the post
  metadata **+ a rendered HTML body**.
  - **Uses `markdown-it`, NOT `marked`.** The web renders with `marked@18`, but
    that package is **ESM-only** and the backend compiles to **CommonJS**
    (`node dist/server.js`) — `marked` type-checks fine then crashes at runtime
    with `ERR_REQUIRE_ESM`. `markdown-it` ({ html: true }) is CJS-safe and passes
    the posts' embedded raw HTML (`<figure>`/`<img>`/inline styles) through, which
    the posts rely on. **Don't "fix" this back to marked.**
  - Drafts hidden in production only; `hideFromHome` posts ARE served by slug
    (they're live on the web blog).
- **Mobile screens** (new `app/blog/` route group, has its own `_layout.tsx`,
  registered as `<Stack.Screen name="blog">` in `app/_layout.tsx`):
  - `app/blog/[slug].tsx` — reader: hero, title, date·author, body rendered with
    **`react-native-render-html`**, tag row, Share button (shares
    `buildBlogPostUrl(slug)` = goodfights.app). Relative `src`/`href` are
    rewritten to `WEB_URL`; in-body links open via `expo-web-browser`.
  - `app/blog/index.tsx` — vertical list of all posts (`getEditorial(50)`).
  - Both use `DetailScreenHeader` and **`SafeAreaView edges={[]}`** — the header
    owns the top inset; `edges={['top']}` double-counts it (that was the gap bug,
    fixed in `742e580`). Follow this pattern for any new blog screen.
- **`api.ts`**: `getEditorialPost(slug)`; `WEB_URL` changed to
  `https://goodfights.app` (drives blog links, images, share).

### New dependencies
- backend: `markdown-it` (+ `@types/markdown-it`). Removed `marked` from backend.
- mobile: `react-native-render-html` (pure JS — **OTA-safe, no native build
  needed**). Note: it relies on `defaultProps`, so React 19 logs deprecation
  warnings in dev; harmless.
- pnpm threw a transient Windows **EPERM file-lock** mid-install (Metro/AV holding
  node_modules). Recovered by editing `package.json` + re-running `pnpm install`.
  Lockfile is committed and consistent.

## Verified
- Backend type-checks clean on **both** `tsconfig.json` (strict) and
  `tsconfig.production.json` (the loose-vs-strict divergence lesson).
- markdown-it render runtime-verified via `require` (CJS) on a real post —
  emits `<figure>/<img>/<h2>/<a>`.
- Mobile: no type errors in the changed/new files (the repo's full mobile `tsc`
  has many **pre-existing** unrelated errors — filter to your files).
- Device-checked by Mike: feed sections + blog reader + the top-gap fix.

## Open / not done
- **Still unpushed.** Needs the **backend redeployed** before any of the new
  endpoints (`/hot-fighters` rework, `/top-comments`, `/recently-booked-fighters`,
  `/editorial/:slug`) work against production — they only exist on this branch.
  Until then those sections are empty against prod.
- **Daily rotation is UTC-midnight**, not local. Fine for "rotates daily"; revisit
  if Mike wants a US-time turnover.
- **Hot Fighters score** (`rated X` / `hyped X`) was removed from the UI but the
  endpoint still returns it — trivially re-addable if wanted.
- **`react-native-render-html`** is new; rendering looked right on device but
  watch for edge cases in future posts (tables, unusual embedded HTML). It has no
  table support without a plugin.
- **Sparse-data caveat (dev DB):** Recently Booked / Throwback / hyped sections
  only populate when matching data exists (100+-rating fighters booked recently,
  year-old comments, prediction hype). Empty there is expected, not a bug.
- Day-1 open items still stand: Profile back-nav chevron (no top-level stack
  route), web parity, section count/copy tuning, EAS/OTA assessment at merge time.

## Key files
| File | Change |
|---|---|
| `packages/mobile/app/(tabs)/home.tsx` | All section logic; queries; subtitles; native blog routing |
| `packages/mobile/app/blog/[slug].tsx` | NEW — native article reader |
| `packages/mobile/app/blog/index.tsx` | NEW — native blog list |
| `packages/mobile/app/blog/_layout.tsx` | NEW — blog stack layout |
| `packages/mobile/app/_layout.tsx` | registered `blog` screen |
| `packages/mobile/components/FighterCard.tsx` | added optional `subtitle` prop |
| `packages/mobile/services/api.ts` | `getEditorialPost`, `getRecentlyBookedFighters`, `TopComment` type, `WEB_URL`→goodfights.app, hot-fighters/top-comments types |
| `packages/backend/src/routes/community.ts` | hot-fighters rewrite, top-comments rotation+throwback, recently-booked endpoint, hyped tiebreak |
| `packages/backend/src/routes/editorial.ts` | NEW `/editorial/:slug` (markdown-it HTML body) |
