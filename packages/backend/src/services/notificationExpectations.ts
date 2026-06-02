/**
 * Notification Expectations
 *
 * Operator-facing visibility into who is *expecting* a notification for a fight.
 * The source of truth is the active FightNotificationMatch rows (created by the
 * notification rule engine: fighter follows, hype rules, etc.). Each active match
 * means "this user expects us to ping them about this fight."
 *
 * Two jobs:
 *  1. Surface per-event / per-fight expectation counts in the admin panel so the
 *     operator knows which events actually have people waiting (and therefore
 *     which to monitor + send manual notifications for, until every org has a
 *     live tracker).
 *  2. Alert the operator (push to admin accounts) when a *new* expectation appears
 *     on a LIVE or imminent event — i.e. someone started waiting on a card the
 *     operator might otherwise be ignoring because nobody was waiting yet.
 *
 * Scale note: queries are bounded to fights belonging to LIVE/UPCOMING events,
 * so the match scan stays small even as total historical matches grow.
 */

import { PrismaClient } from '@prisma/client';
import { sendPushNotifications } from './notificationService';

const ALERT_CURSOR_KEY = 'notif_expectation_alert_cursor';

// How far ahead an UPCOMING event counts as "imminent" for alerting purposes.
const IMMINENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// Pending = a fight we could still notify about. Completed/cancelled fights have
// already had their moment, so they don't count toward "users still waiting".
const PENDING_FIGHT_STATUSES = ['UPCOMING', 'LIVE'] as const;

export interface EventExpectationSummary {
  eventId: string;
  name: string;
  promotion: string;
  eventStatus: string;
  date: Date;
  earlyPrelimStartTime: Date | null;
  prelimStartTime: Date | null;
  mainStartTime: Date | null;
  scraperType: string | null;
  useManualLiveTracker: boolean;
  hasAutoTracker: boolean;
  // Distinct users with an active match on a still-pending fight in this event.
  expectingUsers: number;
  // Number of still-pending fights that have at least one active match.
  expectingFights: number;
  // Distinct users whose expectation was created in the last 24h (recent adds).
  recentExpectingUsers: number;
}

