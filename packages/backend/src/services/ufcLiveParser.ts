/**
 * UFC Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, rounds, and results
 *
 * Uses the same data handling utilities as the daily UFC scraper to ensure consistency:
 * - parseFighterName: Handles nicknames and multi-part names
 * - mapWeightClass: Converts UFC strings to database enums
 * - inferGenderFromWeightClass: Determines fighter gender from division
 */

import { PrismaClient, WeightClass, Gender, FightStatus } from '@prisma/client';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== SHARED UTILITIES (from ufcDataParser.ts) ==============

/**
 * Parse fighter name into first/last name and optional nickname
 * Handles formats like: "Jon Jones", "Jon 'Bones' Jones", "Charles Oliveira"
 * @param fullName - Full fighter name from UFC.com
 * @returns Parsed name components
 */
function parseFighterName(fullName: string): { firstName: string; lastName: string; nickname?: string } {
  // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
  let decodedName = fullName;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(fullName)) {
      decodedName = decodeURIComponent(fullName);
    }
  } catch (e) {
    decodedName = fullName;
  }

  // Handle nicknames in quotes: Jon "Bones" Jones
  const nicknameMatch = decodedName.match(/^(.+?)\s+"([^"]+)"\s+(.+)$/);
  if (nicknameMatch) {
    return {
      firstName: stripDiacritics(nicknameMatch[1].trim()),
      nickname: nicknameMatch[2].trim(),
      lastName: stripDiacritics(nicknameMatch[3].trim())
    };
  }

  // Simple first/last split: first word = firstName, everything else = lastName
  const parts = decodedName.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single-name fighters (e.g., "Tawanchai") - store in lastName for proper sorting
    return { firstName: '', lastName: stripDiacritics(parts[0]) };
  }

  const firstName = stripDiacritics(parts[0]);
  const lastName = stripDiacritics(parts.slice(1).join(' '));

  return { firstName, lastName };
}

/**
 * Map UFC weight class strings to database enum
 * @param weightClassStr - Weight class string from UFC.com (e.g., "Lightweight", "Women's Bantamweight")
 * @returns Database WeightClass enum or null if not recognized
 */
function mapWeightClass(weightClassStr: string): WeightClass | null {
  const mapping: Record<string, WeightClass> = {
    'Strawweight': WeightClass.STRAWWEIGHT,
    'Flyweight': WeightClass.FLYWEIGHT,
    'Bantamweight': WeightClass.BANTAMWEIGHT,
    'Featherweight': WeightClass.FEATHERWEIGHT,
    'Lightweight': WeightClass.LIGHTWEIGHT,
    'Welterweight': WeightClass.WELTERWEIGHT,
    'Middleweight': WeightClass.MIDDLEWEIGHT,
    'Light Heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'Heavyweight': WeightClass.HEAVYWEIGHT,
    "Women's Strawweight": WeightClass.WOMENS_STRAWWEIGHT,
    "Women's Flyweight": WeightClass.WOMENS_FLYWEIGHT,
    "Women's Bantamweight": WeightClass.WOMENS_BANTAMWEIGHT,
    "Women's Featherweight": WeightClass.WOMENS_FEATHERWEIGHT,
  };

  return mapping[weightClassStr] || null;
}

/**
 * Infer fighter gender from weight class division
 * Women's divisions → FEMALE, all others → MALE
 * @param weightClass - Database WeightClass enum
 * @returns Gender enum (MALE or FEMALE)
 */
function inferGenderFromWeightClass(weightClass: WeightClass | null): Gender {
  if (!weightClass) return Gender.MALE;

  const womensClasses: WeightClass[] = [
    WeightClass.WOMENS_STRAWWEIGHT,
    WeightClass.WOMENS_FLYWEIGHT,
    WeightClass.WOMENS_BANTAMWEIGHT,
    WeightClass.WOMENS_FEATHERWEIGHT
  ];

  return womensClasses.includes(weightClass) ? Gender.FEMALE : Gender.MALE;
}

// ============== TYPE DEFINITIONS ==============

