# HANDOFF — Mobile "Home" landing tab, 2026-05-29

## TL;DR

New **Home** main tab for the mobile app — a magazine-style landing feed to
give fight fans something fresh between fight weekends. Profile moved out of the
bottom tab bar into a top-right header icon. Also added a backend
`GET /api/editorial` endpoint (Good Fights blog → mobile) and **unified the blog
source** so the markdown is no longer maintained in two places.

**All on branch `home-screen` — NOT pushed. Nothing tested on a device yet.**
Mike asked to dev this in private; do not push or merge to `main` until he says.

Two commits:
- `ec7eff6` — feat(mobile): new Home landing tab + editorial blog API
- `49adff9` — refactor(backend): unify editorial blog source (web is canonical)

## What shipped

### New `Home` tab (`packages/mobile/app/(tabs)/home.tsx`)
Leftmost tab, house icon, now the app's default landing screen. Pull-to-refresh.
Sections, top to bottom, each a curated preview with a "See all" deep link:
1. **From the Blog** — horizontal editorial carousel; tap a card → opens the web
   blog post in an in-app browser (`expo-web-browser`).
2. **Upcoming Events** — `EventBannerCard` banners (next 4 UPCOMING).
3. **Most Hyped** — top 5 upcoming fights (`UpcomingFightCard`).
4. **Recent Good Fights** — top 5 recent fights (`CompletedFightCard`).
5. **Hot Fighters** — up to 6 (`FighterCard`).
6. **Top Comments** — top 3 (`CommentCard`) with optimistic upvote.

Composed entirely from endpoints/cards that already existed — the hidden
`community.tsx` screen was effectively the prototype.

### Profile moved to the header
- `Profile` tab is now `href: null` (hidden from the bottom bar) in
  `packages/mobile/components/TabBar.tsx`.
- New `HeaderProfileButton` (`components/HeaderProfileButton.tsx`, `user-circle`
  icon) sits top-right on every tab header → `router.push('/(tabs)/profile')`.
- The four duplicated `headerRight` blocks in `TabBar.tsx` were refactored into
  one shared `headerActions` (spoiler-eye + search + profile).

### Launch redirect (`app/(tabs)/index.tsx`)
Defaults to Home; **Live Events still wins when an event is live**.

### Editorial API + blog-source unification
- Backend `GET /api/editorial` (`packages/backend/src/routes/editorial.ts`)
  returns blog post metadata parsed from markdown frontmatter (gray-matter).
- Mobile `api.getEditorial()` + `WEB_URL` / `buildBlogPostUrl()` /
  `resolveBlogImageUrl()` helpers in `services/api.ts`. Cards deep-link to
  `web-jet-gamma-12.vercel.app/blog/<slug>` and load hero images from the web host.
- **Single source of truth = `packages/web/src/content/posts`.**
  `packages/backend/scripts/syncBlogPosts.js` copies those posts into
  `packages/backend/src/content/posts` (gitignored, generated) and is chained
  into the backend `dev` and `build` scripts (also `pnpm -C packages/backend sync:blog`).
  **Edit blog posts only in the web package.**

## How to run locally

In dev the mobile app talks to a **local backend on port 3008** (native →
`10.0.0.51:3008`, web → `localhost:3008`), so the backend must be running or the
Home screen is empty.

```
# Terminal 1 — backend (also runs the blog sync)
PORT=3008 pnpm -C packages/backend dev

# Terminal 2 — Expo
pnpm -C packages/mobile exec expo start --port 8083 --lan
```

- Phone (Expo Go, same Wi-Fi): scan the QR or open `exp://10.0.0.51:8083`.
  `10.0.0.51` is this dev machine's LAN IP and matches the app's hardcoded dev IP.
- Quick browser look: press `w` in the Expo terminal (uses `localhost:3008`).
- Sanity check the endpoint directly:
  `curl "http://localhost:3008/api/editorial?limit=3"`

## Test plan (not yet done)

### 1. Tab bar + launch
- Cold-launch the app with no live event → ✅ lands on **Home**, Home tab is
  leftmost with a house icon.
