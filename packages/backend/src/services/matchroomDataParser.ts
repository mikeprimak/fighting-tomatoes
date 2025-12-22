// Matchroom Boxing Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
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

    // Use lastName as firstName if firstName is empty (single names like "Eubank")
    const finalFirstName = firstName || lastName;
    const finalLastName = firstName ? lastName : '';

    // Upload image to R2 storage if available
    let profileImageUrl: string | null = null;
    if (boxer.imageUrl && !boxer.imageUrl.includes('placeholder')) {
      try {
        profileImageUrl = await uploadFighterImage(boxer.imageUrl, `${finalFirstName} ${finalLastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${finalFirstName} ${finalLastName}`);
        profileImageUrl = boxer.imageUrl;
      }
    }

    try {
      // Upsert boxer using firstName + lastName unique constraint
      const fighter = await prisma.fighter.upsert({
        where: {
          firstName_lastName: {
            firstName: finalFirstName,
            lastName: finalLastName,
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
          firstName: finalFirstName,
          lastName: finalLastName,
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
      console.log(`  ✓ ${finalFirstName} ${finalLastName} (${recordStr})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${finalFirstName} ${finalLastName}:`, error);
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

  // Group events by actual date (extracted from page content)
  const eventsByDate = new Map<string, ScrapedMatchroomEvent[]>();

  for (const event of eventsData.events) {
    // Try to extract actual date from normalized text first
    const actualDate = extractActualDate((event as any)._normalizedText) || parseMatchroomDate(event.eventDate);
    const dateKey = actualDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Update the event's date with the correct one
    event.eventDate = actualDate.toISOString();

    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, []);
    }
    eventsByDate.get(dateKey)!.push(event);
  }

  console.log(`  📋 Found ${eventsByDate.size} unique event dates`);

  // Process each date group as a single event
  for (const [dateKey, eventGroup] of Array.from(eventsByDate.entries())) {
    // Use the first event's details as the base, but combine all fights
    const primaryEvent = eventGroup[0];
    const allFights: ScrapedMatchroomFight[] = [];

    // Collect all fights from all events on this date
    for (const event of eventGroup) {
      if (event.fights) {
        allFights.push(...event.fights);
      }
    }

    // Create a combined event name if multiple main events
    let eventName = primaryEvent.eventName;
    if (eventGroup.length > 1) {
      // Use the most prominent fight or first one as the event name
      eventName = `Matchroom Boxing: ${dateKey}`;
    }

    console.log(`\n  📅 ${dateKey}: ${eventGroup.length} entries -> "${eventName}" with ${allFights.length} fights`);

    // Parse date
    const eventDate = parseMatchroomDate(primaryEvent.eventDate);

    // Parse main card start time
    const mainStartTime = parseEventStartTime(eventDate, primaryEvent.eventStartTime);

    // Build location string from any event that has it
    let location = 'TBA';
    for (const evt of eventGroup) {
      const locationParts = [evt.city, evt.country].filter(Boolean);
      if (locationParts.length > 0) {
        location = locationParts.join(', ');
        break;
      }
    }

    // Upload event banner to R2 storage (use first available)
    let bannerImageUrl: string | undefined;
    const bannerSource = eventGroup.find(e => e.eventImageUrl)?.eventImageUrl;
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
      if (!boxer1Id) {
        const { firstName, lastName, nickname } = parseBoxerName(fightData.boxerA.name);
        const finalFirstName = firstName || lastName;
        const finalLastName = firstName ? lastName : '';

        if (finalFirstName) {
          try {
            const b1 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName: finalFirstName,
                  lastName: finalLastName,
                }
              },
              update: {
                wins: fightData.boxerA.wins || undefined,
                losses: fightData.boxerA.losses || undefined,
                draws: fightData.boxerA.draws || undefined,
              },
              create: {
                firstName: finalFirstName,
                lastName: finalLastName,
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
        const finalFirstName = firstName || lastName;
        const finalLastName = firstName ? lastName : '';

        if (finalFirstName) {
          try {
            const b2 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName: finalFirstName,
                  lastName: finalLastName,
                }
              },
              update: {
                wins: fightData.boxerB.wins || undefined,
                losses: fightData.boxerB.losses || undefined,
                draws: fightData.boxerB.draws || undefined,
              },
              create: {
                firstName: finalFirstName,
                lastName: finalLastName,
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

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);
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
