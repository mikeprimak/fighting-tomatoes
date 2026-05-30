---
purpose: One-time announcement email to legacy fightingtomatoes.com users
audience: ~1,966 users imported from legacy MySQL, password=null
status: DRAFT — not yet sent
---

# Legacy User Announcement Email

## Context

- Legacy site fightingtomatoes.com was shut down and all traffic is now forced to goodfights.app (as of ~2026-04-14)
- All 1,966 legacy users were migrated with `password=null`, `authProvider='EMAIL'`
- Two valid return paths for a legacy user:
  - **Sign in with Google** — `POST /auth/google` auto-links on email match (`auth.fastify.ts:1580-1592`): sets `googleId`, flips `authProvider` to `GOOGLE`, preserves all ratings/reviews. Zero friction for anyone whose email is a Google-compatible address (Gmail or Workspace).
  - **Claim via email/password** — `POST /auth/claim-account` emails a one-time token (`auth.fastify.ts:2311`) that expires in 24h; user sets a new password.
- This announcement email is the **proactive** outreach — tells users the site moved and nudges them into whichever return path works for them.
- Claim tokens expire in 24 hours, so don't bake tokens into this blast; link them to a page that generates one on demand.

---

## Option A — Announcement only (recommended)

No token in the email. Link goes to a "claim" landing page where they enter their email and get a fresh claim-token email. Safe to send in bulk, no expiring tokens.

### Subject line

**Final:** `FightingTomatoes.com is now "Good Fights" App. Claim Your Account.`

(Prior candidates for reference:
- `Your FightingTomatoes account moved — here's how to get back in`
- `FightingTomatoes is now Good Fights (your ratings are safe)`
- `We rebuilt FightingTomatoes as an app. Claim your account.`)

### Preheader (the grey text under the subject in inbox previews)

`All your ratings and reviews are preserved. Set a new password to jump back in.`

### Body (HTML-ready copy)

---

**Hey {{displayName or "fight fan"}},**

Quick update from the team behind **FightingTomatoes**.

We rebuilt the site from the ground up as a native mobile app called **Good Fights** — faster, cleaner, and with a bunch of new stuff (pre-fight hype ratings, live event tracking, coverage of UFC, ONE, PFL, BKFC, boxing, and more).

As part of the move, **fightingtomatoes.com is now retired**. It redirects to the new app.

### Your account came with us

All your ratings, reviews, and history from FightingTomatoes are preserved on your Good Fights account. You have two ways to get back in:

**Option 1 — Sign in with Google** *(fastest)*
If the email address on this message works with Google sign-in, just open the app and tap **Sign in with Google**. Your legacy account will link automatically — no password setup needed.

