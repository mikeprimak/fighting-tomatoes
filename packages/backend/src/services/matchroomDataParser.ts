// Matchroom Boxing Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedMatchroomBoxer {
  name: string;
  record: string; // "31-0-0" format
  wins: number;
  losses: number;
  draws: number;
  kos: number;
  imageUrl: string | null;
}

interface ScrapedMatchroomFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Event" or "Undercard"
  weightClass: string;
  isTitle: boolean;
  boxerA: {
    name: string;
    record: string;
    wins: number;
    losses: number;
    draws: number;
    kos: number;
    imageUrl: string | null;
    country: string;
  };
  boxerB: {
    name: string;
    record: string;
    wins: number;
    losses: number;
    draws: number;
    kos: number;
    imageUrl: string | null;
    country: string;
  };
}

interface ScrapedMatchroomEvent {
  eventName: string;
  eventType: string; // "Regular", "Championship", "Fight Camp"
  eventUrl: string;
  eventSlug: string;
  venue: string;
  city: string;
  country: string;
  dateText: string;
  eventDate: string | null; // ISO date string
  eventImageUrl: string | null;
  status: string;
  promotion: string;
  eventStartTime: string | null;
  fights?: ScrapedMatchroomFight[];
  localImagePath?: string;
}

interface ScrapedMatchroomEventsData {
  events: ScrapedMatchroomEvent[];
}

interface ScrapedMatchroomBoxersData {
  boxers: ScrapedMatchroomBoxer[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse boxing weight class string to WeightClass enum
 * Boxing uses standard + super/light variants
 */
function parseBoxingWeightClass(weightClassStr: string): WeightClass | null {
  if (!weightClassStr) return null;

  const normalized = weightClassStr.toLowerCase().trim();

  // Boxing weight class mapping (includes super/light variants)
  const weightClassMapping: Record<string, WeightClass> = {
    // Standard classes
    'minimumweight': WeightClass.STRAWWEIGHT,
    'light flyweight': WeightClass.STRAWWEIGHT,
    'flyweight': WeightClass.FLYWEIGHT,
    'super flyweight': WeightClass.BANTAMWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'super bantamweight': WeightClass.FEATHERWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'super featherweight': WeightClass.LIGHTWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'super lightweight': WeightClass.WELTERWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'super welterweight': WeightClass.MIDDLEWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'super middleweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'cruiserweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'heavyweight': WeightClass.HEAVYWEIGHT,
  };

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Infer gender from weight class
 * Boxing uses "Women's" prefix for women's divisions
 */
function inferGender(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('female')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse boxer name into first and last name
 */
function parseBoxerName(name: string): { firstName: string; lastName: string; nickname?: string } {
  // Clean the name
  let cleanName = name.trim();

  // Extract nickname if present (usually in quotes or parentheses)
  let nickname: string | undefined;
  const nicknameMatch = cleanName.match(/["']([^"']+)["']|\(([^)]+)\)/);
  if (nicknameMatch) {
    nickname = nicknameMatch[1] || nicknameMatch[2];
    cleanName = cleanName.replace(/["'][^"']+["']|\([^)]+\)/, '').trim();
  }

  // Split into parts
  const nameParts = cleanName.split(/\s+/).filter(p => p.length > 0);

  if (nameParts.length === 0) {
    return { firstName: '', lastName: '', nickname };
  }

  if (nameParts.length === 1) {
    // Single name - use as last name (common in boxing like "Mayweather")
    return { firstName: '', lastName: nameParts[0], nickname };
  }

  // Handle suffixes like Jr, Sr, III
  const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'];
  let suffix = '';
  if (nameParts.length > 2 && suffixes.includes(nameParts[nameParts.length - 1].toLowerCase())) {
    suffix = ' ' + nameParts.pop();
  }

  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') + suffix;

  return { firstName, lastName: lastName.trim(), nickname };
}

/**
 * Parse ISO date string to Date
 */
function parseMatchroomDate(dateStr: string | null): Date {
  if (!dateStr) {
    // Default to a future date
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(dateStr);
}

/**
 * Parse event start time string (e.g., "7:00 PM") and combine with event date
 * Matchroom events are typically in UK time (GMT/BST)
 */
function parseEventStartTime(eventDate: Date, timeStr: string | null | undefined): Date | null {
  if (!timeStr) return null;

  // Parse time string like "7:00 PM" or "7:00PM"
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3]?.toUpperCase();

  // Convert to 24-hour format if AM/PM specified
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  // Get date components
  const year = eventDate.getUTCFullYear();
  const month = eventDate.getUTCMonth();
  const day = eventDate.getUTCDate();

  // Create datetime (assume UK time, UTC+0 for simplicity)
  const dateTime = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));