interface ActiveEventRow {
  id: string;
  name: string;
  promotion: string;
  eventStatus: string;
  date: Date;
  earlyPrelimStartTime: Date | null;
  prelimStartTime: Date | null;
  mainStartTime: Date | null;
  scraperType: string | null;
  useManualLiveTracker: boolean;
  fights: { id: string; fightStatus: string }[];
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function earliestStart(e: {
  earlyPrelimStartTime: Date | null;
  prelimStartTime: Date | null;
  mainStartTime: Date | null;
  date: Date;
}): Date {
  return e.earlyPrelimStartTime || e.prelimStartTime || e.mainStartTime || e.date;
}

/**
 * Per-event expectation summary across all LIVE + UPCOMING events.
 * Events with zero expecting users are still returned (so the operator can see
 * the full board), sorted live-first then soonest-first.
 */
export async function getActiveEventExpectations(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<EventExpectationSummary[]> {
  const events = (await prisma.event.findMany({
    where: { eventStatus: { in: ['LIVE', 'UPCOMING'] } },
    select: {
      id: true,
      name: true,
      promotion: true,
      eventStatus: true,
      date: true,
      earlyPrelimStartTime: true,
      prelimStartTime: true,
      mainStartTime: true,
      scraperType: true,
      useManualLiveTracker: true,
      fights: { select: { id: true, fightStatus: true } },
    },
  })) as ActiveEventRow[];

  // fightId -> eventId, for pending fights only
  const fightToEvent = new Map<string, string>();
  for (const e of events) {
    for (const f of e.fights) {
      if ((PENDING_FIGHT_STATUSES as readonly string[]).includes(f.fightStatus)) {
        fightToEvent.set(f.id, e.id);
      }
    }
  }

  const pendingFightIds = [...fightToEvent.keys()];
  const matches = pendingFightIds.length
    ? await prisma.fightNotificationMatch.findMany({
        where: { isActive: true, fightId: { in: pendingFightIds } },
        select: { userId: true, fightId: true, createdAt: true },
      })
    : [];

  // Aggregate per event.
  const recentCutoff = now.getTime() - RECENT_WINDOW_MS;
  const perEvent = new Map<
    string,
    { users: Set<string>; recentUsers: Set<string>; fights: Set<string> }
  >();
  for (const m of matches) {
    const eventId = fightToEvent.get(m.fightId);
    if (!eventId) continue;
    let agg = perEvent.get(eventId);
    if (!agg) {
      agg = { users: new Set(), recentUsers: new Set(), fights: new Set() };
      perEvent.set(eventId, agg);
    }
    agg.users.add(m.userId);
    agg.fights.add(m.fightId);
    if (m.createdAt.getTime() >= recentCutoff) agg.recentUsers.add(m.userId);
  }

  const summaries: EventExpectationSummary[] = events.map((e) => {
    const agg = perEvent.get(e.id);
    return {
      eventId: e.id,
      name: e.name,
      promotion: e.promotion,
      eventStatus: e.eventStatus,
      date: e.date,
      earlyPrelimStartTime: e.earlyPrelimStartTime,
      prelimStartTime: e.prelimStartTime,
      mainStartTime: e.mainStartTime,
      scraperType: e.scraperType,
      useManualLiveTracker: e.useManualLiveTracker,
      hasAutoTracker: !!e.scraperType,
      expectingUsers: agg ? agg.users.size : 0,
      expectingFights: agg ? agg.fights.size : 0,
      recentExpectingUsers: agg ? agg.recentUsers.size : 0,
    };
  });

  // Sort: LIVE first, then by earliest start ascending.
  summaries.sort((a, b) => {
    if (a.eventStatus !== b.eventStatus) {
      if (a.eventStatus === 'LIVE') return -1;
      if (b.eventStatus === 'LIVE') return 1;
    }
    return earliestStart(a).getTime() - earliestStart(b).getTime();
  });

  return summaries;
}

export interface FightExpectation {
  fightId: string;
  expectingUsers: number;
}

export interface FightExpectationDetail {
  // Distinct users with an active match (whether or not already notified).
  waiting: number;
  // Distinct users whose match is still UNsent (notificationSent=false) — i.e.
  // who would actually receive a manual "send now" ping right now.
  pending: number;
}

/**
 * Per-fight expectation counts for a single event, keyed by fightId.
 * Includes a total of distinct users across the whole event.
 *
 * `pending` reflects the walkout/up-next dispatch flag (notificationSent): once a
 * fight's ping has fired (auto or manual), pending drops to 0, which the admin
 * panel uses to show "✓ Sent" instead of an active send button.
 */
export async function getEventFightExpectations(
  prisma: PrismaClient,
  eventId: string
): Promise<{ totalUsers: number; perFight: Record<string, FightExpectationDetail> }> {
  const fights = await prisma.fight.findMany({
    where: { eventId },
    select: { id: true },
  });
  const fightIds = fights.map((f) => f.id);
  if (fightIds.length === 0) return { totalUsers: 0, perFight: {} };

  const matches = await prisma.fightNotificationMatch.findMany({
    where: { isActive: true, fightId: { in: fightIds } },
    select: { userId: true, fightId: true, notificationSent: true },
  });

  const waitingSets = new Map<string, Set<string>>();
  const pendingSets = new Map<string, Set<string>>();
  const allUsers = new Set<string>();
  for (const m of matches) {
    allUsers.add(m.userId);
    let w = waitingSets.get(m.fightId);
    if (!w) {
      w = new Set();
      waitingSets.set(m.fightId, w);
    }
    w.add(m.userId);
    if (!m.notificationSent) {
      let p = pendingSets.get(m.fightId);
      if (!p) {
        p = new Set();
        pendingSets.set(m.fightId, p);
      }
      p.add(m.userId);
    }
  }

  const perFight: Record<string, FightExpectationDetail> = {};
  for (const [fightId, set] of waitingSets) {
    perFight[fightId] = {
      waiting: set.size,
      pending: pendingSets.get(fightId)?.size ?? 0,
    };
  }

  return { totalUsers: allUsers.size, perFight };
}

async function getAdminUserIds(prisma: PrismaClient): Promise<string[]> {
  const adminEmails = (process.env.ADMIN_EMAILS?.split(',') || [])
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length === 0) return [];
  const admins = await prisma.user.findMany({
    where: { email: { in: adminEmails } },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/**
 * Detect newly-created expectations on LIVE or imminent events and push the
 * admin account(s) so the operator can go monitor + send the notification
 * manually. Cursor-based via SystemConfig so each new match alerts exactly once.
 *
 * Called from the 5-minute event lifecycle check.
 */
export async function checkAndAlertNewExpectations(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<{ alerted: number; events: number }> {
  // Read cursor (last time we checked). First run: seed cursor to now and skip,
  // so we don't alert on the entire backlog.
  const cursorRow = await prisma.systemConfig.findUnique({
    where: { key: ALERT_CURSOR_KEY },
  });
  if (!cursorRow) {
    await prisma.systemConfig.create({
      data: { key: ALERT_CURSOR_KEY, value: now.toISOString() },
    });
    return { alerted: 0, events: 0 };
  }
  const cursor = new Date(String(cursorRow.value));

  // LIVE events, plus UPCOMING events starting within the imminent window.
  const candidateEvents = await prisma.event.findMany({
    where: { eventStatus: { in: ['LIVE', 'UPCOMING'] } },
    select: {
      id: true,
      name: true,
      eventStatus: true,
      date: true,
      earlyPrelimStartTime: true,
      prelimStartTime: true,
      mainStartTime: true,
      fights: { select: { id: true, fightStatus: true } },
    },
  });

  const relevantEvents = candidateEvents.filter((e) => {
    if (e.eventStatus === 'LIVE') return true;
    const start = earliestStart(e).getTime();
    return start - now.getTime() <= IMMINENT_WINDOW_MS && start >= now.getTime() - IMMINENT_WINDOW_MS;
  });

  // Map pending fightIds -> event for relevant events.
  const fightToEvent = new Map<string, { id: string; name: string }>();
  for (const e of relevantEvents) {
    for (const f of e.fights) {
      if ((PENDING_FIGHT_STATUSES as readonly string[]).includes(f.fightStatus)) {
        fightToEvent.set(f.id, { id: e.id, name: e.name });
      }
    }
  }

  const pendingFightIds = [...fightToEvent.keys()];
  const newMatches = pendingFightIds.length
    ? await prisma.fightNotificationMatch.findMany({
        where: {
          isActive: true,
          fightId: { in: pendingFightIds },
          createdAt: { gt: cursor },
        },
        select: { userId: true, fightId: true },
      })
    : [];

  // Advance cursor regardless, so we never re-alert on the same window.
  await prisma.systemConfig.update({
    where: { key: ALERT_CURSOR_KEY },
    data: { value: now.toISOString() },
  });

  if (newMatches.length === 0) return { alerted: 0, events: 0 };

  // Group new expectations per event (distinct users).
  const perEvent = new Map<string, { name: string; users: Set<string> }>();
  for (const m of newMatches) {
    const ev = fightToEvent.get(m.fightId);
    if (!ev) continue;
    let agg = perEvent.get(ev.id);
    if (!agg) {
      agg = { name: ev.name, users: new Set() };
      perEvent.set(ev.id, agg);
    }
    agg.users.add(m.userId);
  }
  if (perEvent.size === 0) return { alerted: 0, events: 0 };

  const adminIds = await getAdminUserIds(prisma);
  if (adminIds.length === 0) {
    console.warn('[NotifExpectations] New expectations detected but no admin push targets resolved');
    return { alerted: 0, events: perEvent.size };
  }

  // One push per event with new expectations (keeps the alert specific).
  for (const [eventId, agg] of perEvent) {
    const n = agg.users.size;
    await sendPushNotifications(adminIds, {
      title: '🔔 Someone is waiting on a live card',
      body: `${n} new notification ${n === 1 ? 'request' : 'requests'} on ${agg.name}. Go monitor + send manually.`,
      data: { type: 'admin_expectation_alert', eventId },
    }).catch((err) => console.error('[NotifExpectations] admin push failed:', err));
    console.log(`[NotifExpectations] Alerted admins: ${n} new expectation(s) on ${agg.name}`);
  }

  return { alerted: newMatches.length, events: perEvent.size };
}
