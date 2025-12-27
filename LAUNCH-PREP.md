# Launch Preparation Roadmap

**Created**: 2025-12-26
**Status**: In Progress
**Last Updated**: 2025-12-27

---

## Executive Summary

Security audit completed. **Found 5 CRITICAL, 12 HIGH, 15 MEDIUM, and 6 LOW severity issues** across backend and mobile. Additionally, **5 GitGuardian alerts** for exposed secrets in git history require immediate credential rotation.

---

## Phase 1: Security & Stability (Launch Blockers)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Security Audit | Critical | ✅ Complete | 38 issues found |
| Credential Rotation (GitGuardian) | Critical | ✅ Complete | PostgreSQL + SendGrid rotated |
| Fix Critical Security Issues | Critical | ✅ Complete | All 5 critical issues fixed |
| Spam Prevention & Rate Limiting | Critical | ✅ Complete | @fastify/rate-limit implemented |
| Token Expiry Fix | Critical | ✅ Complete | 15min access, 90-day refresh with sliding expiration |
| Legacy Data Migration | Critical | 🔄 In Progress | Account claim flow complete, migration scripts next |

## Phase 2: Platform Setup (Launch Blockers)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Apple Developer Account | Critical | ⏳ Pending | User action - $99/year |
| iOS App Store Setup | Critical | ⏳ Pending | After dev account created |
| EAS Build for iOS | Critical | ⏳ Pending | Configure after account setup |

## Phase 3: User Migration (Can soft-launch while building)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| fightingtomatoes.com → app UX flow | High | ✅ Complete | Account claim flow built & tested |
| Migration landing page/emails | High | ⏳ Pending | Communication to existing users |

## Phase 4: Polish (Post-Launch OK)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Efficiency Audit | Medium | ⏳ Pending | Scan for unused code, redundancy |
| Code Cleanup | Medium | ⏳ Pending | Based on efficiency audit |
| Documentation | Low | ⏳ Pending | Auto-generate API docs, code comments |

---

## Token Strategy (Industry Standard) ✅ IMPLEMENTED

**Goal**: "Stay logged in forever" like most mobile apps

| Token Type | Value | Purpose |
|------------|-------|---------|
| Access Token | 15 minutes | Short-lived, carries permissions |
| Refresh Token | 90 days | Long-lived, renews access token |
| Refresh on Use | Yes | Each refresh extends the 90 days (sliding expiration) |

**Behavior**:
- User stays logged in indefinitely as long as they use the app within 90 days
- Access token silently refreshes in background
- Only explicit logout or 90 days of inactivity triggers re-login

**Implementation** (2025-12-27):
- Constants defined in `packages/backend/src/utils/jwt.ts`
- All auth endpoints updated to use centralized constants
- Database token expiry updated to 90 days for sliding expiration

---

## GitGuardian Alerts (IMMEDIATE ACTION REQUIRED)

These secrets were detected in your GitHub repository `mikeprimak/fighting-tomatoes` and must be rotated:

| # | Secret Type | Pushed Date | Status | Action Required |
|---|-------------|-------------|--------|-----------------|
| 1 | PostgreSQL Password | Nov 15, 2025 | ⚠️ EXPOSED | Rotate Render DB password |
| 2 | SMTP Credentials | Dec 4, 2025 | ⚠️ EXPOSED | Rotate email service password |
| 3 | Serpapi Token | Oct 1, 2025 | ⚠️ EXPOSED | Regenerate Serpapi API key |
| 4 | PostgreSQL URI | Oct 17, 2025 | ⚠️ EXPOSED | Rotate Render DB password |
| 5 | PostgreSQL URI | Oct 18, 2025 | ⚠️ EXPOSED | Rotate Render DB password |

### Credential Rotation Checklist

- [ ] **Render PostgreSQL**: Go to Render dashboard → Database → Settings → Reset password
- [ ] **SMTP/Email**: Go to email provider → Regenerate API key/password
- [ ] **Serpapi**: Go to serpapi.com → Account → Regenerate API key
- [ ] **Update `.env` files** with new credentials (DO NOT commit to git)
- [ ] **Update Render environment variables** with new credentials
- [ ] **Add to `.gitignore`**: `.env`, `.env.local`, `*.env`, `.claude/settings.local.json`

---

## Security Audit Findings

