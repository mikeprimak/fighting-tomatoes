import { PrismaClient } from '@prisma/client';
import { notificationRuleEngine } from './notificationRuleEngine';

const prisma = new PrismaClient();

/**
 * Manages the "Manual Fight Follow" notification rule for a specific fight
 * Creates/activates or deactivates the rule based on the enabled flag
 */
export async function manageManualFightRule(
  userId: string,
  fightId: string,
  enabled: boolean
): Promise<void> {
  const RULE_NAME = `Manual Fight Follow: ${fightId}`;
  const NOTIFY_MINUTES_BEFORE = 15;

  // Check if rule already exists for this fight
  const existingRule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: RULE_NAME,
    },
  });

  if (existingRule) {
    // Update existing rule
    await prisma.userNotificationRule.update({
      where: { id: existingRule.id },
      data: { isActive: enabled },
    });

    if (enabled) {
      // If enabled, sync matches
      notificationRuleEngine.syncRuleMatches(existingRule.id).catch(err => {
        console.error('Error syncing manual fight rule matches:', err);
      });
    } else {
      // If disabled, deactivate all matches for this rule
      await prisma.fightNotificationMatch.updateMany({
        where: {
          ruleId: existingRule.id,
        },
        data: {
          isActive: false,
        },
      });
    }
  } else if (enabled) {
    // Create new rule (only if enabled)
    const newRule = await prisma.userNotificationRule.create({
      data: {
        userId,
        name: RULE_NAME,
        conditions: { fightIds: [fightId] },
        notifyMinutesBefore: NOTIFY_MINUTES_BEFORE,
        priority: 10, // Higher priority than general rules
        isActive: true,
      },
    });

    // Sync matches for new rule
    notificationRuleEngine.syncRuleMatches(newRule.id).catch(err => {
      console.error('Error syncing manual fight rule matches:', err);
    });
  }
}

/**
 * Manages the "Fighter Follow" notification rule for a specific fighter
 * Creates/activates or deactivates the rule based on the enabled flag
 */
export async function manageFighterNotificationRule(
  userId: string,
  fighterId: string,
  enabled: boolean
): Promise<void> {
  const RULE_NAME = `Fighter Follow: ${fighterId}`;
  const NOTIFY_MINUTES_BEFORE = 15;

  // Check if rule already exists for this fighter
  const existingRule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: RULE_NAME,
    },
  });

  if (existingRule) {
    // Update existing rule
    await prisma.userNotificationRule.update({
      where: { id: existingRule.id },
      data: { isActive: enabled },
    });

    if (enabled) {
      // If enabled, sync matches
      notificationRuleEngine.syncRuleMatches(existingRule.id).catch(err => {
        console.error('Error syncing fighter notification rule matches:', err);
      });
    } else {
      // If disabled, deactivate all matches for this rule
      await prisma.fightNotificationMatch.updateMany({
        where: {
          ruleId: existingRule.id,
        },
        data: {
          isActive: false,
        },
      });
    }
  } else if (enabled) {
    // Create new rule (only if enabled)
    const newRule = await prisma.userNotificationRule.create({
      data: {
        userId,
        name: RULE_NAME,
        conditions: { fighterIds: [fighterId] },
        notifyMinutesBefore: NOTIFY_MINUTES_BEFORE,
        priority: 5, // Medium priority
        isActive: true,
      },
    });

    // Sync matches for new rule
    notificationRuleEngine.syncRuleMatches(newRule.id).catch(err => {
      console.error('Error syncing fighter notification rule matches:', err);
    });
  }
}

/**
 * Check if a user has an active manual fight follow rule
 */
export async function hasManualFightRule(
  userId: string,
  fightId: string
): Promise<boolean> {
  const RULE_NAME = `Manual Fight Follow: ${fightId}`;

  const rule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: RULE_NAME,
      isActive: true,
    },
  });

  return !!rule;
}

/**
 * Check if a user has an active fighter notification rule
 */
export async function hasFighterNotificationRule(
  userId: string,
  fighterId: string
): Promise<boolean> {
  const RULE_NAME = `Fighter Follow: ${fighterId}`;

  const rule = await prisma.userNotificationRule.findFirst({
    where: {
      userId,
      name: RULE_NAME,
      isActive: true,
    },
  });

  return !!rule;
}

/**
 * Toggles per-fight notification override for a specific fight
 * This allows users to disable/enable notifications for a specific fight
 * without affecting the underlying rules (e.g., fighter follows, hyped fights)
 *
 * @param userId - User ID
 * @param fightId - Fight ID
 * @param enabled - Whether notifications should be enabled for this fight
 * @returns Object with willBeNotified status after toggle
 */
export async function toggleFightNotificationOverride(
  userId: string,
  fightId: string,
  enabled: boolean
): Promise<{ willBeNotified: boolean; affectedMatches: number }> {
  // Get all notification matches for this user and fight
  const matches = await prisma.fightNotificationMatch.findMany({
    where: {
      userId,
      fightId,
    },
    include: {
      rule: true,
    },
  });

  // If enabling and no matches exist, create a manual fight rule
  if (enabled && matches.length === 0) {
    await manageManualFightRule(userId, fightId, true);
    return { willBeNotified: true, affectedMatches: 1 };
  }

  // Update all matches to the new enabled state
  let affectedMatches = 0;
  for (const match of matches) {
    await prisma.fightNotificationMatch.update({
      where: { id: match.id },
      data: { isActive: enabled },
    });
    affectedMatches++;
  }

  return { willBeNotified: enabled, affectedMatches };
}
