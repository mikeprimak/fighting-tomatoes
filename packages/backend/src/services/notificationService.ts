import { PrismaClient } from '@prisma/client';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const prisma = new PrismaClient();
const expo = new Expo();

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

// Legacy notification system removed - now using unified notification rule system
// See notificationRuleEngine.ts and notificationRuleHelpers.ts

/**
 * Send push notification to specific users
 */
export async function sendPushNotifications(
  userIds: string[],
  payload: NotificationPayload
): Promise<{ success: number; failed: number }> {
  // Get push tokens for these users
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      pushToken: { not: null },
      notificationsEnabled: true,
    },
    select: { id: true, pushToken: true },
  });

  const validTokens = users.filter((user) =>
    Expo.isExpoPushToken(user.pushToken!)
  );

  if (validTokens.length === 0) {
    return { success: 0, failed: 0 };
  }

  const messages: ExpoPushMessage[] = validTokens.map((user) => ({
    to: user.pushToken!,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  // Send notifications in chunks (Expo recommends max 100 per request)
  const chunks = expo.chunkPushNotifications(messages);
  let successCount = 0;
  let failedCount = 0;

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      ticketChunk.forEach((ticket) => {
        if (ticket.status === 'ok') {
          successCount++;
        } else {
          failedCount++;
          console.error('Push notification error:', ticket);
        }
      });
    } catch (error) {
      console.error('Error sending push notification chunk:', error);
      failedCount += chunk.length;
    }
  }

  return { success: successCount, failed: failedCount };
}

// Legacy notification functions removed
// All notifications now use the unified notification rule system via notifyFightStartViaRules

/**
 * Send notification for new crew message
 */
export async function notifyCrewMessage(
  crewId: string,
  crewName: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  // Get all crew members with push tokens
  const crewMembers = await prisma.crewMember.findMany({
    where: {
      crewId,
    },
    include: {
      user: {
        select: {
          id: true,
          pushToken: true,
          notificationsEnabled: true,
        },
      },
    },
  });

  const users = crewMembers
    .map((m) => m.user)
    .filter((user) => user.notificationsEnabled && user.pushToken && Expo.isExpoPushToken(user.pushToken));

  if (users.length === 0) return;

  await sendPushNotifications(
    users.map((u) => u.id),
    {
      title: `${senderName} in ${crewName}`,
      body: messagePreview,
      data: { crewId, screen: 'crew-chat' },
    }
  );
}

/**
 * Send notification when a fight starts (using notification rules)
 * This integrates with the unified notification rule system
 *
 * Fighter-follow matches are gated by the per-user `notifyFollowedWalkout`
 * toggle. Manual-fight-follow and hyped-fight matches always dispatch (they
 * have their own per-rule isActive opt-out). A user with only fighter-follow
 * matches AND walkout disabled is skipped — but their rows still get marked
 * sent so the moment isn't replayed if they re-enable later.
 */
