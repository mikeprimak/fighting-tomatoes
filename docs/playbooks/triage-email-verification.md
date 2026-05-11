# Triage: "I can't verify my email"

## Symptom

User reports: "Every time I click the verification link in my email, I get an error page."

The error page they're describing is the landing site's `verify-email.html` showing the "Verification Failed" state — it appears whenever the backend returns `400 TOKEN_INVALID`.

## How the flow works

1. User registers / hits "resend verification" → `POST /api/auth/resend-verification`
2. Backend regenerates `emailVerificationToken` on the user row and emails a link:
   `https://goodfights.app/verify-email?token=<token>`
3. Landing page `packages/landing/verify-email.html` calls `GET /api/auth/verify-email?token=…`
4. Backend (`auth.fastify.ts` `/verify-email`) looks up a user whose `emailVerificationToken` matches AND `emailVerificationExpires > now`
5. On match: sets `isEmailVerified = true`, **nulls out the token**, returns 200
6. On miss: returns `400 TOKEN_INVALID`

**Critical detail:** any resend overwrites the token on the row. Once a new verification email goes out, every prior email's link is permanently dead — clicking it returns TOKEN_INVALID.

## Most common cause

The user requested multiple verification emails (often by hitting "resend" in the app a few times) and is clicking an older link. Only the most-recently-sent email's link works.

Second most common: the user clicked the link, it succeeded, then tried it again — the token is now null in the DB so the link 400s.

Rare: 24h expiry actually elapsed (`emailVerificationExpires` is `now + 24h` at issue time).

## Diagnosis

Look up the user from `packages/backend/`:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findUnique({
    where: { email: 'USER_EMAIL_HERE' },
    select: {
      id: true, email: true, isEmailVerified: true,
      emailVerificationToken: true, emailVerificationExpires: true,
      createdAt: true, updatedAt: true
    }
  });
  console.log(JSON.stringify(user, null, 2));
  await prisma.\$disconnect();
})();
"
```

Interpret the result:

| Result | Meaning |
|---|---|
| `isEmailVerified: true` | Already verified. They're clicking a stale link or hit a cached error page. Tell them they're good — try signing in. |
| `isEmailVerified: false`, token present, `emailVerificationExpires` in future | Live token exists. They're clicking an OLDER email's link. Either send them the most recent email's URL or manually verify (below). |
| `isEmailVerified: false`, token null | They already consumed the token. The email is verified at the API level but the flag wasn't updated — should not happen given the current code; investigate. |
| `isEmailVerified: false`, `emailVerificationExpires` in past | True 24h expiry. Have them hit "Resend verification" in the app. |
| No user found | Wrong email / typo. Confirm address. |

Also check Render logs for `TOKEN_INVALID verify-email` (added 2026-05-11). Token prefix + IP + UA are logged. You can correlate against the email click time the user reports.

## Manual fix (when the live token check passes)

Hit the verify endpoint directly with the token from the DB:

```bash
curl -i "https://fightcrewapp-backend.onrender.com/api/auth/verify-email?token=<TOKEN_FROM_DB>"
```

Re-check the user row to confirm `isEmailVerified: true`.

## What to tell the user

> "Just verified you on our end — you should be able to sign in normally now. If you got the verification email more than once, only the most recent one's link works; older links go stale once a newer one is sent. Sorry for the runaround."

## Known gaps (consider improving)

- No Sentry on backend yet — see `docs/areas/support-tooling.md` item #1.
- Error page on the landing site shows the same "Verification Failed" UI for stale-token, expired-token, and consumed-token cases. Distinguishing them in the response would help users self-diagnose ("this link has been replaced by a newer email — check your inbox").
- The resend endpoint overwrites the token unconditionally; there's no rate-limit warning shown to the user before they invalidate their previous link.

## Past incidents

- 2026-05-11 — `cray_zegyptian@hotmail.com` (Android v2.0.1) — multiple resends, clicking older link. Manually verified.