**Option 2 — Claim with email + password**
**→ [Claim your account](https://goodfights.app/claim-account)**
That link will email you a one-time sign-in so you can set a password. Takes about 30 seconds.

### Get the app

- **iOS:** [Download on the App Store](https://apps.apple.com/us/app/good-fights/id6757172609)
- **Android:** [Get it on Google Play](https://play.google.com/store/apps/details?id=com.fightcrewapp.mobile)
- **Web:** [goodfights.app](https://goodfights.app)

### Why the change?

The old site was a side project that outgrew what a website could do. Ratings work better on a phone, during a live event, with notifications. The app is where fight fans actually live.

Thanks for being one of the originals. If you run into any issues claiming your account, reply to this email and I'll sort it out personally.

— Mike
Good Fights

---

*P.S. If you don't remember signing up, you probably rated a fight on FightingTomatoes at some point over the last few years. You can safely ignore this email — your data isn't going anywhere, and no one else can access it without this link.*

---

## Option B — Direct claim token per recipient

Bake a pre-generated token per user directly into the email so they skip a step.

**Pros:** One click to set password.
**Cons:**
- Tokens currently expire in 24 hours (`auth.fastify.ts:2379`) — bad for a 1,966-person blast that may take hours to send or sit in inboxes for days
- Would need to extend expiry to e.g. 14–30 days just for this blast
- Any user who ignores the email past expiry hits a dead link

**Recommendation:** Go with Option A unless we extend token TTL.

---

## Sending mechanics — SendGrid Marketing Campaigns

**Why SendGrid:** the backend already sends transactional email through SendGrid SMTP (`noreply@goodfights.app` via `smtp.sendgrid.net`, see `packages/backend/.env`). The domain is already authenticated (SPF/DKIM/DMARC in place, otherwise existing verify/reset emails wouldn't be landing). No new vendor, no new DNS.

**Why the separate Marketing Campaigns product** (vs. the existing transactional SMTP): bulk-send reputation is tracked separately from transactional reputation. If this blast triggers spam complaints on the transactional stream, it would hurt deliverability of password-reset emails. Marketing Campaigns uses a different IP pool. Free tier covers up to 2,000 contacts / 6,000 sends per month — fits this blast exactly.

### Files ready to use

- `docs/legacy-user-announcement-email.html` — production HTML, inline-styled, paste into SendGrid design editor's "Code Editor" mode
- `docs/legacy-user-announcement-email.txt` — plain-text version (required for deliverability; SendGrid can auto-generate but the handcrafted version is better)
- `packages/backend/scripts/exportLegacyUsersForAnnouncement.ts` — generates `legacy-users-for-announcement.csv` at project root, filtering on `password=null AND wantsEmails=true AND isActive=true`

### Step-by-step

1. **Generate the recipient CSV** (from project root):
   ```bash
   cd packages/backend && npx tsx scripts/exportLegacyUsersForAnnouncement.ts
   ```
   CSV lands at `legacy-users-for-announcement.csv` with columns `email, displayName, firstName`.

2. **Log into SendGrid** → switch to the **Marketing Campaigns** side of the product (top-right product switcher, or sidebar under "Marketing" if using the new UI).

3. **Sender:** From-address is `contact@goodfights.app` (already in use for feedback replies via `email.ts:289`, so it's authenticated on the transactional side). In SendGrid, confirm it's also verified on the Marketing Campaigns side — if not, do Single Sender Verification (5-minute click-the-email flow). Display name: `Mike from Good Fights` (or similar) so it reads personally in the inbox.

4. **Contacts → upload CSV** → map `email` to Email, `displayName` to a custom field called `displayName` (create it during upload if SendGrid prompts). Tag the list `legacy-announcement-2026-04`.

5. **Create single send** → start from blank → use Code Editor (not drag-and-drop) → paste the contents of `legacy-user-announcement-email.html`.

6. **Substitution tags** — SendGrid's tag syntax is `{{displayName}}` which matches what's in the HTML already. The `[unsubscribe]` placeholder will be replaced by SendGrid's unsubscribe URL automatically when you enable the unsubscribe group.

7. **Unsubscribe group** — create a new group called "Legacy user announcement" (one-time). Associate this send with it. SendGrid will suppress future sends to anyone who unsubscribes.

8. **Plain-text version** — paste contents of `legacy-user-announcement-email.txt`. Don't let SendGrid auto-generate — the auto version looks like garbage.

9. **Subject:** `FightingTomatoes.com is now "Good Fights" App. Claim Your Account.`

10. **Preheader:** `All your ratings and reviews are preserved. Sign in with Google, or set a new password to jump back in.`

11. **Physical address in footer** — replace the `{{PHYSICAL_ADDRESS}}` token in both HTML and text with the real address before sending. (SendGrid will also require a global sender address configured in the account settings.)

12. **Test send** — send to yourself first (both an hotmail/outlook address and a gmail address if possible, to confirm rendering + inbox placement on both).

13. **Schedule or send** — weekday morning, ET timezone, is generally the best window for a B2C announcement. Tuesday/Wednesday typically outperform Monday/Friday.

### Deliverability watchouts

- Don't send from a brand-new IP/subdomain. You're fine here — `goodfights.app` is already warmed up via transactional sends.
- Send the test to yourself at both Gmail and Outlook addresses. Check the spam folder in both. If either puts it in spam, stop and investigate (likely: SPF/DKIM alignment mismatch when using a different from-address).
- Bulk blast gets higher complaint rates than transactional. Watch SendGrid's stats dashboard for the first hour — if complaint rate >0.3%, pause.

---

## Open questions for Mike

- [x] Option A or B? → **A**
- [x] Subject line? → `FightingTomatoes.com is now "Good Fights" App. Claim Your Account.`
- [x] App Store + Play Store URLs → in draft
- [x] Sending service → **SendGrid Marketing Campaigns** (already have the account)
- [ ] Physical mailing address for footer (blocker — get a one-month virtual mailbox, or use a trusted alternate address)
- [x] Unsubscribe mechanism → SendGrid's built-in unsubscribe group (better than `mailto:`, suppresses future sends automatically)
- [x] From-address: `contact@goodfights.app` with display name "Mike from Good Fights" (or similar personal framing)
