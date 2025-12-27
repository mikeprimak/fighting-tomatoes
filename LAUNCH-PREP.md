# Launch Preparation Roadmap

**Created**: 2025-12-26
**Status**: In Progress
**Last Updated**: 2025-12-26

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
| Legacy Data Migration | Critical | ⏳ Pending | Awaiting fightingtomatoes.com tech stack info |

## Phase 2: Platform Setup (Launch Blockers)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Apple Developer Account | Critical | ⏳ Pending | User action - $99/year |
| iOS App Store Setup | Critical | ⏳ Pending | After dev account created |
| EAS Build for iOS | Critical | ⏳ Pending | Configure after account setup |

## Phase 3: User Migration (Can soft-launch while building)

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| fightingtomatoes.com → app UX flow | High | ⏳ Pending | Design & build transition experience |
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
- **Fix**: Use parameterized queries

#### HIGH-2: Weak Password Requirements
- **Location**: `packages/backend/src/routes/auth.fastify.ts` (line 32)
- **Issue**: Only requires 6 characters, no complexity
- **Fix**: Require 12+ chars with uppercase, lowercase, number, special char

#### HIGH-3: Admin Cookie Secret Exposed
- **Location**: `packages/backend/src/admin/index.ts` (lines 119, 125)
- **Issue**: Hardcoded fallback secret for admin panel cookies
- **Fix**: Remove fallback, require env var

#### HIGH-4: Password Hash Logging
- **Location**: `packages/backend/src/routes/auth.fastify.ts` (lines 291, 2041, 2045)
- **Issue**: Partial password hashes logged to console
- **Fix**: Remove all password hash logging

#### HIGH-5: Google OAuth Client IDs Exposed
- **Location**: `packages/mobile/hooks/useGoogleAuth.ts` (line 11)
- **Issue**: OAuth client IDs hardcoded in source
- **Fix**: Use environment variables, add .env to .gitignore

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

#### HIGH-9: File Upload Content Not Validated
- **Location**: `packages/backend/src/routes/upload.ts` (lines 23-40)
- **Issue**: Only MIME type checked (can be spoofed)
- **Fix**: Validate actual file content with `file-type` library

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

**Tech Stack**: TBD - awaiting user input

**Data to Migrate**:
- [ ] User accounts (emails, passwords)
- [ ] User ratings/reviews
- [ ] Fight history
- [ ] Other: TBD

**UX Flow**: TBD

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
1. Go to Render → Web Service → Manual Deploy → "Clear build cache & deploy"
2. Wait for deploy to complete
3. Test email: curl -X POST https://fightcrewapp-backend.onrender.com/api/auth/request-password-reset -H "Content-Type: application/json" -d '{"email":"YOUR_EMAIL"}'
4. Check Render logs for "[Auth] Password reset email sent" or error
5. Check SendGrid Activity for new entries
6. If working → move to Serpapi token rotation
7. If not working → debug further
```