interface LiveFightUpdate {
  ufcFightId?: string | null;  // UFC's data-fmid for reliable matching
  fighterAName: string;
  fighterBName: string;
  order?: number | null;  // Fight order on card (UFC may change this)
  cardType?: string | null;  // "Main Card", "Prelims", or "Early Prelims"
  weightClass?: string | null;  // Weight class string from UFC.com
  isTitle?: boolean;  // Whether this is a championship fight
  status?: 'upcoming' | 'live' | 'complete';
  currentRound?: number | null;
  completedRounds?: number | null;
  fightStatus?: FightStatus;
  winner?: string | null;
  method?: string | null;
  winningRound?: number | null;
  winningTime?: string | null;
}

interface LiveEventUpdate {
  eventName: string;
  eventStatus?: string;
  fights: LiveFightUpdate[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Find event by name (fuzzy match)
 */
async function findEventByName(eventName: string) {
  // Try exact match first
  let event = await prisma.event.findFirst({
    where: {
      name: {
        equals: eventName,
        mode: 'insensitive'
      }
    },
    include: {
      fights: {
        include: {
          fighter1: true,
          fighter2: true
        }
      }
    }
  });

  // Try partial match
  if (!event) {
    event = await prisma.event.findFirst({
      where: {
        name: {
          contains: eventName.replace(/[^\w\s]/g, '').split(' ')[1] || eventName, // Extract "320" from "UFC 320"
          mode: 'insensitive'
        }
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });
  }

  return event;
}

/**
 * Find fight by fighter names
 * Matches fights using last names (more reliable than full names)
 * @param fights - Array of fights to search
 * @param fighter1Name - Full name of first fighter (e.g., "Jon Jones")
 * @param fighter2Name - Full name of second fighter
 * @returns Matching fight or undefined
 */
function findFightByFighters(fights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();

  return fights.find(fight => {
    const f1LastName = fight.fighter1.lastName.toLowerCase();
    const f2LastName = fight.fighter2.lastName.toLowerCase();
    const fighter1Last = normalize(fighter1Name).split(' ').pop() || '';
    const fighter2Last = normalize(fighter2Name).split(' ').pop() || '';

    // Match by last names (more reliable than full names)
    // Check both orderings since UFC.com might list fighters in either order
    return (
      (f1LastName === fighter1Last && f2LastName === fighter2Last) ||
      (f1LastName === fighter2Last && f2LastName === fighter1Last)
    );
  });
}

/**
 * Find or create a fighter by name using upsert pattern (same as daily scraper)
 * Updates existing fighter or creates minimal record if not found
 * Gender is inferred from weight class when fight data is available
 * @param fullName - Full name (e.g., "Jon Jones" or "Jon 'Bones' Jones")
 * @param weightClass - Optional weight class enum to infer gender
 * @returns Fighter record with ID
 */
async function findOrCreateFighter(
  fullName: string,
  weightClass?: WeightClass | null
): Promise<any> {
  // Use shared utility to parse name (handles nicknames properly)
  const { firstName, lastName, nickname } = parseFighterName(fullName);

  if (!lastName || !firstName) {
    throw new Error(`Cannot parse fighter name: ${fullName}`);
  }

  // Infer gender from weight class if available (women's divisions = FEMALE)
  const gender = weightClass ? inferGenderFromWeightClass(weightClass) : Gender.MALE;

  // Upsert fighter using firstName + lastName unique constraint (same pattern as daily scraper)
  // Updates: gender, weightClass, nickname (keeps existing record data like W-L-D intact)
  // Creates: minimal record with defaults if fighter doesn't exist
  const fighter = await prisma.fighter.upsert({
    where: {
      firstName_lastName: {
        firstName,
        lastName,
      }
    },
    update: {
      // Only update gender and weight class, preserve everything else (record, images, etc.)
      gender,
      weightClass: weightClass || undefined,
      nickname: nickname || undefined,
    },
    create: {
      // Create minimal fighter record - daily scraper will fill in details later
      firstName,
      lastName,
      nickname,
      gender,
      weightClass,
      isActive: true,
      wins: 0,
      losses: 0,
      draws: 0,
      noContests: 0
    }
  });

  if (!fighter) {
    console.log(`  🆕 Created new fighter: ${firstName} ${lastName}${nickname ? ` "${nickname}"` : ''}`);
  }

  return fighter;
}

/**
 * Determine winner fighter ID from winner name
 */
function getWinnerFighterId(winnerName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerName) return null;

  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();
  const winnerLast = normalize(winnerName).split(' ').pop() || '';

  if (fighter1.lastName.toLowerCase() === winnerLast) {
    return fighter1.id;
  }
  if (fighter2.lastName.toLowerCase() === winnerLast) {
    return fighter2.id;
  }

  return null;
}

// ============== MAIN PARSER FUNCTION ==============

/**
 * Parse and update database with live event data
 * @param liveData - Live event data from scraper
 * @param eventId - Optional UUID of event (if not provided, will search by name)
 */
export async function parseLiveEventData(liveData: LiveEventUpdate, eventId?: string): Promise<void> {
  console.log(`\n📊 [LIVE PARSER] Processing live data for: ${liveData.eventName}`);

  try {
    // Find event in database - use UUID if provided, otherwise search by name
    let event;
    if (eventId) {
      event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          fights: {
            include: {
              fighter1: true,
              fighter2: true
            }
          }
        }
      });

      if (!event) {
        console.error(`  ❌ Event not found with ID: ${eventId}`);
        return;
      }
    } else {
      event = await findEventByName(liveData.eventName);

      if (!event) {
        console.error(`  ❌ Event not found in database: ${liveData.eventName}`);
        return;
      }
    }

