# CLAUDE.md

## Apple Review Issues - RESOLVED

1. ~~**Delete Account** - Add option to delete account from within the app~~ **DONE**
2. ~~**Guest Access** - Allow users to browse without logging in~~ **DONE**

See `LAUNCH-DOC.md` for full status and checklists.

### Important Rules

- **Always ask before starting EAS builds** - Build credits are limited (91% used as of Jan 19)
- **Never use local DB** - Always use Render External URL unless explicitly asked

### Other TODOs

3. **Test New Homescreen Icon** - versionCode 25 building with new icon (filled-glove version). Used `expo prebuild --clean` to fix icon sizing. Build URL: https://expo.dev/accounts/mikeprimak/projects/fightcrewapp/builds/728a8d23-6a49-4d9b-989c-efea802e7561

4. **Fix Reset Password 404** - `https://goodfights.app/reset-password?token=...` returns 404. The `FRONTEND_URL` env var on Render points to `goodfights.app` but the Vercel web frontend has no `/reset-password` route. Options:
   - A) Create reset-password page on web frontend (Vercel)
   - B) Change `FRONTEND_URL` to a deep link that opens the mobile app
   - C) Build a simple web page that redirects to the app

5. **Fix Email SPF/DKIM** - Emails from goodfights.app show "unverified" warning in recipients' inboxes ("We can't verify that this email came from the sender"). Need to configure SPF, DKIM, and DMARC records for the goodfights.app domain to authenticate outgoing emails from the SMTP provider.

---

## Live Tracker Preview Mode (Future Implementation)

Once the app has real users, use this pattern to safely develop live event trackers without affecting what users see.

### Concept: Shadow Fields

Add parallel "tracker" fields to the Fight model. The live tracker writes to shadow fields, regular users see published fields, admin sees both.

```
Fight table:
├── status          (published - what users see)
├── winnerId        (published)
├── method          (published)
├── round           (published)
├── time            (published)
│
├── trackerStatus   (draft - what live tracker writes)
├── trackerWinnerId (draft)
├── trackerMethod   (draft)
├── trackerRound    (draft)
├── trackerTime     (draft)
├── trackerUpdatedAt
```

### Data Flow

| Component | Reads | Writes |
|-----------|-------|--------|
| Live Tracker | - | `tracker*` fields only |
| Admin Panel | Both (side by side) | Published fields |
| Regular Users | Published fields | - |
| Admin in App | `tracker*` fields | - |

### Admin Workflow During Events

1. Live tracker runs, writing to `tracker*` fields
2. Admin watches tracker output in the app (sees draft data)
3. If correct → "Publish" button copies tracker values to published fields
4. If wrong → manually enter correct values in admin panel
5. Regular users only ever see the published (approved) data

### Benefits

- Tracker bugs can't affect real users
- Admin can compare tracker output vs reality in real-time
- Simple "publish" action when tracker is working correctly
- Graceful fallback to manual entry when needed

---

FightCrewApp: React Native + Node.js combat sports fight rating app.

**Archive**: See `CLAUDE-ARCHIVE.md` for detailed setup guides, troubleshooting, feature implementations, and history.

## Quick Start

**Commands**:
- Root: `pnpm dev|build|test|lint|type-check`
- Backend: `cd packages/backend && PORT=3008 pnpm dev`
- Mobile: `cd packages/mobile && npx expo start --port 8083 --lan`

**Critical Ports**: Backend 3008, Expo 8083, PostgreSQL 5433

## Stack

**Monorepo**: backend (Fastify, Prisma, PostgreSQL), mobile (React Native Expo, Expo Router, React Query)
**Database**: 20+ tables, UUID v4 keys, JWT dual-token (15min/7day)
**Mobile**: iOS/Android/Web, Stack-inside-Tabs pattern

## Switching Work Locations (IP Change)

When switching WiFi networks, update the dev IP in **2 files**:

1. Get your new IP: `ipconfig | findstr "IPv4"`
2. Update:
   - `packages/mobile/services/api.ts` line ~20
   - `packages/mobile/store/AuthContext.tsx` line ~76
3. Reload the app

**Known IPs**: Home `10.0.0.53` | Work `192.168.1.65`

## API Endpoints

**Base**: `http://localhost:3008/api` (web) | `http://<YOUR_IP>:3008/api` (mobile)
- **Auth**: `POST register|login|logout|refresh`, `GET profile|verify-email`
- **Fights**: `GET /fights`, `GET /fights/:id`, `POST /fights/:id/rate|review|tags`
- **Fighters**: `GET /fighters`, `GET /fighters/:id`, `POST /fighters/:id/follow`
- **Events**: `GET /events`, `GET /events/:id`
- **Search**: `GET /search?q=query&limit=10`

## Development Guidelines

- **TypeScript**: Use trailing comma `<T,>` in .tsx files
- **Debugging**: Config audit first → Add logging → Check for multiple PrismaClient instances
- **Rule**: If 3+ fixes fail → STOP → Audit all config files
- **File ops**: Prefer editing existing files over creating new ones

## Key Systems

| System | Key Files |
|--------|-----------|
| Live Event Tracker | `services/liveEventTracker.ts`, `services/ufcLiveParser.ts` |
| Image Storage (R2) | `services/imageStorage.ts` |
| UFC Scraper | `services/scrapeAllUFCData.js` |
| ONE FC Scraper | `services/scrapeAllOneFCData.js` |

## Test Accounts

- `avocadomike@hotmail.com` (1234 ratings, 72 reviews)
- `michaelsprimak@gmail.com`
