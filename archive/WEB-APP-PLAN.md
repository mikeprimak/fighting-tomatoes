# Good Fights Web App — Implementation Plan

## Context

Good Fights (goodfights.app) is a combat sports fight rating app — like Rotten Tomatoes for MMA/boxing. It's currently mobile-only (React Native/Expo). The goal is to launch a web version with feature parity. The backend API is already fully capable of serving a web frontend — no new endpoints needed.

**Current setup:**
- `packages/backend` — Fastify + Prisma on Render
- `packages/mobile` — React Native + Expo Router
- `packages/landing` — Static HTML on Vercel (goodfights.app)
- `packages/shared` — Shared TypeScript types

---

## Current App: 5 Tabs

| Tab | Icon | What it shows |
|-----|------|---------------|
| **Live Events** | podcast | Currently live fights, "LIVE NOW" / "UP NEXT" status |
| **Upcoming Events** | fire | Future fights by event, grouped by card section |
| **Past Events** | star | Completed fights by event, grouped by card section |
| **Good Fights** | hand logo | Top-rated fights, filterable by time period |
| **Profile** | user | User stats, top reviews, top pre-fight comments, settings |

### Active Features — Upcoming Fights
- **Hype score** (1-10 flame picker) + community average + distribution chart
- **Pre-fight comments** with upvotes, replies, edit/delete
- **Notification bell** — push notification when fight is up next
- **Odds display**

### Active Features — Completed Fights
- **Rating** (1-10 slider) + community average + distribution chart
- **Reviews/comments** with optional article URL, upvotes, replies
- **Fight tags** (139+ descriptors: Masterpiece, War, Upset, etc.)
- **Spoiler-free mode** — hides outcomes until user rates

### Active Features — Live Fights
- "LIVE NOW" / "UP NEXT" / "STARTING SOON" status with pulse animation
- Rating available once fight completes
- Notification bell for upcoming fights

### Abandoned Features (DO NOT port to web)
- **Crews** — group chat, crew predictions (code exists but removed from UI)
- **Winner predictions** — pick fighter1/fighter2 (abandoned)
- **Method predictions** — KO/SUB/DEC prediction (abandoned)
- **Community tab** — hidden from tab bar
- **News tab** — hidden from tab bar

---

## Approach: Next.js App Router → `packages/web`

**Why Next.js:**
- SSR/SSG for SEO (event/fight/fighter pages rank on Google)
- React-based — same mental model as mobile
- React Query works identically (same staleTime/gcTime patterns)
- Deploys to Vercel (already in use for landing page)
- Replaces the current static landing pages naturally

**Styling:** Tailwind CSS (dark-only theme matching mobile colors)

---

## Package Structure

```
packages/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root: providers, dark theme, navbar
│   │   ├── page.tsx                  # Home → upcoming events
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── verify-email/page.tsx     # Replaces landing HTML
│   │   │   ├── reset-password/page.tsx   # Replaces landing HTML (fixes the 404!)
│   │   │   └── claim-account/page.tsx
│   │   ├── events/
│   │   │   ├── live/page.tsx         # Live events
│   │   │   ├── upcoming/page.tsx     # Upcoming events (also home page)
│   │   │   ├── past/page.tsx         # Past events
│   │   │   └── [id]/page.tsx         # Event detail (SSR)
│   │   ├── fights/
│   │   │   ├── [id]/page.tsx         # Fight detail (SSR)
│   │   │   └── top/page.tsx          # Good Fights (top-rated, time-filtered)
│   │   ├── fighters/[id]/page.tsx    # Fighter detail (SSR)
│   │   ├── profile/page.tsx
│   │   ├── profile/edit/page.tsx
│   │   ├── activity/page.tsx         # My ratings, reviews, comments, hype
│   │   ├── search/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── followed-fighters/page.tsx
│   │   ├── privacy/page.tsx          # Replaces landing HTML
│   │   ├── delete-account/page.tsx   # Replaces landing HTML
│   │   └── api/auth/                 # Proxy routes for cookie auth
│   │       ├── login/route.ts
│   │       ├── register/route.ts
│   │       ├── refresh/route.ts
│   │       └── logout/route.ts
│   ├── components/
│   │   ├── layout/ (Navbar, Footer, MobileNav)
│   │   ├── fight-cards/ (Upcoming, Completed, Live)
│   │   ├── EventCard, FighterCard, CommentCard, etc.
│   │   ├── RateFightModal, HypeFightModal, SearchBar
│   │   └── charts/ (RatingDistribution, HypeDistribution)
│   ├── lib/
│   │   ├── api.ts                    # API client (ported from mobile, ~80 methods)
│   │   ├── auth.ts                   # Auth context (cookies, not SecureStore)
│   │   └── queryClient.ts           # React Query config (5min stale, 10min gc)
│   ├── hooks/
│   └── utils/
├── tailwind.config.ts
├── next.config.js
└── package.json
```

---

## Navigation: Tabs → Navbar

| Mobile Tab | Web Nav | Route |
|---|---|---|
| Live Events | "Live" | `/events/live` |
| Upcoming Events | "Upcoming" (default) | `/` and `/events/upcoming` |
| Past Events | "Past" | `/events/past` |
| Good Fights | "Good Fights" | `/fights/top` |
| Profile | Avatar dropdown (top-right) | `/profile` |