### Scan Date: 2025-12-26

### Summary by Severity

| Severity | Backend | Mobile | Total |
|----------|---------|--------|-------|
| CRITICAL | 2 | 3 | 5 |
| HIGH | 6 | 6 | 12 |
| MEDIUM | 5 | 10 | 15 |
| LOW | 3 | 3 | 6 |
| **TOTAL** | **16** | **22** | **38** |

---

### CRITICAL Issues (Fix Before Launch)

#### CRIT-1: Unprotected Admin Endpoints
- **Location**: `packages/backend/src/routes/admin.ts` (lines 79-629)
- **Issue**: ALL admin routes lack authentication. Anyone can create/delete fighters, events, trigger scrapers.
- **Fix**: Add `preValidation: [fastify.authenticate, requireAdmin]` to all admin routes
- **Status**: ✅ Fixed (2025-12-27)

#### CRIT-2: Hardcoded JWT Secret Fallbacks
- **Location**: `packages/backend/src/middleware/auth.fastify.ts`, `auth.fastify.ts` routes
- **Issue**: `JWT_SECRET || 'your-secret-key'` allows app to run with weak default secret
- **Fix**: Removed all fallbacks, now throws error if env var not set
- **Status**: ✅ Fixed (2025-12-27)

#### CRIT-3: Firebase Service Account in Git
- **Location**: `packages/mobile/fcm-service-account.json`
- **Issue**: Complete Firebase private key committed to repository
- **Fix**: Already gitignored, never committed to git history
- **Status**: ✅ Verified (2025-12-27)

#### CRIT-4: Giphy API Key Hardcoded
- **Location**: `packages/mobile/components/GifPickerModal.tsx` (line 17)
- **Issue**: API key in source code
- **Fix**: Created backend proxy (`/api/giphy/*`), mobile calls backend instead
- **Status**: ✅ Fixed (2025-12-27) - Feature not currently in use

#### CRIT-5: Tokens Stored in Plaintext AsyncStorage
- **Location**: `packages/mobile/store/AuthContext.tsx`
- **Issue**: Access/refresh tokens stored unencrypted in AsyncStorage
- **Fix**: Created `utils/secureStorage.ts`, uses `expo-secure-store` on native, AsyncStorage on web
- **Status**: ✅ Fixed (2025-12-27)

---

### HIGH Priority Issues

#### HIGH-1: Raw SQL Injection Risk
- **Location**: `packages/backend/src/scripts/fix-unique-constraint.ts` (lines 41, 52)
- **Issue**: Uses `$executeRawUnsafe()` with template literals
- **Fix**: Added identifier validation before use (defense in depth)
- **Status**: ✅ Fixed (2025-12-27)

#### HIGH-2: Weak Password Requirements
- **Location**: `packages/backend/src/routes/auth.fastify.ts` (line 32)
- **Issue**: Only requires 6 characters, no complexity
- **Fix**: Require 12+ chars with uppercase, lowercase, number, special char
- **Status**: ✅ Fixed (2025-12-27)

#### HIGH-3: Admin Cookie Secret Exposed
- **Location**: `packages/backend/src/admin/index.ts` (lines 119, 125)
- **Issue**: Hardcoded fallback secret for admin panel cookies
- **Fix**: Removed fallback, now throws error if ADMIN_COOKIE_SECRET not set
- **Status**: ✅ Fixed (2025-12-27)

#### HIGH-4: Password Hash Logging
- **Location**: `packages/backend/src/routes/auth.fastify.ts` (lines 291, 2041, 2045)
- **Issue**: Partial password hashes logged to console
- **Fix**: Remove all password hash logging
- **Status**: ✅ Already clean (verified 2025-12-27)

#### HIGH-5: Google OAuth Client IDs Exposed
- **Location**: `packages/mobile/hooks/useGoogleAuth.ts` (line 11)
- **Issue**: OAuth client IDs hardcoded in source
- **Fix**: N/A - OAuth client IDs are PUBLIC by design (not secrets). Added documentation.
- **Status**: ✅ Resolved (2025-12-27) - Not a security issue

#### HIGH-6: Test Account Login Buttons in Production
- **Location**: `packages/mobile/app/(auth)/login.tsx` (lines 233-339)
- **Issue**: 8 hardcoded test accounts with one-click login buttons
- **Fix**: Wrap in `{__DEV__ && (...)}` or remove entirely