    console.log(`  ✓ Found event: ${event.name} (ID: ${event.id})`);

    // Determine tracker mode for this event
    const trackerMode = getEventTrackerType({ trackerMode: event.trackerMode, promotion: event.promotion });
    console.log(`  ⚙️  Tracker mode: ${trackerMode}`);

    // Track changes
    let eventChanged = false;
    let fightsUpdated = 0;

    // Calculate hasStarted based on time - event has started if current time is past the earliest start time
    const now = new Date();
    const earliestStartTime = [
      event.earlyPrelimStartTime,
      event.prelimStartTime,
      event.mainStartTime
    ].filter(t => t != null).sort((a, b) => a!.getTime() - b!.getTime())[0];

    const calculatedHasStarted = earliestStartTime ? now >= earliestStartTime : false;

    // Update event status
    const currentEventIsUpcoming = event.eventStatus === 'UPCOMING';
    if (calculatedHasStarted && currentEventIsUpcoming) {
      console.log(`  🔴 Event status change: eventStatus ${event.eventStatus} → LIVE (based on time)`);
      eventChanged = true;
    }

    const liveDataEventStatus = liveData.eventStatus;
    if (liveDataEventStatus === 'COMPLETED' && event.eventStatus !== 'COMPLETED') {
      console.log(`  ✅ Event status change: eventStatus ${event.eventStatus} → COMPLETED`);
      eventChanged = true;
    }

    if (eventChanged) {
      let newEventStatus = event.eventStatus;
      if (calculatedHasStarted && currentEventIsUpcoming) {
        newEventStatus = 'LIVE';
      }
      if (liveDataEventStatus === 'COMPLETED') {
        newEventStatus = 'COMPLETED';
      }
      await prisma.event.update({
        where: { id: event.id },
        data: {
          eventStatus: newEventStatus,
        }
      });
      console.log(`  💾 Event updated`);
    }

    // ============== FIGHT PROCESSING ==============

    // Track which fights from scraped data we've seen (by ufcFightId and name signature)
    const scrapedUfcFightIds = new Set<string>();
    const scrapedFightSignatures = new Set<string>();

