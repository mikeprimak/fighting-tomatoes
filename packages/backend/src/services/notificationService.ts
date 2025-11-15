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

export const notificationService = {
  sendPushNotifications,
  notifyFightStartViaRules,
  notifyCrewMessage,
};