- (Optional) With a live event in progress → ✅ still lands on **Live Events**.
- ✅ There is **no** Profile tab in the bottom bar.

### 2. Profile header icon
- On every tab, ✅ a profile (user-circle) icon shows top-right.
- Tap it → ✅ opens the Profile screen.
- **KNOWN GAP to evaluate:** the Profile screen has no header back chevron
  (you return via the bottom tab bar). Decide if that's acceptable; if not, the
  fix is promoting Profile to a top-level stack route (see "What's NOT done").

### 3. Blog section
- ✅ "From the Blog" shows a horizontal carousel of post cards with hero images,
  title, excerpt, date.
- Tap a card → ✅ opens the post in an in-app browser at the web blog.
- Tap "See all" → ✅ opens the blog index.

### 4. Other sections render + navigate
- Upcoming Events banners → tap → ✅ event detail.
- Most Hyped / Recent Good Fights cards → tap → ✅ fight detail (recent uses
  `?mode=completed`).
- Hot Fighters → tap → ✅ fighter detail.
- Top Comments → tap → ✅ fight detail; tap upvote → ✅ count updates optimistically.
- "See all" links: Events → Upcoming Events tab; Most Hyped → Upcoming Events
  tab; Recent → Good Fights tab; Top Comments → `/comments`.

### 5. Pull-to-refresh
- Pull down on Home → ✅ spinner, sections refresh.

### 6. Light/dark + regression
- ✅ Home looks right in dark mode (app is dark-only in prod but verify).
- ✅ Existing tabs (Live, Upcoming, Past, Good Fights) still work; the spoiler-eye
  and search icons still function (they were moved into the shared `headerActions`).

## What's NOT done / open questions

- **Live device verification** — the entire test plan above.
- **Profile back-navigation** — see test step 2. If the no-back-chevron UX feels
  off, promote `profile` from `(tabs)` to a top-level stack route in
  `app/_layout.tsx` (gives a real back button). Deferred — bigger change, and the
  bottom tab bar already provides a way back.
- **Web parity** — Mike mentioned eventually wanting "something similar" on the
  web app. Not started; this branch is mobile-only.
- **Section tuning** — counts (4 events / 5 fights / 6 fighters / 3 comments),
  order, period (`week` is hardcoded for the fight lists), and copy are all first
  drafts. Easy to adjust in `home.tsx`.
- **Blog "See all" / cards open the web blog** rather than an in-app markdown
  reader. Fine for v1; a native article reader is a possible follow-up.

## When this eventually merges to main

- **The Home blog section needs the backend deployed.** `/api/editorial` only
  exists on this branch — until Render redeploys with this code, the blog section
  will be empty against production. The `build` script runs `syncBlogPosts.js`, so
  the posts ship automatically on deploy **as long as the full pnpm workspace is
  checked out at build time** (it is, by default). If a Render build ever logs
  `[syncBlogPosts] source not found`, the web posts weren't present in the build —
  check Render's monorepo/checkout settings.
- App store version bump / OTA: this is a JS+native-config change to the tab
  navigator; assess whether it goes out via EAS Update or needs a new build when
  the time comes. (Ask Mike before any EAS build — credits are limited.)

## Key files

| File | Change |
|---|---|
| `packages/mobile/app/(tabs)/home.tsx` | NEW — Home screen |
| `packages/mobile/components/HeaderProfileButton.tsx` | NEW — header profile icon |
| `packages/mobile/components/TabBar.tsx` | Home tab added, profile hidden, shared `headerActions` |
| `packages/mobile/app/(tabs)/index.tsx` | launch redirect → Home |
| `packages/mobile/services/api.ts` | `getEditorial()` + `WEB_URL`/blog URL helpers |
| `packages/mobile/components/index.ts` | export `HeaderProfileButton` |
| `packages/backend/src/routes/editorial.ts` | NEW — `GET /api/editorial` |
| `packages/backend/src/routes/index.ts` | register editorial route |
| `packages/backend/scripts/syncBlogPosts.js` | NEW — web→backend post sync |
| `packages/backend/.gitignore` | NEW — ignore generated `src/content/posts/` |
| `packages/backend/package.json` | gray-matter dep; sync chained into dev/build |