export async function notifyFightStartViaRules(
  fightId: string,
  fighter1Name: string,
  fighter2Name: string
): Promise<void> {
  console.log(`[Notifications] Checking rules for fight start: ${fighter1Name} vs ${fighter2Name}`);

  // Safety: never notify for a cancelled fight. Matches are intentionally left
  // active (not deactivated) so a rebooked/un-cancelled fight still notifies —
  // the guard is re-evaluated on each dispatch, so a CANCELLED fight stays muted.
  const fightStatusRow = await prisma.fight.findUnique({
    where: { id: fightId },
    select: { fightStatus: true },
  });
  if (fightStatusRow?.fightStatus === 'CANCELLED') {
    console.log(`[Notifications] Skipping cancelled fight ${fightId}`);
    return;
  }

  // Get all users who have active notification matches for this fight
  const matches = await prisma.fightNotificationMatch.findMany({
    where: {
      fightId,
      isActive: true,
      notificationSent: false,
    },
    include: {
      rule: {
        select: {
          name: true,
        },
      },
    },
  });

  if (matches.length === 0) {
    console.log(`[Notifications] No active notification matches for fight ${fightId}`);
    return;
  }

  // Get user details separately
  const userIds = [...new Set(matches.map(m => m.userId))];
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      pushToken: true,
      notificationsEnabled: true,
      notifyFollowedWalkout: true,
    },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  console.log(`[Notifications] Found ${matches.length} notification matches for fight ${fightId}`);

  // Group matches by user, classifying each as fighter-follow vs other
  const matchesByUser = new Map<string, typeof matches>();
  for (const m of matches) {
    const arr = matchesByUser.get(m.userId) ?? [];
    arr.push(m);
    matchesByUser.set(m.userId, arr);
  }

  const dispatchableUserIds: string[] = [];
  const fighterFollowMatchesDispatched: typeof matches = [];

  for (const [userId, userMatches] of matchesByUser) {
    const user = userById.get(userId);
    if (!user || !user.notificationsEnabled || !user.pushToken || !Expo.isExpoPushToken(user.pushToken)) {
      continue;
    }
    const fighterFollowMatches = userMatches.filter((m) =>
      m.rule.name.startsWith('Fighter Follow:'),
    );
    const otherMatches = userMatches.filter(
      (m) => !m.rule.name.startsWith('Fighter Follow:'),
    );

    // Skip user if their only reason to be notified is a fighter-follow
    // and they've disabled the walkout lane.
    if (otherMatches.length === 0 && !user.notifyFollowedWalkout) {
      continue;
    }

    dispatchableUserIds.push(userId);
    // Track which fighter-follow match rows actually dispatch for engagement log
    if (user.notifyFollowedWalkout || otherMatches.length > 0) {
      // If walkout is on OR they're getting the push for some other reason,
      // the fighter-follow rows still constitute a dispatch from the user's POV.
      for (const m of fighterFollowMatches) fighterFollowMatchesDispatched.push(m);
    }
  }

  if (dispatchableUserIds.length === 0) {
    console.log(`[Notifications] No dispatchable users (all filtered or walkout-disabled)`);
    // Still mark sent so we don't replay later. See doc comment.
    await prisma.fightNotificationMatch.updateMany({
      where: { fightId, isActive: true, notificationSent: false },
      data: { notificationSent: true },
    });
    return;
  }

  const matchup = `${fighter1Name} vs ${fighter2Name}`;

  const result = await sendPushNotifications(
    dispatchableUserIds,
    {
      title: '🥊 Fight Up Next!',
      body: matchup,
      data: { fightId, screen: 'fight-detail' },
    }
  );

  console.log(`[Notifications] Sent ${result.success} notifications, ${result.failed} failed`);

  // Engagement log: one row per fighter-follow match that actually dispatched.
  if (fighterFollowMatchesDispatched.length > 0) {
    await prisma.followNotificationEvent.createMany({
      data: fighterFollowMatchesDispatched.map((m) => ({
        matchId: m.id,
        userId: m.userId,
        fightId: m.fightId,
        lane: 'WALKOUT' as const,
      })),
    });
  }

  // Mark all matches as sent (preserves prior behavior even for skipped users)
  await prisma.fightNotificationMatch.updateMany({
    where: {
      fightId,
      isActive: true,
      notificationSent: false,
    },
    data: {
      notificationSent: true,
    },
  });

  console.log(`[Notifications] Marked ${matches.length} notification matches as sent`);
}

/**
 * Send a section-start notification for events without a live tracker.
 *
 * Fires once per (user, event-section): aggregates all of a user's active
 * unsent match rows whose fight is in `sectionFightIds`, sends one push, and
 * marks those rows notificationSent=true. Match rows for fights NOT in this
 * section are untouched, so a later section can still fire for the same user.
 *
 * This is the "live-tracker-less" cousin of notifyFightStartViaRules — same
 * fightNotificationMatch table, different unit of work (per-section vs
 * per-fight).
 */
