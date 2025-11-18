import { PrismaClient } from '@prisma/client';
import { sendPushNotifications } from './notificationService';

const prisma = new PrismaClient();

interface PreEventReportData {
  eventName: string;
  hypedFights: Array<{
    fighter1Name: string;
    fighter2Name: string;
    averageHype: number;
  }>;
  followedFighters: string[];
}

/**
 * Generate pre-event report content for a user and event
 * Returns hyped fights and followed fighters fighting on this card
 */
async function generatePreEventReport(
  userId: string,
  eventId: string
): Promise<PreEventReportData | null> {
  // Get event details
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      name: true,
      fights: {
        where: {
          isCancelled: false,
        },
        include: {
          fighter1: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          fighter2: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  // Get user's followed fighters
  const followedFighters = await prisma.userFighterFollow.findMany({
    where: { userId },
    select: {
      fighter: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const followedFighterIds = new Set(followedFighters.map((f) => f.fighter.id));

  // Calculate average hype for each fight from predictions
  const fightsWithHype = await Promise.all(
    event.fights.map(async (fight) => {
      const hypePredictions = await prisma.fightPrediction.findMany({
        where: { fightId: fight.id },
        select: { predictedRating: true },
      });

      const averageHype =
        hypePredictions.length > 0
          ? hypePredictions.reduce((sum: number, p: any) => sum + (p.predictedRating || 0), 0) /
            hypePredictions.length
          : 0;

      return {
        fightId: fight.id,
        fighter1Id: fight.fighter1Id,
        fighter2Id: fight.fighter2Id,
        fighter1Name: `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
        fighter2Name: `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
        averageHype,
      };
    })
  );

  // Find hyped fights (average hype prediction >= 8.5)
  const hypedFights = fightsWithHype
    .filter((fight) => fight.averageHype >= 8.5)
    .sort((a, b) => b.averageHype - a.averageHype)
    .slice(0, 3); // Top 3 hyped fights

  // Find followed fighters on this card
  const fightingFollowedFighters: string[] = [];
  fightsWithHype.forEach((fight) => {
    if (followedFighterIds.has(fight.fighter1Id)) {
      fightingFollowedFighters.push(fight.fighter1Name);
    }
    if (followedFighterIds.has(fight.fighter2Id)) {
      fightingFollowedFighters.push(fight.fighter2Name);
    }
  });

  return {
    eventName: event.name,
    hypedFights,
    followedFighters: fightingFollowedFighters,
  };
}

/**
 * Format pre-event report notification content
 */
function formatPreEventReportNotification(data: PreEventReportData): {
  title: string;
  body: string;
} {
  const { eventName, hypedFights, followedFighters } = data;

  let body = `${eventName} is tonight. `;

  // Add hyped fights
  if (hypedFights.length > 0) {
    const hypedFightsList = hypedFights
      .map((f) => `${f.fighter1Name} vs ${f.fighter2Name}`)
      .join(', ');
    body += `Hyped fights include: ${hypedFightsList}. `;
  }

  // Add followed fighters
  if (followedFighters.length > 0) {
    const fightersList = followedFighters.join(', ');
    body += `Fighters you follow are fighting: ${fightersList}.`;
  }

  // If no hyped fights or followed fighters, just announce the event
  if (hypedFights.length === 0 && followedFighters.length === 0) {
    body += 'Check out the full card!';
  }

  return {
    title: '🥊 Pre-Event Report',
    body: body.trim(),
  };
}

/**
 * Send pre-event report notifications for an event
 * Should be called 6 hours before the event starts
 */
export async function sendPreEventReports(eventId: string): Promise<{
  sent: number;
  skipped: number;
}> {
  console.log(`[Pre-Event Report] Generating reports for event: ${eventId}`);

  // Get all users with active pre-event report rules
  const usersWithReportRule = await prisma.userNotificationRule.findMany({
    where: {
      name: 'Pre-Event Report',
      isActive: true,
    },
    select: {
      userId: true,
      user: {
        select: {
          pushToken: true,
          notificationsEnabled: true,
        },
      },
    },
  });

  console.log(
    `[Pre-Event Report] Found ${usersWithReportRule.length} users with active pre-event report rules`
  );

  let sentCount = 0;
  let skippedCount = 0;

  for (const ruleData of usersWithReportRule) {
    const userId = ruleData.userId;

    // Generate report data for this user
    const reportData = await generatePreEventReport(userId, eventId);

    if (!reportData) {
      console.log(`[Pre-Event Report] No report data for user ${userId}, skipping`);
      skippedCount++;
      continue;
    }

    // Format notification
    const notification = formatPreEventReportNotification(reportData);

    // Send notification
    try {
      const result = await sendPushNotifications([userId], {
        title: notification.title,
        body: notification.body,
        data: {
          type: 'preEventReport',
          eventId,
          eventName: reportData.eventName,
          screen: 'events', // Navigate to events screen
        },
      });

      if (result.success > 0) {
        sentCount++;
        console.log(`[Pre-Event Report] Sent to user ${userId}`);
      } else {
        skippedCount++;
        console.log(`[Pre-Event Report] Failed to send to user ${userId}`);
      }
    } catch (error) {
      console.error(`[Pre-Event Report] Error sending to user ${userId}:`, error);
      skippedCount++;
    }
  }

  console.log(
    `[Pre-Event Report] Completed: ${sentCount} sent, ${skippedCount} skipped`
  );

  return { sent: sentCount, skipped: skippedCount };
}

/**
 * Check and send pre-event reports for upcoming events (within the next 6 hours)
 * This function should be called periodically (e.g., every hour)
 */
export async function checkAndSendPreEventReports(): Promise<void> {
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);

  console.log(`[Pre-Event Report] Checking for events starting between ${fiveHoursFromNow.toISOString()} and ${sixHoursFromNow.toISOString()}`);

  // Find events starting in approximately 6 hours (between 5 and 6 hours from now)
  const upcomingEvents = await prisma.event.findMany({
    where: {
      date: {
        gte: fiveHoursFromNow,
        lte: sixHoursFromNow,
      },
      isComplete: false,
    },
    select: {
      id: true,
      name: true,
      date: true,
    },
  });

  console.log(`[Pre-Event Report] Found ${upcomingEvents.length} events to send reports for`);

  for (const event of upcomingEvents) {
    // Check if we already sent notifications for this event
    const alreadySent = await prisma.sentPreEventNotification.findUnique({
      where: { eventId: event.id },
    });

    if (alreadySent) {
      console.log(`[Pre-Event Report] Already sent notifications for event: ${event.name}, skipping`);
      continue;
    }

    console.log(`[Pre-Event Report] Processing event: ${event.name} (${event.date})`);
    const result = await sendPreEventReports(event.id);

    // Record that we sent notifications for this event (only if at least one was sent)
    if (result.sent > 0) {
      await prisma.sentPreEventNotification.create({
        data: {
          eventId: event.id,
        },
      });
      console.log(`[Pre-Event Report] Recorded notification sent for event: ${event.name}`);
    }
  }
}