#### HIGH-7: Missing Rate Limiting
- **Location**: `packages/backend/src/routes/auth.fastify.ts`
- **Issue**: No rate limiting on login, register, password reset
- **Fix**: Implemented `@fastify/rate-limit` with per-endpoint limits
- **Status**: ✅ Fixed (2025-12-27)

#### HIGH-8: User Data Logged to Console
- **Location**: `packages/mobile/store/AuthContext.tsx` (lines 440-442)
- **Issue**: Full user JSON logged including sensitive data
- **Fix**: Remove or gate behind `__DEV__`
- **Status**: ✅ Fixed (2025-12-27)

#### HIGH-9: File Upload Content Not Validated
- **Location**: `packages/backend/src/routes/upload.ts` (lines 23-40)
- **Issue**: Only MIME type checked (can be spoofed)
- **Fix**: Added `file-type` library to validate magic bytes, added rate limiting
- **Status**: ✅ Fixed (2025-12-27)

---

### MEDIUM Priority Issues

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| MED-1 | Backend email.ts | Email tokens in URLs logged | Reduce token logging |
| MED-2 | Backend server.ts | Error messages may expose info | Consistent error handling |
| MED-3 | Mobile api.ts | HTTP used in development | Use HTTPS or secure tunnel |
| MED-4 | Mobile | No certificate pinning | Implement cert pinning |
| MED-5 | Mobile api.ts | No automatic token refresh on 401 | Add interceptor |
| MED-6 | Mobile | Deep links not validated | Add deep link validation |
| MED-7 | Mobile notificationService.ts | Push token logged | Gate behind __DEV__ |
| MED-8 | Mobile api.ts | API config logged at startup | Remove production logs |
| MED-9 | Mobile AuthContext.tsx | User data in AsyncStorage | Move sensitive data to SecureStore |
| MED-10 | Mobile | No screenshot prevention | Add react-native-prevent-screenshot |
| MED-11 | Mobile | No request timeouts | Add AbortController timeouts |
| MED-12 | Backend | Insufficient audit logging | Track sensitive actions |

---

### LOW Priority Issues

| ID | Location | Issue |
|----|----------|-------|
| LOW-1 | Backend admin/index.ts | Secure cookie only in production |
| LOW-2 | Backend package.json | Check dependencies for CVEs |
| LOW-3 | Mobile | No biometric authentication option |
| LOW-4 | Mobile events/index.tsx | Debug logging present |
| LOW-5 | Mobile analytics.ts | References old storage keys |
| LOW-6 | Backend | CORS properly configured (no issue) |

---

## Rate Limiting Plan

### Endpoints to Protect

| Endpoint Category | Limit | Window | Notes |
|-------------------|-------|--------|-------|
| Auth (login/register) | 5 | 15 min | Prevent brute force |
| Password Reset | 3 | 1 hour | Prevent abuse |
| API General | 100 | 1 min | Per authenticated user |
| API Unauthenticated | 20 | 1 min | Per IP |
| File Uploads | 10 | 1 hour | Prevent storage abuse |
| Comments/Reviews | 10 | 1 min | Prevent spam |

### Implementation
- Use `@fastify/rate-limit` plugin
- Store rate limit data in Redis (or memory for MVP)
- Return `429 Too Many Requests` with `Retry-After` header

---

## Security Fix Priority Order

### Immediate (Before Any Production Use)
1. Rotate all GitGuardian-flagged credentials
2. Add authentication to admin routes (CRIT-1)
3. Remove hardcoded secret fallbacks (CRIT-2)
4. Remove Firebase service account from git (CRIT-3)
5. Switch tokens to SecureStore (CRIT-5)

### Before App Store Submission
6. Remove test login buttons (HIGH-6)
7. Implement rate limiting (HIGH-7)
8. Fix password requirements (HIGH-2)
9. Remove sensitive logging (HIGH-4, HIGH-8)

### Before Wide Release
10. Add file content validation (HIGH-9)
11. Implement certificate pinning (MED-4)
12. Add deep link validation (MED-6)

---

## Legacy Migration (fightingtomatoes.com)

### Quick Status Summary