export async function notifyEventSectionStart(
  eventId: string,
  sectionFightIds: string[],
  eventName: string,
  sectionLabel: string | null,
): Promise<void> {
  if (sectionFightIds.length === 0) return;

  // Safety: drop any cancelled fights before we look at matches, so nobody gets a
  // "starts soon" ping for a fight that's off the card. Matches stay active so a
  // rebooked fight can still notify later.
  const statusRows = await prisma.fight.findMany({
    where: { id: { in: sectionFightIds } },
    select: { id: true, fightStatus: true },
  });
  const cancelledFightIds = new Set(
    statusRows.filter((f) => f.fightStatus === 'CANCELLED').map((f) => f.id),
  );

  const matches = (await prisma.fightNotificationMatch.findMany({
    where: {
      fightId: { in: sectionFightIds },
      isActive: true,
      notificationSent: false,
    },
    include: {
      rule: { select: { name: true } },
    },
  })).filter((m) => !cancelledFightIds.has(m.fightId));

  if (matches.length === 0) return;

  // FightNotificationMatch has no `fight` relation — pull names in one query.
  const fightsForNames = await prisma.fight.findMany({
    where: { id: { in: matches.map((m) => m.fightId) } },
    select: {
      id: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
  });
  const fightById = new Map(fightsForNames.map((f) => [f.id, f]));

  // Group matches by user
  const matchesByUser = new Map<string, typeof matches>();
  for (const m of matches) {
    const arr = matchesByUser.get(m.userId) ?? [];
    arr.push(m);
    matchesByUser.set(m.userId, arr);
  }

  const userIds = [...matchesByUser.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      pushToken: true,
      notificationsEnabled: true,
      notifyFollowedWalkout: true,
    },
  });

  const validUsers = users.filter(
    (u) => u.notificationsEnabled && u.pushToken && Expo.isExpoPushToken(u.pushToken),
  );

  if (validUsers.length === 0) {
    console.log(`[Notifications] Section-start: no valid push tokens for event ${eventName}`);
    return;
  }

  const title = sectionLabel
    ? `${eventName} ${sectionLabel} starts soon!`
    : `${eventName} starts soon!`;

  const matchedRowIds: string[] = [];
  const fighterFollowDispatched: typeof matches = [];

  for (const user of validUsers) {
    const userMatches = matchesByUser.get(user.id) ?? [];
    if (userMatches.length === 0) continue;

    const fighterFollowMatches = userMatches.filter((m) =>
      m.rule.name.startsWith('Fighter Follow:'),
    );
    const otherMatches = userMatches.filter(
      (m) => !m.rule.name.startsWith('Fighter Follow:'),
    );

    // Skip user if their only reason is a fighter-follow and walkout disabled.
    // Still mark rows sent so we don't replay later.
    if (otherMatches.length === 0 && !user.notifyFollowedWalkout) {
      for (const m of userMatches) matchedRowIds.push(m.id);
      continue;
    }

    let body: string;
    if (userMatches.length === 1) {
      const f = fightById.get(userMatches[0].fightId);
      const name1 = f?.fighter1
        ? `${f.fighter1.firstName} ${f.fighter1.lastName}`.trim()
        : 'Fighter 1';
      const name2 = f?.fighter2
        ? `${f.fighter2.firstName} ${f.fighter2.lastName}`.trim()
        : 'Fighter 2';
      body = `${name1} vs ${name2} is up soon.`;
    } else {
      body = `${userMatches.length} fighters you follow are fighting soon.`;
    }

    await sendPushNotifications(
      [user.id],
      {
        title,
        body,
        data: { eventId, screen: 'event-detail' },
      },
    );

    for (const m of userMatches) matchedRowIds.push(m.id);
    for (const m of fighterFollowMatches) fighterFollowDispatched.push(m);
  }

  if (fighterFollowDispatched.length > 0) {
    await prisma.followNotificationEvent.createMany({
      data: fighterFollowDispatched.map((m) => ({
        matchId: m.id,
        userId: m.userId,
        fightId: m.fightId,
        lane: 'WALKOUT' as const,
      })),
    });
  }

  if (matchedRowIds.length > 0) {
    await prisma.fightNotificationMatch.updateMany({
      where: { id: { in: matchedRowIds } },
      data: { notificationSent: true },
    });
    console.log(
      `[Notifications] Section-start sent for ${eventName} (${sectionLabel ?? 'card'}): ${validUsers.length} users, ${matchedRowIds.length} rows marked sent`,
    );
  }
}

export const notificationService = {
  sendPushNotifications,
  notifyFightStartViaRules,
  notifyEventSectionStart,
  notifyCrewMessage,
};
