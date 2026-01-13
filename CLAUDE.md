# CLAUDE.md

## NEXT SESSION: Fix Apple Review Issues

Apple rejected the iOS build. Two fixes required before resubmitting:

1. **Delete Account** - Add option to delete account from within the app
2. **Guest Access** - Allow users to browse without logging in

See `LAUNCH-DOC.md` for full status and checklists.

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