| Task | Status | Notes |
|------|--------|-------|
| Account claim flow (backend + mobile + web) | ✅ Complete | Users can claim migrated accounts |
| Migration scripts (export/import) | ⏳ TODO | Need to build scripts to move data |
| Test with real data | ⏳ TODO | After scripts are built |
| Production migration | ⏳ TODO | Final step before announcing to users |

### What's Next (For New Session)

1. **Build migration scripts** in `packages/backend/scripts/legacy-migration/`
2. **SQL dump files** are in `databases from fightingtomatoes/` folder (gitignored)
3. **Key challenge**: Match legacy fights (integer IDs) to new fights (UUIDs) by fighter names + event date
4. **Import users with `password: null`** so account claim flow works

---

**Tech Stack**: PHP, vanilla JavaScript, HTML/CSS, MySQL (MariaDB 10.6)

### Legacy Database Architecture

The legacy system uses a **non-standard schema** where user-specific data is stored in dynamically-named tables:

| Database | Table Naming | Contents |
|----------|--------------|----------|
| `fightdb` | `users`, `fights` | Central tables with normal schema |
| `userfightratings` | `{MD5(email)}` | Per-user tables: `fightid`, `score` (1-10), `excited`, `time_of_rating` |
| `userfightreviews` | `{MD5(email)}` | Per-user tables: `fightid` (links to fightreviewsdb) |
| `userfighttags` | `{MD5(email)}` | Per-user tables: `fightid`, `tagid` |
| `user-data` | `{MD5(email)}` | Per-user tables: `recommended_fights`, fighter ratings |
| `fightreviewsdb` | `{fightid}` | Per-fight tables: review content, author email, upvotes |

**Key Challenge**: Table names are MD5 hashes of user emails. The `maptoemail` column in `users` table contains this hash.

### Data Volume Estimates (from SQL dumps)

| Data Type | File Size | Est. Records |
|-----------|-----------|--------------|
| Users | 994 KB | ~1,000 users |
| Ratings | 3.7 MB | ~50,000+ ratings |
| Reviews | 1.2 MB | ~5,000+ reviews |
| Tags | ~500 KB | ~10,000+ tags |

### Field Mapping

#### Users (`fightdb.users` → PostgreSQL `users`)

| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `emailaddress` | `email` | Primary identifier |
| `password` | `password` | bcrypt hash, compatible with Node.js |
| `displayname` | `displayName` | |
| `ismedia` | `isMedia` | Boolean conversion |
| `mediaorganization` | `mediaOrganization` | |
| `avatar` | `avatar` | Need to migrate image files too |
| `wantsemail` | `wantsEmails` | |
| `confirmedemail` | `emailVerified` | |
| `reviewerscore` | `points` | Gamification score |
| `numreviews` | `totalReviews` | |
| `signupdatetime` | `createdAt` | Parse PHP datetime format |
| `maptoemail` | — | MD5 hash, used to locate user's data tables |

#### Ratings (`userfightratings.{MD5}` → PostgreSQL `fight_ratings`)

| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `fightid` | `fightId` | Requires fight ID mapping |
| `score` | `rating` | 1-10 scale |
| `time_of_rating` | `createdAt` | Unix timestamp → DateTime |

#### Reviews (`fightreviewsdb.{fightid}` → PostgreSQL `fight_reviews`)

| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `comment` | `content` | |
| `score` | `rating` | |
| `commenteremail` | `userId` | Lookup user by email |
| `date` | `createdAt` | |
| `helpful` | `upvotes` | |
| `link` | `articleUrl` | Media user links |
| `linktitle` | `articleTitle` | |

#### Tags (`userfighttags.{MD5}` → PostgreSQL `fight_tags`)

| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `fightid` | `fightId` | Requires fight ID mapping |
| `tagid` | `tagId` | Requires tag ID mapping |

### Fight ID Mapping Strategy

Legacy uses integer IDs (`6206`, `8291`), new system uses UUIDs.

**Option A (Recommended)**: Add `legacyFightId` column to `fights` table
- Allows direct lookup during migration
- Preserves legacy references for debugging
- Migration script can create mapping on first pass

**Option B**: Create separate mapping table
- Cleaner schema, but adds join complexity

### Migration Script Architecture

