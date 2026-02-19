import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Notification Rule Condition Types
 * These define what conditions can be evaluated for fight notifications
 *
 * IMPORTANT: Keep this minimal and only add what's actually needed.
 * The system is designed to be easily extensible - add new condition types
 * by simply adding new fields here and evaluation logic below.
 */
export interface NotificationRuleConditions {
  // Fight-specific conditions
  fightIds?: string[]; // Specific fight IDs (for manual fight follows)

  // Hype-based conditions
  minHype?: number;
  maxHype?: number;

  // Fighter-based conditions
  fighterIds?: string[]; // Any of these fighters

  // Promotion-based conditions
  promotions?: string[]; // UFC, Bellator, PFL, etc.

  // Event-based conditions
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  notDaysOfWeek?: number[]; // Exclude these days

  // Special rule types (not fight-specific)
  isPreEventReport?: boolean; // Event-level notification, not per-fight

  // Add more conditions here as needed - the system is extensible
}

/**
 * Evaluates whether a fight matches a set of rule conditions
 */
export async function evaluateFightAgainstConditions(
  fightId: string,
  conditions: NotificationRuleConditions
): Promise<boolean> {
  // Fetch fight data with necessary relations
  const fight = await prisma.fight.findUnique({
    where: { id: fightId },
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
      predictions: {
        select: {
          predictedRating: true,
        },
      },
    },
  });

  if (!fight) {
    return false;
  }

  // Evaluate each condition type

  // -1. Skip event-level rules (Pre-Event Report is not a per-fight notification)
  if ((conditions as any).isPreEventReport) {
    return false;
  }

  // 0. Fight-specific conditions (highest priority - exact match)
  if (conditions.fightIds && conditions.fightIds.length > 0) {
    if (!conditions.fightIds.includes(fightId)) {
      return false;
    }
  }

  // 1. Hype-based conditions (use average predicted rating)
  if (conditions.minHype !== undefined || conditions.maxHype !== undefined) {
    const predictions = fight.predictions.filter((p: any) => p.predictedRating !== null);
    if (predictions.length > 0) {
      const avgHype = predictions.reduce((sum: number, p: any) => sum + (p.predictedRating || 0), 0) / predictions.length;

      if (conditions.minHype !== undefined && avgHype < conditions.minHype) {
        return false;
      }
      if (conditions.maxHype !== undefined && avgHype > conditions.maxHype) {
        return false;
      }
    } else if (conditions.minHype !== undefined) {
      // No predictions yet, can't match minHype requirement
      return false;
    }
  }

  // 2. Fighter-based conditions
  if (conditions.fighterIds && conditions.fighterIds.length > 0) {
    const hasFighter = conditions.fighterIds.includes(fight.fighter1Id) ||
                       conditions.fighterIds.includes(fight.fighter2Id);
    if (!hasFighter) {
      return false;
    }
  }

  // 3. Promotion-based conditions
  if (conditions.promotions && conditions.promotions.length > 0) {
    const promotionName = fight.event.promotion || '';
    if (!conditions.promotions.includes(promotionName)) {
      return false;
    }
  }

  // 4. Day of week conditions
  if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
    const eventDate = new Date(fight.event.date);
    const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
    if (!conditions.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }
  }

  if (conditions.notDaysOfWeek && conditions.notDaysOfWeek.length > 0) {
    const eventDate = new Date(fight.event.date);
    const dayOfWeek = eventDate.getDay();
    if (conditions.notDaysOfWeek.includes(dayOfWeek)) {
      return false;
    }
  }

  // All conditions passed
  return true;
}

/**
 * Evaluates all active rules for a user against a specific fight
 * Returns list of matching rule IDs
 */
export async function evaluateUserRulesForFight(
  userId: string,
  fightId: string
): Promise<string[]> {
  // Get all active rules for this user
  const rules = await prisma.userNotificationRule.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      priority: 'desc', // Higher priority first
    },
  });

  const matchingRuleIds: string[] = [];

  for (const rule of rules) {
    const conditions = rule.conditions as NotificationRuleConditions;
    const matches = await evaluateFightAgainstConditions(fightId, conditions);

    if (matches) {
      matchingRuleIds.push(rule.id);
    }
  }

  return matchingRuleIds;
}

/**
 * Evaluates a single rule against all upcoming fights
 * Returns list of matching fight IDs
 */
export async function evaluateRuleAgainstUpcomingFights(
  ruleId: string
): Promise<string[]> {
  const rule = await prisma.userNotificationRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule || !rule.isActive) {
    return [];
  }

  // Get all upcoming fights (not yet started)
  // Only filter by fightStatus - the live event tracker manages this field
  const upcomingFights = await prisma.fight.findMany({
    where: {
      fightStatus: 'UPCOMING',
    },
    select: {
      id: true,
    },
  });

  const conditions = rule.conditions as NotificationRuleConditions;
  const matchingFightIds: string[] = [];

  for (const fight of upcomingFights) {
    const matches = await evaluateFightAgainstConditions(fight.id, conditions);
    if (matches) {
      matchingFightIds.push(fight.id);
    }
  }

  return matchingFightIds;
}

