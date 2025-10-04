import { prisma } from '../db';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface NotificationFilters {
  ufcOnly?: boolean;
  mainCardOnly?: boolean;
  notifyEventStart?: boolean;
  notifyFightStart?: boolean;
  notifyRoundChanges?: boolean;
  notifyFightResults?: boolean;
  notifyCrewMessages?: boolean;
}

/**
 * Get users who should receive a specific notification type
 */
async function getUsersForNotification(
  notificationType: string,
  filters: NotificationFilters = {}
): Promise<Array<{ id: string; pushToken: string }>> {
  const where: any = {
    pushToken: { not: null },
    notificationsEnabled: true,
  };

  // Apply notification type specific filters
  switch (notificationType) {
    case 'event_start':
      where.notifyEventStart = true;
      if (filters.ufcOnly) {
        where.notifyUFCOnly = true;
      }
      break;

    case 'fight_start':
      where.notifyFightStart = true;
      if (filters.mainCardOnly) {
        where.notifyMainCardOnly = true;
      }
      break;

    case 'round_change':
      where.notifyRoundChanges = true;
      break;

    case 'fight_result':
      where.notifyFightResults = true;
      break;

    case 'crew_message':
      where.notifyCrewMessages = true;
      break;

    default:
      throw new Error(`Unknown notification type: ${notificationType}`);
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, pushToken: true },
  });

  return users.filter((user) => Expo.isExpoPushToken(user.pushToken!));
}

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

/**
 * Send notification when an event starts
 */
export async function notifyEventStart(
  eventId: string,
  eventName: string,
  promotion: string
): Promise<void> {
  const users = await getUsersForNotification('event_start', {
    ufcOnly: promotion.toUpperCase() === 'UFC',
  });

  if (users.length === 0) return;

  await sendPushNotifications(
    users.map((u) => u.id),
    {
      title: `${promotion} Event Starting!`,
      body: `${eventName} is starting now`,
      data: { eventId, screen: 'event-detail' },
    }
  );
}

/**
 * Send notification when a fight starts
 */
export async function notifyFightStart(
  fightId: string,
  matchup: string,
  isMainCard: boolean,
  isMainEvent: boolean
): Promise<void> {
  const users = await getUsersForNotification('fight_start', {
    mainCardOnly: isMainCard,
  });

  if (users.length === 0) return;

  const title = isMainEvent ? '🔥 Main Event Starting!' : 'Fight Starting';

  await sendPushNotifications(
    users.map((u) => u.id),
    {
      title,
      body: matchup,
      data: { fightId, screen: 'fight-detail' },
    }
  );
}

/**
 * Send notification when a round changes
 */
export async function notifyRoundChange(
  fightId: string,
  matchup: string,
  currentRound: number
): Promise<void> {
  const users = await getUsersForNotification('round_change');

  if (users.length === 0) return;

  await sendPushNotifications(
    users.map((u) => u.id),
    {
      title: `Round ${currentRound}`,
      body: matchup,
      data: { fightId, screen: 'fight-detail' },
    }
  );
}

/**
 * Send notification when a fight ends with result
 */
export async function notifyFightResult(
  fightId: string,
  matchup: string,
  result: string
): Promise<void> {
  const users = await getUsersForNotification('fight_result');

  if (users.length === 0) return;

  await sendPushNotifications(
    users.map((u) => u.id),
    {
      title: 'Fight Ended!',
      body: `${matchup} - ${result}`,
      data: { fightId, screen: 'fight-detail' },
    }
  );
}

/**
 * Send notification for new crew message
 */
export async function notifyCrewMessage(
  crewId: string,
  crewName: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  // Get all crew members except the sender
  const crewMembers = await prisma.crewMember.findMany({
    where: {
      crewId,
      user: {
        notificationsEnabled: true,
        notifyCrewMessages: true,
        pushToken: { not: null },
      },
    },
    include: { user: true },
  });

  const users = crewMembers
    .map((m) => m.user)
    .filter((user) => Expo.isExpoPushToken(user.pushToken!));

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

export const notificationService = {
  sendPushNotifications,
  notifyEventStart,
  notifyFightStart,
  notifyRoundChange,
  notifyFightResult,
  notifyCrewMessage,
};