```
packages/backend/scripts/legacy-migration/
├── 01-export-legacy-data.ts    # Connect to MySQL, export to JSON
├── 02-create-fight-mapping.ts  # Build legacy→UUID fight ID map
├── 03-migrate-users.ts         # Import users (no FK dependencies)
├── 04-migrate-ratings.ts       # Import ratings (needs user+fight)
├── 05-migrate-reviews.ts       # Import reviews (needs user+fight)
├── 06-migrate-tags.ts          # Import tags (needs user+fight+tag)
├── 07-verify-migration.ts      # Count verification
└── legacy-data/                # JSON exports from step 01
    ├── users.json
    ├── ratings.json
    ├── reviews.json
    └── tags.json
```

### Migration Phases

**Phase 1: Export (run against live fightingtomatoes.com MySQL)**
- [ ] Connect to legacy MySQL database
- [ ] Export `users` table to JSON
- [ ] For each user, compute MD5(email), query their tables in each database
- [ ] Flatten per-user tables into single JSON arrays
- [ ] Export reviews from per-fight tables

**Phase 2: Transform**
- [ ] Create fight ID mapping (legacy int → new UUID)
- [ ] Create user ID mapping (legacy email → new UUID)
- [ ] Create tag ID mapping (legacy int → new UUID)
- [ ] Transform field names and data types

**Phase 3: Import (run against new PostgreSQL)**
- [ ] Import users (skip duplicates if re-running)
- [ ] Import ratings with foreign key lookups
- [ ] Import reviews with foreign key lookups
- [ ] Import tags with foreign key lookups

**Phase 4: Verify**
- [ ] Compare record counts
- [ ] Spot-check specific users' data
- [ ] Verify user can log in with legacy password

### Password Compatibility

Legacy uses PHP `password_hash()` with bcrypt:
```php
$hash = password_hash($password, PASSWORD_BCRYPT);
// Produces: $2y$10$...
```

Node.js `bcrypt` can verify these hashes directly:
```typescript
import bcrypt from 'bcrypt';
const isValid = await bcrypt.compare(password, legacyHash);
// Works! bcrypt handles $2y$ prefix
```

**No password reset required** - users can log in with existing passwords.

### Prerequisites Before Migration

1. **MySQL access credentials** for fightingtomatoes.com databases
2. **Add `legacyFightId` column** to Prisma schema (migration)
3. **Verify fight data exists** - ensure UFC scraper has populated fights that users rated

### Decisions Made

- [x] **MySQL credentials**: Available ✅
- [x] **Fight ID mapping**: Match by fighter names + date (legacy IDs not in new DB)
- [x] **Deleted users**: Skip users with `deleted=1`
- [x] **Avatars**: Do NOT migrate (users can upload new ones)
- [ ] **Recommended fights**: TBD - probably skip (computed data)
- [ ] **Fighter ratings** (`other_field_1`): TBD - probably skip (not in new schema)

### User Migration Flow (Account Claiming)

**Strategy**: Pre-migrate users with `password: null`, `authProvider: 'EMAIL'`. OAuth and email/password users have different flows.

#### OAuth Users (Google/Apple) - Backend Ready

Backend OAuth linking logic already handles legacy users:

1. User taps "Sign in with Google" (or Apple when available)
2. OAuth provider returns their verified email
3. Backend finds existing user with `authProvider: 'EMAIL'`
4. Backend links OAuth ID, updates `authProvider` to `'GOOGLE'` or `'APPLE'`
5. User is logged in with all their legacy data!

| Provider | Status |
|----------|--------|
| Google | ✅ Working |
| Apple | ⏳ Pending (needs Apple Developer Account - see Phase 2) |

**This is the smoothest path** - encourage users to use Google Sign-In in migration communications.

#### Email/Password Users - ✅ COMPLETE

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEGACY USER FIRST LOGIN                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User downloads new app, taps "Log In"                       │
│                                                                  │
│  2. User enters email: mike@example.com                         │
│                                                                  │
│  3. Backend checks: user exists + password is null              │
│     → This is a legacy user who hasn't migrated yet             │
│                                                                  │
│  4. Response: "Welcome back! Your account from                  │
│     fightingtomatoes.com has been transferred.                  │
│     Verify your email to set up your new password."             │
│                                                                  │
│  5. Send verification email with magic link/code                │
│                                                                  │
│  6. User clicks link → lands on "Set Password" screen           │
│                                                                  │
│  7. User creates password (12+ chars, complexity rules)         │
│                                                                  │
│  8. Account activated! All legacy ratings/reviews intact.       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why this approach**:
- ✅ **Secure**: Verifies email ownership before granting access
- ✅ **No password reuse**: Old bcrypt hashes not imported (security win)
- ✅ **Simple UX**: User just enters email, we handle the rest
- ✅ **Data intact**: Ratings, reviews, tags already linked to user record