/**
 * Creates/updates notification matches for a user's rule
 * This should be called when:
 * - A new rule is created
 * - A rule is updated
 * - New fights are added to the database
 * - Fight data changes (hype scores, etc.)
 */
export async function syncRuleMatches(ruleId: string): Promise<number> {
  const matchingFightIds = await evaluateRuleAgainstUpcomingFights(ruleId);

  const rule = await prisma.userNotificationRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    return 0;
  }

  let createdCount = 0;

  for (const fightId of matchingFightIds) {
    // Use upsert to avoid duplicates
    await prisma.fightNotificationMatch.upsert({
      where: {
        userId_fightId_ruleId: {
          userId: rule.userId,
          fightId,
          ruleId,
        },
      },
      create: {
        userId: rule.userId,
        fightId,
        ruleId,
        isActive: true,
        notificationSent: false,
      },
      update: {
        // If it already exists, just ensure it's active
        isActive: true,
        matchedAt: new Date(),
      },
    });
    createdCount++;
  }

  return createdCount;
}

/**
 * Syncs all matches for a specific user
 * Useful when user data changes significantly
 */
export async function syncAllUserRuleMatches(userId: string): Promise<number> {
  const rules = await prisma.userNotificationRule.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  let totalMatches = 0;
  for (const rule of rules) {
    const matches = await syncRuleMatches(rule.id);
    totalMatches += matches;
  }

  return totalMatches;
}

/**
 * Gets all notification reasons for a specific fight for a user
 * Uses the unified rule-based notification system
 *
 * IMPORTANT: This now evaluates rules dynamically for hype-based rules,
 * since hype scores can change after rules are created/enabled.
 */
export async function getNotificationReasonsForFight(
  userId: string,
  fightId: string
): Promise<{
  willBeNotified: boolean;
  reasons: Array<{
    type: 'manual' | 'fighter' | 'rule';
    source: string; // "Manual follow", "Following Jon Jones", "High hype fights rule"
    ruleId?: string;
    isActive: boolean;
  }>;
}> {
  const fight = await prisma.fight.findUnique({
    where: { id: fightId },
    include: {
      fighter1: true,
      fighter2: true,
    },
  });

  if (!fight) {
    return { willBeNotified: false, reasons: [] };
  }

  const reasons: Array<{
    type: 'manual' | 'fighter' | 'rule';
    source: string;
    ruleId?: string;
    isActive: boolean;
  }> = [];

  // Track which rules we've already added to avoid duplicates
  const addedRuleIds = new Set<string>();

  // Check rule-based matches (unified notification system)
  const ruleMatches = await prisma.fightNotificationMatch.findMany({
    where: {
      userId,
      fightId,
    },
    include: {
      rule: true,
    },
  });

  for (const match of ruleMatches) {
    // Determine notification type based on rule name pattern
    let type: 'manual' | 'fighter' | 'rule' = 'rule';
    if (match.rule.name.startsWith('Manual Fight Follow:')) {
      type = 'manual';
    } else if (match.rule.name.startsWith('Fighter Follow:')) {
      type = 'fighter';
    }

    reasons.push({
      type,
      source: match.rule.name,
      ruleId: match.ruleId,
      isActive: match.isActive,
    });
    addedRuleIds.add(match.ruleId);
  }

  // DYNAMIC EVALUATION: Check active rules that weren't in pre-synced matches
  // This handles cases where hype scores changed after the rule was created
  const activeRules = await prisma.userNotificationRule.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  for (const rule of activeRules) {
    // Skip rules already added from matches
    if (addedRuleIds.has(rule.id)) {
      continue;
    }

    // Dynamically evaluate if this rule matches the fight
    const conditions = rule.conditions as NotificationRuleConditions;
    const matches = await evaluateFightAgainstConditions(fightId, conditions);

    if (matches) {
      // Determine notification type based on rule name pattern
      let type: 'manual' | 'fighter' | 'rule' = 'rule';
      if (rule.name.startsWith('Manual Fight Follow:')) {
        type = 'manual';
      } else if (rule.name.startsWith('Fighter Follow:')) {
        type = 'fighter';
      }

      reasons.push({
        type,
        source: rule.name,
        ruleId: rule.id,
        isActive: true, // Rule is active and matches dynamically
      });
    }
  }

  const willBeNotified = reasons.some(r => r.isActive);

  return { willBeNotified, reasons };
}

export const notificationRuleEngine = {
  evaluateFightAgainstConditions,
  evaluateUserRulesForFight,
  evaluateRuleAgainstUpcomingFights,
  syncRuleMatches,
  syncAllUserRuleMatches,
  getNotificationReasonsForFight,
};
