import { prisma } from '../lib/prisma';
import { sendPushNotifications } from './notificationService';


type FollowedFighterIdentity = {
  followedFirstName: string | null;
  followedLastName: string | null;
  opponentFirstName: string | null;
  opponentLastName: string | null;
};

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim() || 'Unknown';
}

function formatFightDateShort(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(date);
  } catch {
    // Bad timezone — fall back to UTC short date
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }
}

/**
 * Dispatch a "fight just got booked" notification to a single user for a single
 * followed fighter on a freshly-created FightNotificationMatch row.
 *
 * Caller guarantees: matchId is a brand-new row, and the fight was created
 * AFTER the user's follow on the fighter. Caller passes followedFighterId so
 * we know which fighter to feature in the copy ("Pereira just got booked").
 */
export async function dispatchBookedNotification(args: {
  matchId: string;
  userId: string;
  fightId: string;
  followedFighterId: string;
}): Promise<void> {
  const { matchId, userId, fightId, followedFighterId } = args;

  // Skip if already sent (defensive — caller should not invoke twice)
  const match = await prisma.fightNotificationMatch.findUnique({
    where: { id: matchId },
    select: { bookedSentAt: true },
  });
  if (!match || match.bookedSentAt) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pushToken: true,
      notificationsEnabled: true,
      notifyFollowedBooked: true,
      timezone: true,
    },
  });

  if (
    !user ||
    !user.notificationsEnabled ||
    !user.notifyFollowedBooked ||
    !user.pushToken
  ) {
    // Lane disabled or no push token — still record dispatch attempt as skipped
    // by leaving bookedSentAt null (so a future re-enable could fire on a fresh
    // booking). For now no-op.
    return;
  }

  const fight = await prisma.fight.findUnique({
    where: { id: fightId },
    select: {
      id: true,
      fighter1Id: true,
      fighter2Id: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
      event: { select: { name: true, date: true } },
    },
  });
  if (!fight) return;

  const identity: FollowedFighterIdentity = fight.fighter1Id === followedFighterId
    ? {
        followedFirstName: fight.fighter1.firstName,
        followedLastName: fight.fighter1.lastName,
        opponentFirstName: fight.fighter2.firstName,
        opponentLastName: fight.fighter2.lastName,
      }
    : {
        followedFirstName: fight.fighter2.firstName,
        followedLastName: fight.fighter2.lastName,
        opponentFirstName: fight.fighter1.firstName,
        opponentLastName: fight.fighter1.lastName,
      };

  const followedName = fullName(identity.followedFirstName, identity.followedLastName);
  const opponentName = fullName(identity.opponentFirstName, identity.opponentLastName);
  const eventDate = formatFightDateShort(fight.event.date, user.timezone);

  const title = `${followedName} just got booked`;
  const body = `vs ${opponentName} · ${eventDate}`;

  await sendPushNotifications([userId], {
    title,
    body,
    data: { fightId, screen: 'fight-detail', lane: 'booked' },
  });

  await prisma.$transaction([
    prisma.fightNotificationMatch.update({
      where: { id: matchId },
      data: { bookedSentAt: new Date() },
    }),
    prisma.followNotificationEvent.create({
      data: {
        matchId,
        userId,
        fightId,
        fighterId: followedFighterId,
        lane: 'BOOKED',
      },
    }),
  ]);

  console.log(`[Notifications] Booked dispatched: user=${userId} fighter=${followedName} vs ${opponentName}`);
}

// ============== Timezone helpers ==============

type LocalDateParts = { year: number; month: number; day: number; hour: number };

/**
 * Extract year/month/day/hour as observed in `timezone` for a UTC date.
 */
function getLocalParts(date: Date, timezone: string): LocalDateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  let hour = get('hour');
  if (hour === 24) hour = 0; // Intl quirk: midnight reported as 24
  return { year: get('year'), month: get('month'), day: get('day'), hour };
}

/**
 * Compute the event's calendar day — the day the card takes place.
 *
 * `event.date` is a DATE MARKER the scrapers store at a fixed UTC hour
 * (UFC = 12:00 UTC, Tapology = 00:00 UTC), NOT a real per-viewer kickoff instant.
 * Its UTC calendar date is the intended event day for every scraper we run, so we
 * read the day straight off the UTC components.
 *
 * This previously reinterpreted `event.date` in the *user's* timezone and rolled
 * the day back when the local hour was < noon (meant for genuine 3am overnight
 * starts). But the UFC noon-UTC marker reads as 5-8am local across the entire US,
 * so the rollback always fired and every US user got morning-of / 3-day pushes a
 * full day early. (Tapology's 00:00-UTC marker shifted to the prior evening for the
 * same net one-day-early effect.) Day-granular triggers don't need the viewer's
 * timezone at all — only the 9am/10am send time does, and that still uses
 * `user.timezone` via `localWallClockToUTC` below.
 */