**Implementation Status**: ✅ **COMPLETE** (2025-12-27)

| Component | File | Status |
|-----------|------|--------|
| Login detects legacy users | `auth.fastify.ts:311-319` | ✅ Done |
| `/auth/claim-account` endpoint | `auth.fastify.ts:2140-2241` | ✅ Done |
| `/auth/reset-password` verifies email | `auth.fastify.ts:2101-2111` | ✅ Done |
| Account claim email template | `email.ts:116-164` | ✅ Done |
| Mobile `claim-account.tsx` | `app/(auth)/claim-account.tsx` | ✅ Done |
| Mobile `reset-password.tsx` (12+ chars) | `app/(auth)/reset-password.tsx` | ✅ Done |
| Web `reset-password.html` (12+ chars) | `reset-password.html` (root) | ✅ Done + Deployed |
| AuthContext navigation | `AuthContext.tsx:177-184` | ✅ Done |

**Tested**: Local end-to-end flow verified working (2025-12-27)

### Fight Matching Strategy

Since legacy fight IDs aren't in the new database, we need to match fights by content:

```typescript
// Match logic
async function findNewFightId(legacyFight: LegacyFight): Promise<string | null> {
  // Try exact match: fighter1 + fighter2 + date
  const fight = await prisma.fight.findFirst({
    where: {
      fighter1: {
        firstName: legacyFight.f1fn,
        lastName: legacyFight.f1ln,
      },
      fighter2: {
        firstName: legacyFight.f2fn,
        lastName: legacyFight.f2ln,
      },
      event: {
        date: {
          gte: startOfDay(legacyFight.date),
          lte: endOfDay(legacyFight.date),
        }
      }
    }
  });

  // Also try reversed fighter order
  if (!fight) {
    // Try fighter2 vs fighter1...
  }

  return fight?.id ?? null;
}
```

**Expected outcome**: Most UFC fights should match. Some legacy fights may not exist in new DB if:
- Old promotions we don't scrape anymore
- Cancelled fights
- Data entry errors in legacy system

**Unmapped fights**: Log them, don't import those ratings (data loss is acceptable for edge cases).

---

## Notes & Decisions

- 2025-12-26: Roadmap created, security audit started
- 2025-12-26: Security audit completed - 38 issues found (5 critical, 12 high, 15 medium, 6 low)
- 2025-12-26: GitGuardian alerts incorporated - 5 exposed secrets require rotation
- Token strategy: Industry standard 90-day refresh tokens confirmed

---

## Session Log: 2025-12-26

### Completed
- [x] Created LAUNCH-PREP.md with full roadmap
- [x] Security audit completed (backend + mobile)
- [x] Rotated Render PostgreSQL password (new credentials created)
- [x] Updated DATABASE_URL in Render environment variables
- [x] Updated DATABASE_URL in local .env
- [x] Removed `.claude/settings.local.json` from git tracking
- [x] Added `.claude/settings.local.json` to .gitignore
- [x] Created new SendGrid API key
- [x] Updated SMTP_PASS in Render environment variables
- [x] Updated SMTP_PASS in local .env
- [x] Deleted old SendGrid API key (in SendGrid dashboard)

### In Progress - Resume Here
- [ ] **Verify SendGrid email is working**
  - Registration email log shows success: `[Email] Verification email sent to testemail5678@gmail.com`
  - BUT SendGrid Activity shows no new entries
  - Password reset emails for existing accounts not sending (accounts may not exist in prod DB)
  - **NEXT STEP**: Do "Clear build cache & deploy" in Render, then test email again

### Still Pending
- [ ] Rotate Serpapi token (if still used)
- [ ] Fix critical security issues (admin routes auth, hardcoded secrets, etc.)
- [ ] Implement rate limiting
- [ ] Update token strategy to 90-day refresh tokens

### Where to Resume
```
Session continued on 2025-12-27 - see below
```

---

## Session Log: 2025-12-27