    console.log(`  🔍 Processing ${liveData.fights.length} fight updates...`);
    for (const fightUpdate of liveData.fights) {
      console.log(`  🔎 Looking for fight: ${fightUpdate.fighterAName} vs ${fightUpdate.fighterBName} (ufcFightId: ${fightUpdate.ufcFightId}, fightStatus: ${fightUpdate.fightStatus})`);

      // Track by ufcFightId (preferred) and name signature (fallback)
      if (fightUpdate.ufcFightId) {
        scrapedUfcFightIds.add(fightUpdate.ufcFightId);
      }
      const fightSignature = [fightUpdate.fighterAName, fightUpdate.fighterBName]
        .map(n => n.toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(fightSignature);

      // First try to match by ufcFightId (most reliable)
      let dbFight = fightUpdate.ufcFightId
        ? event.fights.find(f => f.ufcFightId === fightUpdate.ufcFightId)
        : null;

      // Fall back to name matching if no ufcFightId match
      if (!dbFight) {
        dbFight = findFightByFighters(
          event.fights,
          fightUpdate.fighterAName,
          fightUpdate.fighterBName
        );
      }

      // If fight not found in database, it's a new fight added during the event
      if (!dbFight) {
        console.warn(`  ⚠ Fight not found in DB: ${fightUpdate.fighterAName} vs ${fightUpdate.fighterBName}`);
        console.log(`  🆕 Creating new fight during live event...`);

        try {
          // Parse weight class from UFC string to database enum (same as daily scraper)
          const weightClass = fightUpdate.weightClass ? mapWeightClass(fightUpdate.weightClass) : null;

          // Find or create both fighters with weight class for gender inference
          const fighter1 = await findOrCreateFighter(fightUpdate.fighterAName, weightClass);
          const fighter2 = await findOrCreateFighter(fightUpdate.fighterBName, weightClass);

          // Determine orderOnCard - if provided use it, otherwise put at end (highest number)
          const maxOrder = Math.max(...event.fights.map(f => f.orderOnCard), 0);
          const orderOnCard = fightUpdate.order ?? (maxOrder + 1);

          // Determine scheduled rounds (title fights = 5, regular = 3)
          const scheduledRounds = fightUpdate.isTitle ? 5 : 3;

          // Create the fight with full metadata (same pattern as daily scraper)
          const newFight = await prisma.fight.create({
            data: {
              eventId: event.id,
              fighter1Id: fighter1.id,
              fighter2Id: fighter2.id,
              orderOnCard,
              cardType: fightUpdate.cardType || null,  // "Main Card", "Prelims", "Early Prelims"
              weightClass,
              isTitle: fightUpdate.isTitle ?? false,
              titleName: fightUpdate.isTitle ? `UFC ${fightUpdate.weightClass} Championship` : undefined,
              scheduledRounds,
              fightStatus: fightUpdate.fightStatus ?? 'UPCOMING',
              currentRound: fightUpdate.currentRound ?? null,
              completedRounds: fightUpdate.completedRounds ?? null,
            }
          });

          console.log(`  ✅ Created new fight: ${fighter1.lastName} vs ${fighter2.lastName} (${fightUpdate.cardType || 'Unknown Card'}, orderOnCard: ${orderOnCard})`);

          // Reload event fights to include the new fight
          event.fights.push({
            ...newFight,
            fighter1,
            fighter2
          });

          fightsUpdated++;
          continue; // Skip to next fight
        } catch (error: any) {
          console.error(`  ❌ Failed to create new fight:`, error.message);
          continue;
        }
      }

      console.log(`  ✓ Found DB fight: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (DB fightStatus: ${dbFight.fightStatus})`);

      const updateData: any = {};
      let changed = false;

      // Check status changes
      if (fightUpdate.fightStatus !== undefined && dbFight.fightStatus !== fightUpdate.fightStatus) {
        updateData.fightStatus = fightUpdate.fightStatus;
        changed = true;
        console.log(`    🥊 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: fightStatus → ${fightUpdate.fightStatus}`);

        // When a fight completes, send notifications for the NEXT fight on the card
        if (fightUpdate.fightStatus === 'COMPLETED') {
          // Find the next fight on the card (lower orderOnCard = later in event, closer to main event)
          // We want the fight with the next lower orderOnCard number
          prisma.fight.findFirst({
            where: {
              eventId: dbFight.eventId,
              orderOnCard: { lt: dbFight.orderOnCard },
              fightStatus: 'UPCOMING',
            },
            orderBy: { orderOnCard: 'desc' },
            include: {
              fighter1: { select: { firstName: true, lastName: true } },
              fighter2: { select: { firstName: true, lastName: true } },
            },
          }).then(nextFight => {
            if (nextFight) {
              const fighter1Name = `${nextFight.fighter1.firstName} ${nextFight.fighter1.lastName}`;
              const fighter2Name = `${nextFight.fighter2.firstName} ${nextFight.fighter2.lastName}`;

              console.log(`    🔔 Previous fight complete, notifying for next fight: ${fighter1Name} vs ${fighter2Name}`);

              import('../services/notificationService').then(({ notifyFightStartViaRules }) => {
                notifyFightStartViaRules(nextFight.id, fighter1Name, fighter2Name).catch(err => {
                  console.error(`    ❌ Failed to send next fight notifications:`, err);
                });
              });
            }
          }).catch(err => {
            console.error(`    ❌ Error finding next fight:`, err);
          });
        }
      }

      // Check order changes (UFC sometimes reorders fights)
      if (fightUpdate.order !== undefined && fightUpdate.order !== null && dbFight.orderOnCard !== fightUpdate.order) {
        updateData.orderOnCard = fightUpdate.order;
        changed = true;
        console.log(`    🔀 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: orderOnCard ${dbFight.orderOnCard} → ${fightUpdate.order}`);
      }

      // Check round changes
      if (fightUpdate.currentRound !== undefined && dbFight.currentRound !== fightUpdate.currentRound) {
        updateData.currentRound = fightUpdate.currentRound;
        changed = true;
        console.log(`    🔵 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: currentRound → ${fightUpdate.currentRound}`);
      }

      if (fightUpdate.completedRounds !== undefined && dbFight.completedRounds !== fightUpdate.completedRounds) {
        updateData.completedRounds = fightUpdate.completedRounds;
        changed = true;
        console.log(`    ⚫ ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: completedRounds → ${fightUpdate.completedRounds}`);
      }

      // Check result changes - update even if already set (UFC.com may correct results)
      if (fightUpdate.winner) {
        const winnerId = getWinnerFighterId(fightUpdate.winner, dbFight.fighter1, dbFight.fighter2);
        if (winnerId && dbFight.winner !== winnerId) {
          updateData.winner = winnerId;
          changed = true;
          if (dbFight.winner) {
            console.log(`    🔄 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: winner CORRECTED → ${fightUpdate.winner}`);
          } else {
            console.log(`    🏆 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: winner → ${fightUpdate.winner}`);
          }
        }
      }

      if (fightUpdate.method && dbFight.method !== fightUpdate.method) {
        updateData.method = fightUpdate.method;
        changed = true;
        if (dbFight.method) {
          console.log(`    🔄 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: method CORRECTED → ${fightUpdate.method}`);
        } else {
          console.log(`    📋 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: method → ${fightUpdate.method}`);
        }
      }

      if (fightUpdate.winningRound !== undefined && dbFight.round !== fightUpdate.winningRound) {
        updateData.round = fightUpdate.winningRound;
        changed = true;
        if (dbFight.round) {
          console.log(`    🔄 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: round CORRECTED → ${fightUpdate.winningRound}`);
        } else {
          console.log(`    🔢 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: round → ${fightUpdate.winningRound}`);
        }
      }

      if (fightUpdate.winningTime && dbFight.time !== fightUpdate.winningTime) {
        updateData.time = fightUpdate.winningTime;
        changed = true;
        if (dbFight.time) {
          console.log(`    🔄 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: time CORRECTED → ${fightUpdate.winningTime}`);
        } else {
          console.log(`    ⏱️  ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: time → ${fightUpdate.winningTime}`);
        }
      }

      // Apply updates (route through shadow field helper)
      if (changed) {
        const finalUpdateData = buildTrackerUpdateData(updateData, trackerMode);
        console.log(`  💾 Updating fight ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} with:`, finalUpdateData);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: finalUpdateData
        });
        fightsUpdated++;
      } else {
        console.log(`  ⏭️  No changes for ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
      }
    }

    // ============== CANCELLATION DETECTION ==============
    // Check for fights in DB that were NOT in the scraped data (possibly cancelled)
    // Also check for previously cancelled fights that have reappeared (un-cancel them)

    console.log(`  🔍 Checking for cancelled/un-cancelled fights...`);
    console.log(`  📋 Scraped ufcFightIds: ${Array.from(scrapedUfcFightIds).join(', ')}`);
    console.log(`  📋 Scraped fight signatures: ${Array.from(scrapedFightSignatures).join(', ')}`);
    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of event.fights) {
      // Skip fights that are already complete
      if (dbFight.fightStatus === 'COMPLETED') {
        continue;
      }

      // Check if fight is in scraped data - prefer ufcFightId, fall back to name signature
      let fightIsInScrapedData = false;

      if (dbFight.ufcFightId && scrapedUfcFightIds.has(dbFight.ufcFightId)) {
        fightIsInScrapedData = true;
        console.log(`  🔎 DB fight "${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}" matched by ufcFightId: ${dbFight.ufcFightId}`);
      } else {
        // Fall back to name signature matching
        const fighter1FullName = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2FullName = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();
        const dbFightSignature = [fighter1FullName, fighter2FullName].sort().join('|');

        fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);
        console.log(`  🔎 DB fight "${dbFightSignature}" (no ufcFightId) matched by name: ${fightIsInScrapedData}`);
      }

      // Case 1: Fight was cancelled but has reappeared in scraped data -> UN-CANCEL it
      if (dbFight.fightStatus === 'CANCELLED' && fightIsInScrapedData) {
        console.log(`  ✅ Fight reappeared in scraped data, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        await prisma.fight.update({
          where: { id: dbFight.id },
          data: {
            fightStatus: 'UPCOMING',
          }
        });

        unCancelledCount++;
      }
      // Case 2: Fight is NOT cancelled and missing from scraped data -> CANCEL it
      else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData) {
        console.log(`  ⚠️  Fight missing from scraped data: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        // Only mark as cancelled if event has started (to avoid false positives before event begins)
        if (event.eventStatus !== 'UPCOMING') {
          console.log(`  ❌ Marking fight as CANCELLED: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: {
              fightStatus: 'CANCELLED',
            }
          });