**Desktop:** Top navbar (logo left, links center, search + auth right), max-width ~1200px content.
**Mobile web:** Same navbar collapsed to hamburger/bottom nav.

---

## Auth on Web

- **Refresh token** → httpOnly secure cookie (set via Next.js API routes)
- **Access token** → in-memory React state (never localStorage — XSS safe)
- **SSR auth** → server components read the cookie
- **Google/Apple OAuth** → web SDKs send identity token to same backend endpoints
- Guest mode supported (matching mobile)

---

## What's Shared vs. Rewritten

**Extract to `packages/shared`:**
- Color constants, organization lists, heatmap math, name formatters
- TypeScript types (FightData, Fighter, Event, etc.)

**Must rewrite for web (React Native → HTML/CSS):**
- All UI components (View/Text → div/p, TouchableOpacity → button)
- API client (remove AsyncStorage/SecureStore, use cookies)
- Auth context (remove expo-router, use Next.js router)
- Icons (@expo/vector-icons → lucide-react)
- Animations (RN Animated → CSS transitions / Framer Motion)
- Modals (RN Modal → HTML dialog)

---

## Implementation Phases

### Phase 1: Foundation (Hours 1-4)
- Init `packages/web` with Next.js + Tailwind
- Tailwind theme matching mobile Colors.ts
- Extract shared utils/types to `packages/shared`
- API client (ported from mobile, ~80 methods)
- Auth system (context + API route proxies for cookies)
- Root layout with navbar, React Query provider
- **First screen: Upcoming Events** (infinite scroll + org filter)

### Phase 2: Browse Experience (Hours 5-12)
- Event Detail page (SSR + metadata for SEO)
- Fight Detail page (upcoming + completed modes)
- Fighter Detail page (SSR + SEO)
- Past Events page
- Live Events page
- Good Fights / Top Fights page (time-period filter)
- Search results page

### Phase 3: User Interactions (Hours 13-20)
- Auth screens (login, register, forgot-password, verify-email, reset-password)
- Rate fight modal (1-10 slider)
- Hype rating for upcoming fights (1-10 flame picker)
- Reviews & comments (write, reply, upvote)
- Pre-fight comments
- Tags (139+ descriptors)
- Profile page (stats, top reviews, top pre-fight comments)
- Edit profile, settings, spoiler-free mode

### Phase 4: Activity & Polish (Hours 21-30)
- Activity hub (my ratings, reviews, comments, hype)
- Followed fighters page
- Send feedback
- Responsive audit (320px → 1200px+)
- Spoiler-free mode

### Phase 5: SEO & Launch (Hours 31-36)
- Image optimization (next/image)
- SEO: generateMetadata(), sitemap.xml, robots.txt, Open Graph, JSON-LD
- Privacy page, delete-account page (replaces landing HTML)
- Migrate Vercel from `packages/landing` → `packages/web`
- Verify existing routes work (/verify-email, /reset-password, /privacy, /delete-account)

---

## Backend Changes

**Almost none.** The API is web-ready:
- CORS already allows `goodfights.app` and `localhost:3000`
- All endpoints work for web clients
- Only change: add preview domain to CORS during dev (if using a staging URL)

---

## Deployment

1. **During dev:** Deploy `packages/web` as a separate Vercel project (preview URL)
2. **At launch:** Repoint `goodfights.app` Vercel project from `packages/landing` → `packages/web`
3. No DNS changes, no backend changes

---

## Key Files to Port From

| Mobile File | Purpose | Web Equivalent |
|---|---|---|
| `packages/mobile/services/api.ts` | ~80 API methods | `src/lib/api.ts` |
| `packages/mobile/store/AuthContext.tsx` | Auth flow | `src/lib/auth.ts` |
| `packages/mobile/constants/Colors.ts` | Theme colors | `tailwind.config.ts` |
| `packages/mobile/components/fight-cards/` | Fight card UIs | `src/components/fight-cards/` |
| `packages/mobile/utils/heatmap.ts` | Heatmap math | Extract to `packages/shared` |
| `packages/mobile/utils/dateFormatters.ts` | Date formatting | `src/utils/dateFormatters.ts` |

---

## Tailwind Theme (from mobile Colors.ts)

```ts
// tailwind.config.ts colors
colors: {
  background: {
    DEFAULT: '#181818',
    secondary: '#202020',
  },
  text: {
    DEFAULT: '#ffffff',
    secondary: '#9ca3af',
    onAccent: '#202020',
  },
  primary: '#F5C518',        // Golden accent
  border: '#374151',
  success: '#10b981',
  danger: '#ef4444',
  tab: {
    default: '#6b7280',
    selected: '#F5C518',
  },
}
```

---

## Notification Handling on Web

Push notifications (alarm bell) are mobile-only. On web:
- **No push notification bell** — this is a mobile feature
- Could add browser notifications later, but not for initial launch
- Hype scores and comments work the same

---

## Verification

- Run `pnpm dev` in `packages/web` — loads upcoming events at localhost:3000
- Auth: login with test account `testdev2@goodfights.app`, verify token refresh
- Rate a fight, write a review — verify data appears in mobile app too
- SSR: view page source for `/events/[id]` — should contain fight data (not empty shell)
- Responsive: test at 375px, 768px, 1200px widths
- Lighthouse: check SEO and performance scores on key pages