export function computeFightDay(
  eventDate: Date,
): { year: number; month: number; day: number } {
  return {
    year: eventDate.getUTCFullYear(),
    month: eventDate.getUTCMonth() + 1,
    day: eventDate.getUTCDate(),
  };
}

/**
 * Subtract `n` days from a calendar date (handles month/year boundaries).
 */
function subtractDays(
  date: { year: number; month: number; day: number },
  n: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() - n);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Find the UTC instant at which a user's wall clock reads `year-month-day hour:00`
 * in `timezone`. Uses two-step correction — accurate for hours well away from
 * DST transitions (our 9am/10am triggers are safe).
 */
function localWallClockToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
): Date | null {
  try {
    // First guess: treat the wall-clock components as if they were UTC
    const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
    const actual = getLocalParts(guess, timezone);
    const targetMs = Date.UTC(year, month - 1, day, hour);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour);
    return new Date(guess.getTime() + (targetMs - actualMs));
  } catch {
    return null;
  }
}

// ============== 3-day + morning-of dispatch ==============

const TRIGGER_WINDOW_MS = 30 * 60 * 1000; // accept fires within 30min of target

type CandidateFight = {
  id: string;
  fighter1Id: string;
  fighter2Id: string;
  fighter1: { firstName: string | null; lastName: string | null };
  fighter2: { firstName: string | null; lastName: string | null };
  event: { id: string; name: string; date: Date };
};

type CandidateUser = {
  id: string;
  pushToken: string | null;
  notificationsEnabled: boolean;
  notifyFollowed3DayWarn: boolean;
  notifyFollowedMorningOf: boolean;
  timezone: string;
};

// A single fighter-follow match that has hit its trigger window and is ready to
// notify. We collect these across the whole scan, then aggregate per
// (user, lane, event) so a user following several fighters on one card gets ONE
// push instead of one per fighter.
type PendingDispatch = {
  matchId: string;
  user: CandidateUser;
  fight: CandidateFight;
  followedFighterId: string;
  lane: 'THREE_DAY' | 'MORNING_OF';
};

function followedNameFor(fight: CandidateFight, followedFighterId: string): string {
  const isFollowedFighter1 = fight.fighter1Id === followedFighterId;
  return fullName(
    isFollowedFighter1 ? fight.fighter1.firstName : fight.fighter2.firstName,
    isFollowedFighter1 ? fight.fighter1.lastName : fight.fighter2.lastName,
  );
}

function opponentNameFor(fight: CandidateFight, followedFighterId: string): string {
  const isFollowedFighter1 = fight.fighter1Id === followedFighterId;
  return fullName(
    isFollowedFighter1 ? fight.fighter2.firstName : fight.fighter1.firstName,
    isFollowedFighter1 ? fight.fighter2.lastName : fight.fighter1.lastName,
  );
}

/**
 * Record that a lane fired for a single match: marks the per-lane sentAt and logs
 * one FollowNotificationEvent (per-fighter, load-bearing for attribution). The
 * push itself is sent once per group by the caller — this only persists state.
 */
async function recordLaneSent(d: PendingDispatch): Promise<void> {
  const sentAtField = d.lane === 'THREE_DAY' ? 'threeDaySentAt' : 'morningOfSentAt';
  await prisma.$transaction([
    prisma.fightNotificationMatch.update({
      where: { id: d.matchId },
      data: { [sentAtField]: new Date() },
    }),
    prisma.followNotificationEvent.create({
      data: {
        matchId: d.matchId,
        userId: d.user.id,
        fightId: d.fight.id,
        fighterId: d.followedFighterId,
        lane: d.lane,
      },
    }),
  ]);
}

/**
 * Send one aggregated push for all of a user's followed fighters on the same
 * event+lane, then persist per-match state for each. One fighter keeps the
 * personal "Pereira fights today" copy; multiple collapse to a count.
 */
async function dispatchLaneGroup(group: PendingDispatch[]): Promise<void> {
  if (group.length === 0) return;
  const { user, fight, lane } = group[0];
  const todayPhrase = lane === 'THREE_DAY' ? 'fight in 3 days' : 'fight today';

  let title: string;
  let body: string;
  if (group.length === 1) {
    const followedName = followedNameFor(fight, group[0].followedFighterId);
    const opponentName = opponentNameFor(fight, group[0].followedFighterId);
    title = lane === 'THREE_DAY' ? `${followedName} fights in 3 days` : `${followedName} fights today`;
    body = `vs ${opponentName} · ${fight.event.name}`;
  } else {
    title = `${group.length} fighters you follow ${todayPhrase}`;
    const names = group
      .map((d) => followedNameFor(d.fight, d.followedFighterId))
      .slice(0, 3)
      .join(', ');
    const extra = group.length > 3 ? ` +${group.length - 3} more` : '';
    body = `${names}${extra} · ${fight.event.name}`;
  }

  await sendPushNotifications([user.id], {
    title,
    body,
    // Multiple fighters → land on the event; a single fighter → their fight.
    data:
      group.length === 1
        ? { fightId: fight.id, screen: 'fight-detail', lane: lane.toLowerCase() }
        : { eventId: fight.event.id, screen: 'event-detail', lane: lane.toLowerCase() },
  });

  for (const d of group) {
    await recordLaneSent(d).catch((err) =>
      console.error(`[FollowFighterCron] ${lane} record failed:`, err),
    );
  }

  console.log(
    `[Notifications] ${lane} dispatched: user=${user.id} event=${fight.event.name} (${group.length} fighter${group.length === 1 ? '' : 's'})`,
  );
}