### Completed
- [x] **CRIT-1**: Added authentication to all 26 admin routes (`requireAdmin` middleware)
- [x] **CRIT-2**: Removed all hardcoded JWT secret fallbacks (fail-fast if not configured)
- [x] **CRIT-3**: Verified Firebase service account is properly gitignored (never committed)
- [x] **CRIT-4**: Created Giphy backend proxy (`/api/giphy/*`) - removed API key from mobile
- [x] **CRIT-5**: Switched token storage to SecureStore (native) with AsyncStorage fallback (web)
- [x] **HIGH-7**: Implemented rate limiting with `@fastify/rate-limit`
  - Global: 100 req/min per user/IP
  - Auth: 5 attempts per 15 min
  - Password reset: 3 per hour
  - Content: 10-30 per minute
  - Uploads: 10 per hour
- [x] **Token Strategy**: Updated to industry standard
  - Access token: 15 minutes (was 1 hour)
  - Refresh token: 90 days (was 7 days)
  - Sliding expiration: Each refresh resets 90-day clock
- [x] Committed and pushed all changes

### Phase 1 Status
| Task | Status |
|------|--------|
| Security Audit | ✅ Complete |
| Credential Rotation (GitGuardian) | ✅ Complete |
| Fix Critical Security Issues | ✅ Complete (5/5) |
| Spam Prevention & Rate Limiting | ✅ Complete |
| Token Expiry Fix | ✅ Complete |
| Legacy Data Migration | ⏳ Pending (awaiting fightingtomatoes.com info) |

### Still Pending (HIGH Priority)
- [x] HIGH-2: Strengthen password requirements ✅ Fixed
- [ ] HIGH-6: Remove test login buttons from production (intentionally deferred)
- [x] HIGH-4/8: Remove sensitive data logging ✅ Fixed

### Where to Resume
```
Session continued on 2025-12-27 (afternoon) - see below
```

---

## Session Log: 2025-12-27 (Afternoon)

### Completed
- [x] Merged `distinctmycolumn` branch into `main` and pushed
- [x] **HIGH-2**: Password now requires 12+ chars with uppercase, lowercase, number, special char
- [x] **HIGH-4**: Verified no password hash logging present (already clean)
- [x] **HIGH-8**: Removed user data JSON logging from AuthContext.tsx
- [x] **HIGH-1**: Added SQL identifier validation to migration script
- [x] **HIGH-3**: Removed admin cookie secret fallback, now requires env var
- [x] **HIGH-5**: Documented OAuth client ID as public (not a secret)
- [x] **HIGH-9**: Added file-type validation + rate limiting to upload endpoints

### Intentionally Deferred
- [ ] **HIGH-6**: Test login buttons kept for now (user request)

### Where to Resume
```
Session continued on 2025-12-27 (evening) - see below
```

---

## Session Log: 2025-12-27 (Evening)

### Completed - Legacy Account Claim Flow

Built complete account claim flow for migrated users from fightingtomatoes.com:

**Backend Changes:**
- [x] Modified `/auth/login` to detect `password: null` users → returns `ACCOUNT_CLAIM_REQUIRED`
- [x] Added `/auth/claim-account` endpoint → sends verification email
- [x] Updated `/auth/reset-password` → also sets `isEmailVerified: true`
- [x] Added `sendAccountClaimEmail()` with migration-specific messaging

**Mobile Changes:**
- [x] Created `claim-account.tsx` screen with "Welcome Back" message
- [x] Updated `reset-password.tsx` to require 12+ chars + special char
- [x] Modified `AuthContext.tsx` to navigate to claim screen on `ACCOUNT_CLAIM_REQUIRED`
- [x] Fixed missing `Platform` import in `AuthContext.tsx`

**Web Changes:**
- [x] Updated `reset-password.html` to require 12+ chars + special char (upload to web host needed)

**Testing:**
- [x] Created test legacy user with `password: null`
- [x] Verified claim flow works end-to-end locally
- [x] Created helper scripts: `create-test-legacy-user.ts`, `get-token.ts`

### Where to Resume
```
Account claim flow complete. Next:
1. Upload updated reset-password.html to web host (goodfights.app) ✅ DONE
2. Build migration scripts (export from MySQL, import to PostgreSQL)
3. Phase 2: Apple Developer Account setup
```

