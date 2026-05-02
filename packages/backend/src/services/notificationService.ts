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
 */
export async function notifyFightStartViaRules(
  fightId: string,
  fighter1Name: string,
  fighter2Name: string
): Promise<void> {
  console.log(`[Notifications] Checking rules for fight start: ${fighter1Name} vs ${fighter2Name}`);

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
    },
  });

  if (matches.length === 0) {
    console.log(`[Notifications] No active notification matches for fight ${fightId}`);
    return;
  }

  console.log(`[Notifications] Found ${matches.length} notification matches for fight ${fightId}`);

  // Filter users with valid push tokens
  const validUsers = users.filter(
    (user) => user.notificationsEnabled && user.pushToken && Expo.isExpoPushToken(user.pushToken)
  );

  if (validUsers.length === 0) {
    console.log(`[Notifications] No users with valid push tokens`);
    return;
  }

  const matchup = `${fighter1Name} vs ${fighter2Name}`;

  // Send notifications
  const result = await sendPushNotifications(
    validUsers.map((u) => u.id),
    {
      title: '🥊 Fight Up Next!',
      body: matchup,
      data: { fightId, screen: 'fight-detail' },
    }
  );

  console.log(`[Notifications] Sent ${result.success} notifications, ${result.failed} failed`);

  // Mark notifications as sent
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

  const matches = await prisma.fightNotificationMatch.findMany({
    where: {
      fightId: { in: sectionFightIds },
      isActive: true,
      notificationSent: false,
    },
  });

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
    select: { id: true, pushToken: true, notificationsEnabled: true },
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

  for (const user of validUsers) {
    const userMatches = matchesByUser.get(user.id) ?? [];
    if (userMatches.length === 0) continue;

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
      // Row count, not distinct fighter count — close enough for the user-facing
      // copy and avoids a second query.
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