  return dateTime;
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import boxers from scraped Matchroom data
 */
async function importMatchroomBoxers(
  boxersData: ScrapedMatchroomBoxersData
): Promise<Map<string, string>> {
  const boxerNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${boxersData.boxers.length} Matchroom boxers...`);

  for (const boxer of boxersData.boxers) {
    const { firstName, lastName, nickname } = parseBoxerName(boxer.name);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping boxer with no valid name: ${boxer.name}`);
      continue;
    }

    // Single-name fighters are stored with firstName empty and lastName containing the name
    // This ensures proper sorting and display

    // Upload image to R2 storage if available
    // Prefer local cropped image over remote URL
    let profileImageUrl: string | null = null;
    const displayName = firstName && lastName ? `${firstName} ${lastName}` : (lastName || firstName);

    // Check for local cropped image first
    const localImagePath = (boxer as any).localImagePath;
    const localFilePath = localImagePath ? path.join(__dirname, '../../public', localImagePath) : null;
    const hasLocalImage = localFilePath && fsSync.existsSync(localFilePath);

    if (hasLocalImage && localImagePath) {
      // Local cropped image exists - use it
      // For now, use local path directly (will be served by backend)
      // When R2 is configured, we'll need to upload the local file
      const isR2Configured = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);

      if (isR2Configured) {
        // Read local file and upload to R2
        try {
          const fileBuffer = fsSync.readFileSync(localFilePath);
          const base64 = fileBuffer.toString('base64');
          const dataUrl = `data:image/png;base64,${base64}`;
          profileImageUrl = await uploadFighterImage(dataUrl, displayName);
        } catch (error) {
          console.warn(`  ⚠ Local image upload failed for ${displayName}`);
          profileImageUrl = localImagePath; // Fall back to local path
        }
      } else {
        // No R2 - use local path (served by backend's /images route)
        profileImageUrl = localImagePath;
        console.log(`[Local] Using cropped image: ${localImagePath}`);
      }
    } else if (boxer.imageUrl && !boxer.imageUrl.includes('placeholder') && !boxer.imageUrl.includes('silhouette')) {
      try {
        profileImageUrl = await uploadFighterImage(boxer.imageUrl, displayName);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${displayName}`);
        profileImageUrl = boxer.imageUrl;
      }
    }

    try {
      // Upsert boxer using firstName + lastName unique constraint
      // Single-name fighters have empty firstName
      const fighter = await prisma.fighter.upsert({
        where: {
          firstName_lastName: {
            firstName,
            lastName,
          }
        },
        update: {
          wins: boxer.wins || undefined,
          losses: boxer.losses || undefined,
          draws: boxer.draws || undefined,
          profileImage: profileImageUrl || undefined,
          nickname: nickname || undefined,
        },
        create: {
          firstName,
          lastName,
          nickname,
          wins: boxer.wins || 0,
          losses: boxer.losses || 0,
          draws: boxer.draws || 0,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.BOXING,
          isActive: true,
        }
      });

      boxerNameToId.set(boxer.name, fighter.id);
      const recordStr = boxer.record || 'no record';
      console.log(`  ✓ ${displayName} (${recordStr})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${displayName}:`, error);
    }
  }

  console.log(`✅ Imported ${boxerNameToId.size} Matchroom boxers\n`);
  return boxerNameToId;
}

/**
 * Extract actual date from normalized text content
 * Looks for patterns like "SATURDAY 27 DECEMBER 2025" or "SATURDAY 24 JANUARY 2026"
 */
function extractActualDate(normalizedText: string | undefined): Date | null {
  if (!normalizedText) return null;

  // Look for "DAY DD MONTH YYYY" pattern
  const dateMatch = normalizedText.match(/(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})/i);

  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2].toUpperCase();
    const year = parseInt(dateMatch[3], 10);

    const months: Record<string, number> = {
      'JANUARY': 0, 'FEBRUARY': 1, 'MARCH': 2, 'APRIL': 3,
      'MAY': 4, 'JUNE': 5, 'JULY': 6, 'AUGUST': 7,
      'SEPTEMBER': 8, 'OCTOBER': 9, 'NOVEMBER': 10, 'DECEMBER': 11
    };

    const month = months[monthStr];
    if (month !== undefined) {
      return new Date(Date.UTC(year, month, day, 5, 0, 0)); // 5am UTC = midnight EST
    }
  }

  return null;
}

/**
 * Import Matchroom events and fights from scraped data
 * Groups events by date to combine fights from the same card
 */
async function importMatchroomEvents(
  eventsData: ScrapedMatchroomEventsData,
  boxerNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Processing ${eventsData.events.length} Matchroom event entries...`);

  // Process each event separately (don't merge by date)
  for (const scrapedEvent of eventsData.events) {
    // Extract actual date from normalized text or use the provided date
    const actualDate = extractActualDate((scrapedEvent as any)._normalizedText) || parseMatchroomDate(scrapedEvent.eventDate);
    scrapedEvent.eventDate = actualDate.toISOString();

    const eventName = scrapedEvent.eventName;
    const allFights = scrapedEvent.fights || [];
    const primaryEvent = scrapedEvent;
    const dateKey = actualDate.toISOString().split('T')[0];

    console.log(`\n  📅 ${dateKey}: "${eventName}" with ${allFights.length} fights`);

    // Parse date
    const eventDate = parseMatchroomDate(primaryEvent.eventDate);

    // Parse main card start time
    const mainStartTime = parseEventStartTime(eventDate, primaryEvent.eventStartTime);

    // Build location string
    let location = 'TBA';
    const locationParts = [primaryEvent.city, primaryEvent.country].filter(Boolean);
    if (locationParts.length > 0) {
      location = locationParts.join(', ');
    }

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    const bannerSource = primaryEvent.eventImageUrl;
    if (bannerSource) {
      try {
        bannerImageUrl = await uploadEventImage(bannerSource, eventName);
      } catch (error) {
        console.warn(`    ⚠ Banner upload failed for ${eventName}`);
        bannerImageUrl = bannerSource;
      }
    }

    // Try to find existing event by name pattern or date
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { name: { contains: 'Matchroom' }, date: eventDate },
          { name: primaryEvent.eventName, date: eventDate },
          { ufcUrl: primaryEvent.eventUrl }
        ]
      }
    });

    if (event) {
      // Update existing event
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventName,
          date: eventDate,
          venue: primaryEvent.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: primaryEvent.eventUrl,
          mainStartTime: mainStartTime || undefined,
          hasStarted: primaryEvent.status === 'Live',
          isComplete: primaryEvent.status === 'Complete',
        }
      });
      console.log(`    ✓ Updated event: ${eventName}`);
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventName,
          promotion: 'Matchroom Boxing',
          date: eventDate,
          venue: primaryEvent.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: primaryEvent.eventUrl,
          mainStartTime: mainStartTime || undefined,
          hasStarted: primaryEvent.status === 'Live',
          isComplete: primaryEvent.status === 'Complete',
        }
      });
      console.log(`    ✓ Created event: ${eventName}`);
    }

    // Import all fights for this combined event
    let fightsImported = 0;
    const fights = allFights;

    for (const fightData of fights) {
      // Find or create boxers
      let boxer1Id = boxerNameToId.get(fightData.boxerA.name);
      let boxer2Id = boxerNameToId.get(fightData.boxerB.name);

      // Create boxers on the fly if not found
      // Single-name fighters are stored with firstName empty, lastName containing the name
      if (!boxer1Id) {
        const { firstName, lastName, nickname } = parseBoxerName(fightData.boxerA.name);

        if (firstName || lastName) {
          try {
            const b1 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName,
                  lastName,
                }
              },
              update: {
                wins: fightData.boxerA.wins || undefined,
                losses: fightData.boxerA.losses || undefined,
                draws: fightData.boxerA.draws || undefined,
              },
              create: {
                firstName,
                lastName,
                nickname,
                wins: fightData.boxerA.wins || 0,
                losses: fightData.boxerA.losses || 0,
                draws: fightData.boxerA.draws || 0,
                gender: inferGender(fightData.weightClass),
                sport: Sport.BOXING,
                isActive: true,
              }
            });
            boxer1Id = b1.id;
            boxerNameToId.set(fightData.boxerA.name, b1.id);
          } catch (e) {
            console.warn(`    ⚠ Could not create boxer ${fightData.boxerA.name}`);
          }
        }
      }

      if (!boxer2Id) {
        const { firstName, lastName, nickname } = parseBoxerName(fightData.boxerB.name);

        if (firstName || lastName) {
          try {
            const b2 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName,
                  lastName,
                }
              },
              update: {
                wins: fightData.boxerB.wins || undefined,
                losses: fightData.boxerB.losses || undefined,
                draws: fightData.boxerB.draws || undefined,
              },
              create: {
                firstName,
                lastName,
                nickname,
                wins: fightData.boxerB.wins || 0,
                losses: fightData.boxerB.losses || 0,
                draws: fightData.boxerB.draws || 0,
                gender: inferGender(fightData.weightClass),
                sport: Sport.BOXING,
                isActive: true,
              }
            });
            boxer2Id = b2.id;
            boxerNameToId.set(fightData.boxerB.name, b2.id);
          } catch (e) {
            console.warn(`    ⚠ Could not create boxer ${fightData.boxerB.name}`);
          }
        }
      }

      if (!boxer1Id || !boxer2Id) {
        console.warn(`    ⚠ Skipping fight - boxers not found: ${fightData.boxerA.name} vs ${fightData.boxerB.name}`);
        continue;
      }

      // Parse weight class
      const weightClass = parseBoxingWeightClass(fightData.weightClass);
      const gender = inferGender(fightData.weightClass);

      // Update boxer details
      try {
        await prisma.fighter.update({
          where: { id: boxer1Id },
          data: {
            gender,
            sport: Sport.BOXING,
            weightClass: weightClass || undefined,
          }
        });

        await prisma.fighter.update({
          where: { id: boxer2Id },
          data: {
            gender,
            sport: Sport.BOXING,
            weightClass: weightClass || undefined,
          }
        });
      } catch (e) {
        // Ignore update errors
      }

      // Create title name for championship fights
      const titleName = fightData.isTitle
        ? `${fightData.weightClass} World Championship`
        : undefined;

      // Upsert fight (boxing uses 12 rounds for title fights, 10-12 for others)
      try {
        await prisma.fight.upsert({
          where: {
            eventId_fighter1Id_fighter2Id: {
              eventId: event.id,
              fighter1Id: boxer1Id,
              fighter2Id: boxer2Id,
            }
          },
          update: {
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
            scheduledRounds: fightData.isTitle ? 12 : 12,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
          },
          create: {
            eventId: event.id,
            fighter1Id: boxer1Id,
            fighter2Id: boxer2Id,
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
            scheduledRounds: fightData.isTitle ? 12 : 12,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            hasStarted: false,
            isComplete: false,
          }
        });

        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to import fight ${fightData.boxerA.name} vs ${fightData.boxerB.name}:`, error);
      }
    }

    // ============== CANCELLATION DETECTION ==============
    // Check for fights that were replaced (e.g., fighter rebooked with new opponent)
    // This handles cases where a fight is cancelled and one/both fighters get rebooked

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

      // Build a set of all boxer names in the current scraped data for this event
      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        scrapedFighterNames.add(fightData.boxerA.name.toLowerCase().trim());
        scrapedFighterNames.add(fightData.boxerB.name.toLowerCase().trim());
      }

      // Build a map of scraped fight pairs (to check if a specific matchup exists)
      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        const pairKey = [
          fightData.boxerA.name.toLowerCase().trim(),
          fightData.boxerB.name.toLowerCase().trim()
        ].sort().join('|');
        scrapedFightPairs.add(pairKey);
      }

      // Get all existing fights for this event from the database
      const existingDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          isComplete: false,
          isCancelled: false,
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      let cancelledCount = 0;
      let unCancelledCount = 0;

      for (const dbFight of existingDbFights) {
        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();

        // Create the pair key for this DB fight
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        // Check if this exact matchup still exists in scraped data
        if (!scrapedFightPairs.has(dbFightPairKey)) {
          // Matchup no longer exists - check if either fighter was rebooked
          const fighter1Rebooked = scrapedFighterNames.has(fighter1Name);
          const fighter2Rebooked = scrapedFighterNames.has(fighter2Name);

          if (fighter1Rebooked || fighter2Rebooked) {
            // At least one fighter appears in a different fight - this was a rebooking
            console.log(`    ❌ Cancelling fight (fighter rebooked): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

            await prisma.fight.update({
              where: { id: dbFight.id },
              data: { isCancelled: true }
            });

            cancelledCount++;
          } else {
            // Neither fighter appears in scraped data at all - fight may have been fully cancelled
            // Only mark as cancelled if event is in the near future (within 7 days)
            const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

            if (daysUntilEvent <= 7) {
              console.log(`    ❌ Cancelling fight (not in scraped data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

              await prisma.fight.update({
                where: { id: dbFight.id },
                data: { isCancelled: true }
              });

              cancelledCount++;
            } else {
              console.log(`    ⚠ Fight missing from scraped data (not cancelling, event > 7 days out): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
            }
          }
        }
      }

      // Also check for fights that were previously cancelled but now reappear (un-cancel them)
      const cancelledDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          isComplete: false,
          isCancelled: true,
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      for (const dbFight of cancelledDbFights) {
        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        if (scrapedFightPairs.has(dbFightPairKey)) {
          // Fight reappeared in scraped data - un-cancel it
          console.log(`    ✅ Un-cancelling fight (reappeared in data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { isCancelled: false }
          });

          unCancelledCount++;
        }
      }

      if (cancelledCount > 0) {
        console.log(`    ⚠ Cancelled ${cancelledCount} fights due to rebooking/cancellation`);
      }
      if (unCancelledCount > 0) {
        console.log(`    ✅ Un-cancelled ${unCancelledCount} fights (reappeared in data)`);
      }
    } else {
      console.log(`    ⚠ No fights found for this event`);
    }
  }

  console.log(`✅ Imported all Matchroom events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importMatchroomData(options: {
  eventsFilePath?: string;
  boxersFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/matchroom/latest-events.json'),
    boxersFilePath = path.join(__dirname, '../../scraped-data/matchroom/latest-boxers.json'),
  } = options;

  console.log('\n🥊 Starting Matchroom Boxing data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Boxers file: ${boxersFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const boxersJson = await fs.readFile(boxersFilePath, 'utf-8');

    const eventsData: ScrapedMatchroomEventsData = JSON.parse(eventsJson);
    const boxersData: ScrapedMatchroomBoxersData = JSON.parse(boxersJson);

    // Step 1: Import boxers first
    const boxerNameToId = await importMatchroomBoxers(boxersData);

    // Step 2: Import events and fights
    await importMatchroomEvents(eventsData, boxerNameToId);

    console.log('✅ Matchroom Boxing data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Matchroom import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported Matchroom data
 */
export async function getMatchroomImportStats(): Promise<{
  totalBoxers: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalBoxers, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count({ where: { sport: Sport.BOXING } }),
    prisma.event.count({ where: { promotion: 'Matchroom Boxing' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'Matchroom Boxing' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'Matchroom Boxing',
        date: { gte: new Date() },
        isComplete: false
      }
    })
  ]);

  return {
    totalBoxers,
    totalEvents,
    totalFights,
    upcomingEvents
  };
}

// Run if called directly
if (require.main === module) {
  importMatchroomData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