          cancelledCount++;
        } else {
          console.log(`  ℹ️  Event hasn't started yet, not marking as cancelled (might be missing from preliminary data)`);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`  ⚠️  Marked ${cancelledCount} fights as cancelled`);
    }
    if (unCancelledCount > 0) {
      console.log(`  ✅ Un-cancelled ${unCancelledCount} fights (reappeared in scraped data)`);
    }

    console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated, ${cancelledCount} fights cancelled, ${unCancelledCount} fights un-cancelled\n`);

  } catch (error) {
    console.error('  ❌ Parser error:', error);
    throw error;
  }
}

/**
 * Check if all fights in an event are complete
 */
export async function checkEventComplete(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        select: { fightStatus: true }
      }
    }
  });

  if (!event || event.fights.length === 0) {
    return false;
  }

  return event.fights.every(fight => fight.fightStatus === 'COMPLETED');
}

/**
 * Auto-complete event if all fights are done
 */
export async function autoCompleteEvent(eventId: string): Promise<boolean> {
  const allComplete = await checkEventComplete(eventId);

  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        eventStatus: 'COMPLETED',
        completionMethod: 'scraper' // Completed via live scraper
      }
    });
    console.log(`  🎉 Event ${eventId} auto-marked as complete (all fights done)`);
    return true;
  }

  return false;
}

/**
 * Get current event status for logging/monitoring
 * @param eventIdentifier - Event name or UUID
 */
export async function getEventStatus(eventIdentifier: string) {
  // Check if it's a UUID (contains hyphens)
  let event;
  if (eventIdentifier.includes('-')) {
    event = await prisma.event.findUnique({
      where: { id: eventIdentifier },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });
  } else {
    event = await findEventByName(eventIdentifier);
  }

  if (!event) {
    return null;
  }

  const liveFights = event.fights.filter(f => f.fightStatus === 'LIVE');
  const completeFights = event.fights.filter(f => f.fightStatus === 'COMPLETED');
  const upcomingFights = event.fights.filter(f => f.fightStatus === 'UPCOMING');

  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: event.eventStatus,
    totalFights: event.fights.length,
    liveFights: liveFights.length,
    completeFights: completeFights.length,
    upcomingFights: upcomingFights.length,
    currentFights: liveFights.map(f => ({
      fighters: `${f.fighter1.lastName} vs ${f.fighter2.lastName}`,
      currentRound: f.currentRound,
      completedRounds: f.completedRounds
    }))
  };
}
