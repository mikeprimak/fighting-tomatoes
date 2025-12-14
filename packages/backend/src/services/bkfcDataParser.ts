// BKFC Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedBKFCFighter {
  name: string;
  url: string;
  imageUrl: string | null;
  record: string | null; // "9-0-0" format or null
  headshotUrl?: string | null;
  localImagePath?: string;
  weightClass?: string | null;
  nickname?: string | null;
}

interface ScrapedBKFCFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card" or "Prelims"
  weightClass: string;
  isTitle: boolean;
  fighterA: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank: string;
    country: string;
    odds: string;
  };
  fighterB: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank: string;
    country: string;
    odds: string;
  };
}

interface ScrapedBKFCEvent {
  eventName: string;
  eventType: string; // "Knucklemania", "Fight Night", "Numbered", "Regular"
  eventUrl: string;
  eventSlug: string;
  venue: string;
  city: string;
  state: string;
  country: string;
  dateText: string;
  eventDate: string | null; // ISO date string
  eventImageUrl: string | null;
  status: string;
  fights?: ScrapedBKFCFight[];
  localImagePath?: string;
  eventStartTime?: string;
}

interface ScrapedBKFCEventsData {
  events: ScrapedBKFCEvent[];
}

interface ScrapedBKFCAthletesData {
  athletes: ScrapedBKFCFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse fighter record string "W-L-D" into numbers
 * BKFC format: "9-0-0" or null
 */
function parseRecord(record: string | null): { wins: number; losses: number; draws: number } {
  if (!record) {
    return { wins: 0, losses: 0, draws: 0 };
  }
  const parts = record.split('-').map(n => parseInt(n, 10));
  return {
    wins: parts[0] || 0,
    losses: parts[1] || 0,
    draws: parts[2] || 0
  };
}

/**
 * Parse BKFC weight class string to WeightClass enum
 * BKFC uses standard weight classes: Heavyweight, Welterweight, etc.
 */
function parseBKFCWeightClass(weightClassStr: string): WeightClass | null {
  if (!weightClassStr) return null;

  const normalized = weightClassStr.toLowerCase().trim();

  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,
    'flyweight': WeightClass.FLYWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'lightheavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'heavyweight': WeightClass.HEAVYWEIGHT,
    'cruiserweight': WeightClass.LIGHT_HEAVYWEIGHT, // Map to closest
  };

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Infer gender from weight class or fighter name
 * BKFC uses "Women's" prefix for women's divisions
 */
function inferGender(weightClassStr: string, fighterName: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('female')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse BKFC fighter name into first and last name
 * BKFC typically has full names like "Julian Lane"
 */
function parseBKFCFighterName(
  name: string,
  athleteUrl?: string
): { firstName: string; lastName: string; nickname?: string } {
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

  if (nameParts.length === 1) {
    // Single name - use as first name
    return { firstName: nameParts[0], lastName: '', nickname };
  }

  // Handle suffixes like Jr, Sr, III
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv'];
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
function parseBKFCDate(dateStr: string | null): Date {
  if (!dateStr) {
    // Default to a future date
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(dateStr);
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped BKFC data
 */
async function importBKFCFighters(
  athletesData: ScrapedBKFCAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} BKFC fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName, nickname } = parseBKFCFighterName(athlete.name, athlete.url);
    const recordParts = parseRecord(athlete.record);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Upload image to R2 storage
    let profileImageUrl: string | null = null;
    const imageUrl = athlete.headshotUrl || athlete.imageUrl;
    if (imageUrl && !imageUrl.includes('generic_') && !imageUrl.includes('placeholder')) {
      try {
        profileImageUrl = await uploadFighterImage(imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using BKFC URL`);
        profileImageUrl = imageUrl;
      }
    }

    try {
      // Upsert fighter using firstName + lastName unique constraint
      const fighter = await prisma.fighter.upsert({
        where: {
          firstName_lastName: {
            firstName,
            lastName,
          }
        },
        update: {
          ...recordParts,
          profileImage: profileImageUrl || undefined,
          nickname: nickname || undefined,
        },
        create: {
          firstName,
          lastName,
          nickname,
          ...recordParts,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.BOXING, // BKFC is bare-knuckle boxing
          isActive: true,
        }
      });

      fighterNameToId.set(athlete.name, fighter.id);
      console.log(`  ✓ ${firstName} ${lastName} (${athlete.record || 'no record'})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} BKFC fighters\n`);
  return fighterNameToId;
}

/**
 * Import BKFC events and fights from scraped data
 */
async function importBKFCEvents(
  eventsData: ScrapedBKFCEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} BKFC events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedBKFCEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parseBKFCDate(eventData.eventDate);

    // Build location string
    const locationParts = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean);
    const location = locationParts.join(', ') || 'TBA';

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using BKFC URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    // Try to find existing event by URL first, then by name+date
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventUrl },
          { name: eventData.eventName, date: eventDate }
        ]
      }
    });

    if (event) {
      // Update existing event
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'BKFC',
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
    }

    console.log(`  ✓ Event: ${eventData.eventName} (${eventDate.toLocaleDateString()})`);

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    for (const fightData of fights) {
      // Find fighter IDs
      const fighter1Id = fighterNameToId.get(fightData.fighterA.name);
      const fighter2Id = fighterNameToId.get(fightData.fighterB.name);

      if (!fighter1Id || !fighter2Id) {
        // Try to create fighters on the fly
        const fighter1Name = parseBKFCFighterName(fightData.fighterA.name);
        const fighter2Name = parseBKFCFighterName(fightData.fighterB.name);

        let f1Id = fighter1Id;
        let f2Id = fighter2Id;

        if (!f1Id && fighter1Name.firstName) {
          try {
            const f1 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName: fighter1Name.firstName,
                  lastName: fighter1Name.lastName,
                }
              },
              update: {},
              create: {
                firstName: fighter1Name.firstName,
                lastName: fighter1Name.lastName,
                gender: inferGender(fightData.weightClass, fightData.fighterA.name),
                sport: Sport.BOXING,
                isActive: true,
              }
            });
            f1Id = f1.id;
            fighterNameToId.set(fightData.fighterA.name, f1.id);
          } catch (e) {
            console.warn(`    ⚠ Could not create fighter ${fightData.fighterA.name}`);
          }
        }

        if (!f2Id && fighter2Name.firstName) {
          try {
            const f2 = await prisma.fighter.upsert({
              where: {
                firstName_lastName: {
                  firstName: fighter2Name.firstName,
                  lastName: fighter2Name.lastName,
                }
              },
              update: {},
              create: {
                firstName: fighter2Name.firstName,
                lastName: fighter2Name.lastName,
                gender: inferGender(fightData.weightClass, fightData.fighterB.name),
                sport: Sport.BOXING,
                isActive: true,
              }
            });
            f2Id = f2.id;
            fighterNameToId.set(fightData.fighterB.name, f2.id);
          } catch (e) {
            console.warn(`    ⚠ Could not create fighter ${fightData.fighterB.name}`);
          }
        }

        if (!f1Id || !f2Id) {
          console.warn(`    ⚠ Skipping fight - fighters not found: ${fightData.fighterA.name} vs ${fightData.fighterB.name}`);
          continue;
        }

        // Continue with the fight creation using f1Id and f2Id
        const weightClass = parseBKFCWeightClass(fightData.weightClass);
        const gender = inferGender(fightData.weightClass, fightData.fighterA.name);

        // Update fighter details
        await prisma.fighter.update({
          where: { id: f1Id },
          data: {
            gender,
            sport: Sport.BOXING,
            weightClass: weightClass || undefined,
          }
        });

        await prisma.fighter.update({
          where: { id: f2Id },
          data: {
            gender,
            sport: Sport.BOXING,
            weightClass: weightClass || undefined,
          }
        });

        // Create title name for championship fights
        const titleName = fightData.isTitle
          ? `BKFC ${fightData.weightClass} World Championship`
          : undefined;

        // Upsert fight
        try {
          await prisma.fight.upsert({
            where: {
              eventId_fighter1Id_fighter2Id: {
                eventId: event.id,
                fighter1Id: f1Id,
                fighter2Id: f2Id,
              }
            },
            update: {
              weightClass,
              isTitle: fightData.isTitle,
              titleName,
              scheduledRounds: fightData.isTitle ? 5 : 5, // BKFC fights are typically 5 rounds
              orderOnCard: fightData.order,
              cardType: fightData.cardType,
            },
            create: {
              eventId: event.id,
              fighter1Id: f1Id,
              fighter2Id: f2Id,
              weightClass,
              isTitle: fightData.isTitle,
              titleName,
              scheduledRounds: fightData.isTitle ? 5 : 5,
              orderOnCard: fightData.order,
              cardType: fightData.cardType,
              hasStarted: false,
              isComplete: false,
            }
          });

          fightsImported++;
        } catch (error) {
          console.warn(`    ⚠ Failed to import fight ${fightData.fighterA.name} vs ${fightData.fighterB.name}:`, error);
        }

        continue;
      }

      // Parse weight class
      const weightClass = parseBKFCWeightClass(fightData.weightClass);
      const gender = inferGender(fightData.weightClass, fightData.fighterA.name);

      // Update fighter sport and gender
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          sport: Sport.BOXING,
          weightClass: weightClass || undefined,
        }
      });

      await prisma.fighter.update({
        where: { id: fighter2Id },
        data: {
          gender,
          sport: Sport.BOXING,
          weightClass: weightClass || undefined,
        }
      });

      // Create title name for championship fights
      const titleName = fightData.isTitle
        ? `BKFC ${fightData.weightClass} World Championship`
        : undefined;

      // Upsert fight
      try {
        await prisma.fight.upsert({
          where: {
            eventId_fighter1Id_fighter2Id: {
              eventId: event.id,
              fighter1Id,
              fighter2Id,
            }
          },
          update: {
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
            scheduledRounds: fightData.isTitle ? 5 : 5,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
          },
          create: {
            eventId: event.id,
            fighter1Id,
            fighter2Id,
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
            scheduledRounds: fightData.isTitle ? 5 : 5,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            hasStarted: false,
            isComplete: false,
          }
        });

        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to import fight ${fightData.fighterA.name} vs ${fightData.fighterB.name}:`, error);
      }
    }

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);
    } else {
      console.log(`    ⚠ No fights found for this event`);
    }
  }

  console.log(`✅ Imported all BKFC events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importBKFCData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/bkfc/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/bkfc/latest-athletes.json'),
  } = options;

  console.log('\n🥊 Starting BKFC data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedBKFCEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedBKFCAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterNameToId = await importBKFCFighters(athletesData);

    // Step 2: Import events and fights
    await importBKFCEvents(eventsData, fighterNameToId);

    console.log('✅ BKFC data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during BKFC import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported BKFC data
 */
export async function getBKFCImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count({ where: { sport: Sport.BOXING } }),
    prisma.event.count({ where: { promotion: 'BKFC' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'BKFC' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'BKFC',
        date: { gte: new Date() },
        isComplete: false
      }
    })
  ]);

  return {
    totalFighters,
    totalEvents,
    totalFights,
    upcomingEvents
  };
}