/**
 * Cron entry point — runs every 15 minutes. Scans pending fighter-follow
 * matches and dispatches 3-day-warn and morning-of pushes whose user-local
 * trigger time falls within the current 30-minute window.
 *
 * Performance: O(matches × O(1) Intl ops). Match count bounded by
 * (active follows × upcoming fights within 5 days × not-yet-sent). At current
 * scale this is small; revisit batching at 100K+ users.
 */
export async function runFollowFighterCron(): Promise<void> {
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  const horizonStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  // Pull fighter-follow matches still pending on either lane
  const matches = await prisma.fightNotificationMatch.findMany({
    where: {
      isActive: true,
      OR: [{ threeDaySentAt: null }, { morningOfSentAt: null }],
      rule: {
        isActive: true,
        name: { startsWith: 'Fighter Follow:' },
      },
    },
    include: {
      rule: { select: { conditions: true } },
    },
  });

  if (matches.length === 0) return;

  // Batch-fetch fights in horizon (event.date is authoritative; Fight.startTime
  // is a display string like "10:00 PM" not a timestamp).
  const fightIds = [...new Set(matches.map((m) => m.fightId))];
  const fights = await prisma.fight.findMany({
    where: {
      id: { in: fightIds },
      fightStatus: 'UPCOMING',
      event: { date: { gte: horizonStart, lte: horizonEnd } },
    },
    select: {
      id: true,
      fighter1Id: true,
      fighter2Id: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
      event: { select: { id: true, name: true, date: true } },
    },
  });
  const fightById = new Map<string, CandidateFight>(fights.map((f) => [f.id, f]));

  if (fightById.size === 0) return;

  // Batch-fetch users
  const userIds = [...new Set(matches.map((m) => m.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      pushToken: true,
      notificationsEnabled: true,
      notifyFollowed3DayWarn: true,
      notifyFollowedMorningOf: true,
      timezone: true,
    },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Collect everything that's due this pass, then dispatch one push per
  // (user, lane, event) so multi-fighter cards don't spam.
  const pending: PendingDispatch[] = [];

  for (const match of matches) {
    const fight = fightById.get(match.fightId);
    if (!fight) continue;
    const user = userById.get(match.userId);
    if (!user || !user.notificationsEnabled || !user.pushToken) continue;

    // Determine which fighter on this fight the user follows
    const conditions = (match.rule.conditions as { fighterIds?: string[] }) || {};
    const ids = conditions.fighterIds || [];
    let followedFighterId: string | undefined;
    if (ids.includes(fight.fighter1Id)) followedFighterId = fight.fighter1Id;
    else if (ids.includes(fight.fighter2Id)) followedFighterId = fight.fighter2Id;
    if (!followedFighterId) continue;

    const fightDay = computeFightDay(fight.event.date);

    // 3-day-warn: 10am local on fight-day minus 3 days
    if (!match.threeDaySentAt && user.notifyFollowed3DayWarn) {
      const target = subtractDays(fightDay, 3);
      const trigger = localWallClockToUTC(
        target.year,
        target.month,
        target.day,
        10,
        user.timezone,
      );
      if (
        trigger &&
        now >= trigger &&
        now.getTime() - trigger.getTime() < TRIGGER_WINDOW_MS
      ) {
        pending.push({ matchId: match.id, user, fight, followedFighterId, lane: 'THREE_DAY' });
      }
    }

    // Morning-of: 9am local on fight-day
    if (!match.morningOfSentAt && user.notifyFollowedMorningOf) {
      const trigger = localWallClockToUTC(
        fightDay.year,
        fightDay.month,
        fightDay.day,
        9,
        user.timezone,
      );
      if (
        trigger &&
        now >= trigger &&
        now.getTime() - trigger.getTime() < TRIGGER_WINDOW_MS
      ) {
        pending.push({ matchId: match.id, user, fight, followedFighterId, lane: 'MORNING_OF' });
      }
    }
  }

  // Group by user + lane + event, then send one aggregated push per group.
  const groups = new Map<string, PendingDispatch[]>();
  for (const d of pending) {
    const key = `${d.user.id}|${d.lane}|${d.fight.event.id}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }

  for (const group of groups.values()) {
    await dispatchLaneGroup(group).catch((err) =>
      console.error('[FollowFighterCron] group dispatch failed:', err),
    );
  }
}

