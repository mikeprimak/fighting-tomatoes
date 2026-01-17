# Admin Dashboard: Operations & Feedback Management

## Implementation Status

**Started**: 2026-01-17
**Status**: COMPLETED

### Progress Checklist

- [x] Add email alert methods to EmailService (`src/utils/email.ts`)
  - [x] `sendScraperFailureAlert(org, errorMessage)` - sends email when scraper fails
  - [x] `sendFeedbackNotification(feedbackId, userEmail, content, platform, appVersion)` - sends email on new feedback
- [x] Add ScraperLog model to Prisma schema (`prisma/schema.prisma`)
- [x] Add scraper log API endpoints to `src/routes/admin.ts`
- [x] Add feedback CRUD endpoints to `src/routes/admin.ts`
- [x] Hook feedback submission to send email notification (`src/routes/feedback.ts`)
- [x] Add Operations and Feedback tabs to `public/admin.html`
- [x] Run Prisma migration (`npx prisma db push`) - *Will run on deploy to Render*

### Post-Deploy Steps

1. Set `ADMIN_ALERT_EMAIL` env var on Render to receive alerts
2. The Prisma migration will run automatically on deploy
3. Documentation added to `scraper-refinement.md` and `live-event-tracker-refinement.md`

---

## Overview

Extend the existing admin panel (`packages/backend/public/admin.html`) with:
1. **Operations tab** - Monitor scrapers and live event trackers with email alerts
2. **Feedback tab** - View and manage user feedback with email notifications

## Current State (Before Implementation)

- **Admin panel exists** at `/admin.html` - manages events, fights, fighters
- **Email service exists** at `src/utils/email.ts` - nodemailer with SMTP (used for verification, password reset)
- **Feedback system exists** - saves to `UserFeedback` table but no admin UI or notifications
- **Scraper status endpoint** exists: `GET /api/admin/scraper-status?key=...`
- **Live tracker endpoints** exist: `/api/admin/live-tracker/oktagon/start|stop|status`
- **No persistent logging** - scraper runs not stored in database
- **No alerts** - failures only visible in GitHub Actions or Render logs

---

## Implementation Details

### Phase 1: Email Alert Methods (COMPLETED)

Added to `src/utils/email.ts`:

```typescript
// Admin alert for scraper failures
static async sendScraperFailureAlert(org: string, errorMessage: string)

// Admin alert for new user feedback
static async sendFeedbackNotification(feedbackId: string, userEmail: string | null, content: string, platform?: string, appVersion?: string)
```

**New env var required:** `ADMIN_ALERT_EMAIL` (your email address for alerts)

### Phase 2: Database Logging (NEXT)

Add to `prisma/schema.prisma`:

```prisma
model ScraperLog {
  id            String   @id @default(uuid())
  type          String   // "daily_scraper" | "live_tracker"
  organization  String   // "UFC", "OKTAGON", etc.
  status        String   // "started" | "completed" | "failed"
  eventId       String?  // For live trackers
  eventName     String?
  eventsScraped Int?
  fightsUpdated Int?
  fightersAdded Int?
  errorMessage  String?
  duration      Int?     // milliseconds
  startedAt     DateTime
  completedAt   DateTime?
  createdAt     DateTime @default(now())

  @@map("scraper_logs")
}
```

### Phase 3: Backend API Endpoints

Add to `src/routes/admin.ts`:

**Scraper Log Endpoints:**
- `GET /api/admin/scraper-logs?type=&org=&limit=` - Get recent logs
- `POST /api/admin/scraper-logs` - Create log entry (called by scrapers)

**Feedback CRUD Endpoints:**
- `GET /api/admin/feedback` - List all feedback (with filters: unread, unresolved)
- `GET /api/admin/feedback/:id` - Get single feedback
- `PUT /api/admin/feedback/:id` - Update (mark read, add notes, resolve)
- `DELETE /api/admin/feedback/:id` - Delete feedback

### Phase 4: Hook Feedback to Send Email

Modify `src/routes/feedback.ts` to call `EmailService.sendFeedbackNotification()` after saving feedback.

### Phase 5: Admin Panel Frontend

Add two new tabs to `public/admin.html`:

#### Operations Tab
```
┌─────────────────────────────────────────────────────────────┐
│ Fight Admin                [Events] [Operations] [Feedback] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DAILY SCRAPERS                              [Run All]      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ UFC      ✅ 2h ago    11 events  119 fights  [Run]  │   │
│  │ BKFC     ✅ 1d ago    3 events   22 fights   [Run]  │   │
│  │ OKTAGON  ✅ 1d ago    7 events   49 fights   [Run]  │   │
│  │ PFL      ❌ Failed    Error: timeout         [Run]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  LIVE TRACKERS                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ OKTAGON  🔴 LIVE   Oktagon 82    47 scrapes  [Stop] │   │
│  │ Matchroom ⚪ Idle   -             -           [Start]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  RECENT ACTIVITY                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 18:45 OKTAGON tracker started - Oktagon 82          │   │
│  │ 17:00 UFC scraper completed - 11 events, 119 fights │   │
│  │ 12:30 BKFC scraper completed - 3 events, 22 fights  │   │
│  │ 12:00 PFL scraper failed - Connection timeout       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Feedback Tab
```
┌─────────────────────────────────────────────────────────────┐
│ Fight Admin                [Events] [Operations] [Feedback] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USER FEEDBACK                    [Filter: All ▼] (5 total) │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔵 2h ago | user@email.com | iOS 1.0.0              │   │
│  │ "Love the app! But it would be great if..."         │   │
│  │                              [Mark Read] [Delete]    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✅ 1d ago | mike@test.com | Android 1.0.0           │   │
│  │ "Found a bug when I try to rate a fight..."         │   │
│  │ Notes: Fixed in v1.0.1      [Resolved] [Delete]     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `src/utils/email.ts` | Add `sendScraperFailureAlert()` and `sendFeedbackNotification()` | ✅ DONE |
| `prisma/schema.prisma` | Add ScraperLog model | ✅ DONE |
| `src/routes/admin.ts` | Add scraper log endpoints, feedback CRUD endpoints | ✅ DONE |
| `src/routes/feedback.ts` | Add email notification on new feedback | ✅ DONE |
| `public/admin.html` | Add Operations tab + Feedback tab | ✅ DONE |

---

## Verification Steps

1. Run `npx prisma db push` to add new table
2. Submit feedback from app → verify email received + shows in Feedback tab
3. Manually trigger a scraper via admin panel → verify log appears
4. Start/stop live tracker → verify status in Operations tab
5. Simulate a scraper failure → verify email alert sent

---

## Environment Variables

Add to Render/production environment:
```
ADMIN_ALERT_EMAIL=your-email@example.com
```

---

## Future: Adding New Organizations/Scrapers

When adding a new organization or scraper:

1. **Add to scraper map** in `admin.ts` (line ~85):
   ```typescript
   const scraperMap: Record<string, () => Promise<any>> = {
     'ufc': triggerDailyUFCScraper,
     'neworg': triggerNewOrgScraper,  // Add here
   };
   ```

2. **Add to organizations list** in scraper-status endpoint (line ~146):
   ```typescript
   const organizations = ['UFC', 'BKFC', 'PFL', 'ONE', 'NewOrg', ...];
   ```

3. **Add scraper trigger endpoint** if using JWT auth:
   ```typescript
   fastify.post('/admin/trigger/scraper/neworg', {...})
   ```

4. **Update admin.html** Operations tab to show the new scraper in the UI

5. **Add live tracker endpoints** if the organization has live events:
   - `/api/admin/live-tracker/neworg/start`
   - `/api/admin/live-tracker/neworg/stop`
   - `/api/admin/live-tracker/neworg/status`
