// RIZIN Fighting Federation Data Parser - Imports scraped Sherdog JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage, uploadLocalFileToR2 } from './imageStorage';
import { TBA_FIGHTER_ID, TBA_FIGHTER_NAME, isTBAFighter } from '../constants/tba';
import { stripDiacritics } from '../utils/fighterMatcher';

const prisma = new PrismaClient();

// ============== DEFAULT RIZIN BANNER ==============
// Rizin doesn't provide reliable event banners ahead of events,
// so we use the RIZIN logo as a default banner for upcoming events.
const RIZIN_DEFAULT_BANNER_R2_KEY = 'events/rizin-default-banner.jpg';
const RIZIN_DEFAULT_BANNER_LOCAL = path.join(__dirname, '../../public/images/events/rizin-default-banner.jpg');

let _rizinDefaultBannerUrl: string | null = null;

async function getRizinDefaultBannerUrl(): Promise<string | null> {
  if (_rizinDefaultBannerUrl) return _rizinDefaultBannerUrl;

  try {
    const buffer = await fs.readFile(RIZIN_DEFAULT_BANNER_LOCAL);
    const url = await uploadLocalFileToR2(Buffer.from(buffer), RIZIN_DEFAULT_BANNER_R2_KEY);
    if (url) {
      _rizinDefaultBannerUrl = url;
      console.log(`  ✓ Default RIZIN banner uploaded to R2: ${url}`);
      return url;
    }
  } catch (error) {
    console.warn('  ⚠ Could not upload default RIZIN banner to R2');
  }
  return null;
}

// ============== TYPE DEFINITIONS ==============

interface ScrapedRizinFighter {
  name: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  record: string | null; // "21-1-0" format or null
  url: string;
  imageUrl: string | null;
  country?: string;
  localImagePath?: string;
}

interface ScrapedRizinFightResult {
  method: string;
  round: string;
  time: string;
  winner: string;
}

interface ScrapedRizinFight {
  fightId: string;
  order: number;
  cardType: string;
  weightClass: string;
  isTitle: boolean;
  fighterA: {
    name: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    record: string;
    country: string;
    imageUrl: string | null;
    athleteUrl: string;
    rank: string;
    odds: string;
  };
  fighterB: {
    name: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    record: string;
    country: string;
    imageUrl: string | null;
    athleteUrl: string;
    rank: string;
    odds: string;
  };
  result?: ScrapedRizinFightResult;
}

interface ScrapedRizinEvent {
  eventName: string;
  eventUrl: string;
  dateText: string;
  venue: string;
  city: string;
  country: string;
  eventImageUrl: string | null;
  fights?: ScrapedRizinFight[];
  localImagePath?: string;
  hasFightCard?: boolean;
  eventDate?: string | null;
  eventVenue?: string;
  eventLocation?: string;
}

interface ScrapedRizinEventsData {
  events: ScrapedRizinEvent[];
}

interface ScrapedRizinAthletesData {
  athletes: ScrapedRizinFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse fighter record string "W-L-D" into numbers
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
 * Parse weight class string to WeightClass enum
 * RIZIN uses standard MMA weight classes plus some unique ones like Super Atomweight
 */
function parseRizinWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,
    'super atomweight': WeightClass.STRAWWEIGHT, // RIZIN-specific, ~115 lbs
    'atomweight': WeightClass.STRAWWEIGHT, // Map to closest standard
    'flyweight': WeightClass.FLYWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'super bantamweight': WeightClass.BANTAMWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'super lightweight': WeightClass.WELTERWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'light-heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'heavyweight': WeightClass.HEAVYWEIGHT,
    'super heavyweight': WeightClass.HEAVYWEIGHT,
    'open weight': WeightClass.HEAVYWEIGHT, // Map catchweight/open to heavyweight
  };

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Try extracting weight in kg/lbs for catchweight fights
  const kgMatch = normalized.match(/(\d+)\s*kg/);
  if (kgMatch) {
    const kg = parseInt(kgMatch[1], 10);
    if (kg <= 52) return WeightClass.STRAWWEIGHT;
    if (kg <= 57) return WeightClass.FLYWEIGHT;
    if (kg <= 61) return WeightClass.BANTAMWEIGHT;
    if (kg <= 66) return WeightClass.FEATHERWEIGHT;
    if (kg <= 71) return WeightClass.LIGHTWEIGHT;
    if (kg <= 77) return WeightClass.WELTERWEIGHT;
    if (kg <= 84) return WeightClass.MIDDLEWEIGHT;
    if (kg <= 93) return WeightClass.LIGHT_HEAVYWEIGHT;
    return WeightClass.HEAVYWEIGHT;
  }

  const lbsMatch = normalized.match(/(\d+)\s*lb/);
  if (lbsMatch) {
    const lbs = parseInt(lbsMatch[1], 10);
    if (lbs <= 115) return WeightClass.STRAWWEIGHT;
    if (lbs <= 125) return WeightClass.FLYWEIGHT;
    if (lbs <= 135) return WeightClass.BANTAMWEIGHT;
    if (lbs <= 145) return WeightClass.FEATHERWEIGHT;
    if (lbs <= 155) return WeightClass.LIGHTWEIGHT;
    if (lbs <= 170) return WeightClass.WELTERWEIGHT;
    if (lbs <= 185) return WeightClass.MIDDLEWEIGHT;
    if (lbs <= 205) return WeightClass.LIGHT_HEAVYWEIGHT;
    return WeightClass.HEAVYWEIGHT;
  }

  return null;
}

/**
 * Infer gender from weight class name
 * RIZIN uses "Women's" prefix for women's divisions
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('women ') ||
      normalized.includes('atomweight') || normalized.includes('super atomweight')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Infer sport from weight class / fight context
 * RIZIN hosts MMA, kickboxing, and sometimes mixed-rules bouts
 */
function inferSport(weightClassStr: string, eventName: string): Sport {
  const combined = `${weightClassStr} ${eventName}`.toLowerCase();
  if (combined.includes('kickboxing') || combined.includes('kick boxing') || combined.includes('k-1')) {
    return Sport.KICKBOXING;
  }
  if (combined.includes('muay thai')) {
    return Sport.MUAY_THAI;
  }
  return Sport.MMA;
}

/**
 * Parse date text into a Date object
 * Handles: "Mar 07 2026", "Mar 07, 2026", "2026-03-07", ISO strings
 */
function parseRizinDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  if (dateStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const months: Record<string, number> = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };

  // Try "Mon DD YYYY" or "Mon DD, YYYY"
  const match1 = dateStr.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (match1) {
    const month = months[match1[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(parseInt(match1[3]), month, parseInt(match1[2]));
    }
  }

  // Try "YYYY-MM-DD"
  const match2 = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match2) {
    return new Date(parseInt(match2[1]), parseInt(match2[2]) - 1, parseInt(match2[3]));
  }

  // Try Date.parse fallback
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalize result method string to standard format
 */
function normalizeMethod(method: string): string {
  if (!method) return '';

  const normalized = method.trim();

  // Standard RIZIN/MMA result methods
  if (/ko|knockout|tko/i.test(normalized)) return 'KO/TKO';
  if (/sub|submission|tap/i.test(normalized)) return 'Submission';
  if (/dec|decision|unanimous|split|majority/i.test(normalized)) {
    if (/unanimous/i.test(normalized)) return 'Decision - Unanimous';
    if (/split/i.test(normalized)) return 'Decision - Split';
    if (/majority/i.test(normalized)) return 'Decision - Majority';
    return 'Decision';
  }
  if (/draw/i.test(normalized)) return 'Draw';
  if (/no contest|nc/i.test(normalized)) return 'No Contest';
  if (/dq|disqual/i.test(normalized)) return 'DQ';

  return normalized;
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped RIZIN data
 */
async function importRizinFighters(
  athletesData: ScrapedRizinAthletesData
): Promise<Map<string, string>> {
  const fighterUrlToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} RIZIN fighters...`);

  for (const athlete of athletesData.athletes) {
    const firstName = stripDiacritics(athlete.firstName || '');
    const lastName = stripDiacritics(athlete.lastName || '');
    const recordParts = parseRecord(athlete.record);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Upload image to R2 (always prefer imageUrl over localImagePath,
    // since localImagePath is a local file path that won't work in production)
    let profileImageUrl: string | null = null;
    if (athlete.imageUrl) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using source URL`);
        profileImageUrl = athlete.imageUrl;
      }
    }

    try {
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
          nickname: athlete.nickname || undefined,
        },
        create: {
          firstName,
          lastName,
          nickname: athlete.nickname || undefined,
          ...recordParts,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when processing fights
          sport: Sport.MMA,
          isActive: true,
        }
      });

      fighterUrlToId.set(athlete.url, fighter.id);
      console.log(`  ✓ ${firstName} ${lastName} (${athlete.record || 'no record'})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterUrlToId.size} RIZIN fighters\n`);
  return fighterUrlToId;
}

/**
 * Import RIZIN events and fights from scraped data
 */
async function importRizinEvents(
  eventsData: ScrapedRizinEventsData,
  fighterUrlToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} RIZIN events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedRizinEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parseRizinDate(eventData.eventDate || eventData.dateText);

    if (!eventDate) {
      console.warn(`  ⚠ Skipping event with invalid date: ${eventData.eventName}`);
      continue;
    }

    // Extract mainStartTime from eventDate if it contains real time data (not midnight UTC)
    // Sherdog's [itemprop="startDate"] content attribute often includes timezone offset (e.g. +09:00)
    // which JS Date() converts to UTC automatically
    const hasRealTime = eventDate.getUTCHours() !== 0 || eventDate.getUTCMinutes() !== 0;
    const mainStartTime = hasRealTime ? eventDate : undefined;

    // Parse location
    const venue = eventData.eventVenue || eventData.venue || '';
    const city = eventData.city || '';
    const country = eventData.country || 'Japan'; // Default to Japan for RIZIN

    const location = [city, country]
      .filter(Boolean)
      .join(', ') || 'Japan';

    // Check if event is completed (date in the past)
    const isComplete = eventDate < new Date();

    // For upcoming events, use the default RIZIN logo banner
    // (Rizin doesn't provide reliable event banners ahead of time)
    let bannerImageUrl: string | undefined;
    if (!isComplete) {
      const defaultBanner = await getRizinDefaultBannerUrl();
      if (defaultBanner) {
        bannerImageUrl = defaultBanner;
      }
    } else if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using source URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    // Find or create event
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventUrl },
          { name: eventData.eventName, date: eventDate }
        ]
      }
    });

    if (event) {
      // Update existing event - do NOT overwrite eventStatus (lifecycle service manages it)
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          mainStartTime,
          venue: venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
        }
      });
    } else {
      // Create new event - set initial status based on date
      const initialStatus = isComplete ? 'COMPLETED' : 'UPCOMING';
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'RIZIN',
          date: eventDate,
          mainStartTime,
          venue: venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          eventStatus: initialStatus,
        }
      });
    }

    console.log(`  ✓ Event: ${eventData.eventName} (${eventDate.toLocaleDateString()})`);

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    for (const fightData of fights) {
      // Check if fighterB is TBA
      const isFighterBTBA = !fightData.fighterB.name ||
                            fightData.fighterB.name.trim() === '' ||
                            fightData.fighterB.name.toUpperCase() === 'TBA' ||
                            fightData.fighterB.name.toUpperCase() === 'TBD' ||
                            (!fightData.fighterB.firstName && !fightData.fighterB.lastName);

      // Find fighter IDs from URL map
      let fighter1Id = fighterUrlToId.get(fightData.fighterA.athleteUrl);
      let fighter2Id = isFighterBTBA ? TBA_FIGHTER_ID : fighterUrlToId.get(fightData.fighterB.athleteUrl);

      // If not found by URL, try to find by name
      if (!fighter1Id && fightData.fighterA.firstName && fightData.fighterA.lastName) {
        const fighter1 = await prisma.fighter.findUnique({
          where: {
            firstName_lastName: {
              firstName: stripDiacritics(fightData.fighterA.firstName),
              lastName: stripDiacritics(fightData.fighterA.lastName),
            }
          }
        });
        if (fighter1) {
          fighter1Id = fighter1.id;
          fighterUrlToId.set(fightData.fighterA.athleteUrl, fighter1.id);
        }
      }

      if (!isFighterBTBA && !fighter2Id && fightData.fighterB.firstName && fightData.fighterB.lastName) {
        const fighter2 = await prisma.fighter.findUnique({
          where: {
            firstName_lastName: {
              firstName: stripDiacritics(fightData.fighterB.firstName),
              lastName: stripDiacritics(fightData.fighterB.lastName),
            }
          }
        });
        if (fighter2) {
          fighter2Id = fighter2.id;
          fighterUrlToId.set(fightData.fighterB.athleteUrl, fighter2.id);
        }
      }

      // If still not found, create/upsert the fighters
      if (!fighter1Id) {
        const recordParts = parseRecord(fightData.fighterA.record);
        const nameParts = fightData.fighterA.name.split(' ').filter((p: string) => p.length > 0);
        let firstName = stripDiacritics(fightData.fighterA.firstName || '');
        let lastName = stripDiacritics(fightData.fighterA.lastName || '');
        if (!firstName && !lastName && nameParts.length > 0) {
          if (nameParts.length === 1) {
            firstName = '';
            lastName = stripDiacritics(nameParts[0]);
          } else {
            firstName = stripDiacritics(nameParts[0]);
            lastName = stripDiacritics(nameParts.slice(1).join(' '));
          }
        }
        const sport = inferSport(fightData.weightClass, eventData.eventName);
        const fighter1 = await prisma.fighter.upsert({
          where: {
            firstName_lastName: { firstName, lastName }
          },
          create: {
            firstName,
            lastName,
            nickname: fightData.fighterA.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterA.imageUrl || undefined,
            gender: inferGenderFromWeightClass(fightData.weightClass),
            sport,
            isActive: true,
          },
          update: {
            nickname: fightData.fighterA.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterA.imageUrl || undefined,
          }
        });
        fighter1Id = fighter1.id;
        fighterUrlToId.set(fightData.fighterA.athleteUrl, fighter1.id);
        console.log(`    + Upserted fighter: ${fightData.fighterA.name}`);
      }

      if (!fighter2Id && !isFighterBTBA) {
        const recordParts = parseRecord(fightData.fighterB.record);
        const nameParts = fightData.fighterB.name.split(' ').filter((p: string) => p.length > 0);
        let firstName = stripDiacritics(fightData.fighterB.firstName || '');
        let lastName = stripDiacritics(fightData.fighterB.lastName || '');
        if (!firstName && !lastName && nameParts.length > 0) {
          if (nameParts.length === 1) {
            firstName = '';
            lastName = stripDiacritics(nameParts[0]);
          } else {
            firstName = stripDiacritics(nameParts[0]);
            lastName = stripDiacritics(nameParts.slice(1).join(' '));
          }
        }
        const sport = inferSport(fightData.weightClass, eventData.eventName);
        const fighter2 = await prisma.fighter.upsert({
          where: {
            firstName_lastName: { firstName, lastName }
          },
          create: {
            firstName,
            lastName,
            nickname: fightData.fighterB.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterB.imageUrl || undefined,
            gender: inferGenderFromWeightClass(fightData.weightClass),
            sport,
            isActive: true,
          },
          update: {
            nickname: fightData.fighterB.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterB.imageUrl || undefined,
          }
        });
        fighter2Id = fighter2.id;
        fighterUrlToId.set(fightData.fighterB.athleteUrl, fighter2.id);
        console.log(`    + Upserted fighter: ${fightData.fighterB.name}`);
      } else if (isFighterBTBA) {
        fighter2Id = TBA_FIGHTER_ID;
        console.log(`    📋 Fighter B is TBA - using placeholder`);
      }

      // Parse weight class and gender
      const weightClass = parseRizinWeightClass(fightData.weightClass);
      const gender = inferGenderFromWeightClass(fightData.weightClass);
      const sport = inferSport(fightData.weightClass, eventData.eventName);

      // Update fighter weight class, gender, and sport
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          weightClass: weightClass || undefined,
          sport,
        }
      });

      if (!isTBAFighter(fighter2Id)) {
        await prisma.fighter.update({
          where: { id: fighter2Id },
          data: {
            gender,
            weightClass: weightClass || undefined,
            sport,
          }
        });
      }

      // Build title name
      const titleName = fightData.isTitle
        ? `RIZIN ${fightData.weightClass} Championship`
        : undefined;

      // Skip if fighter2Id is still undefined
      if (!fighter2Id) {
        console.warn(`    ⚠ Skipping fight - fighter2Id not found for ${fightData.fighterB.name}`);
        continue;
      }

      // Parse fight result (for completed events)
      const result = fightData.result;
      const hasResult = result && result.method && result.method.trim() !== '';
      const normalizedMethod = hasResult ? normalizeMethod(result.method) : undefined;

      // Determine winner
      let winnerId: string | undefined;
      if (hasResult && result.winner) {
        // Match winner name to fighter
        const winnerNameLower = result.winner.toLowerCase().trim();
        const fighter1Name = fightData.fighterA.name.toLowerCase().trim();
        const fighter2Name = fightData.fighterB.name.toLowerCase().trim();

        if (winnerNameLower === fighter1Name || fighter1Name.includes(winnerNameLower) || winnerNameLower.includes(fighter1Name)) {
          winnerId = fighter1Id;
        } else if (winnerNameLower === fighter2Name || fighter2Name.includes(winnerNameLower) || winnerNameLower.includes(fighter2Name)) {
          winnerId = fighter2Id;
        }
      }

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
            scheduledRounds: fightData.isTitle ? 5 : 3,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            // Update result fields only if event is actually complete AND we have result data
            ...(hasResult && isComplete ? {
              fightStatus: 'COMPLETED',
              method: normalizedMethod,
              round: result.round ? parseInt(result.round, 10) : undefined,
              time: result.time || undefined,
              winner: winnerId || undefined,
            } : {}),
          },
          create: {
            eventId: event.id,
            fighter1Id,
            fighter2Id,
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
            scheduledRounds: fightData.isTitle ? 5 : 3,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            fightStatus: (hasResult && isComplete) ? 'COMPLETED' : 'UPCOMING',
            method: normalizedMethod,
            round: hasResult && result.round ? parseInt(result.round, 10) : undefined,
            time: hasResult ? result.time || undefined : undefined,
            winner: winnerId || undefined,
          }
        });

        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to import fight ${fightData.fighterA.name} vs ${fightData.fighterB.name}:`, error);
      }
    }

    // ============== CANCELLATION DETECTION ==============
    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

      // Build sets for cancellation detection
      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        if (fightData.fighterA.firstName || fightData.fighterA.lastName) {
          scrapedFighterNames.add(`${fightData.fighterA.firstName || ''} ${fightData.fighterA.lastName || ''}`.toLowerCase().trim());
        }
        if (fightData.fighterB.firstName || fightData.fighterB.lastName) {
          scrapedFighterNames.add(`${fightData.fighterB.firstName || ''} ${fightData.fighterB.lastName || ''}`.toLowerCase().trim());
        }
      }

      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        const isFighterBTBA = !fightData.fighterB.name ||
                              fightData.fighterB.name.trim() === '' ||
                              fightData.fighterB.name.toUpperCase() === 'TBA' ||
                              fightData.fighterB.name.toUpperCase() === 'TBD' ||
                              (!fightData.fighterB.firstName && !fightData.fighterB.lastName);

        if (!isFighterBTBA) {
          const pairKey = [
            `${fightData.fighterA.firstName || ''} ${fightData.fighterA.lastName || ''}`.toLowerCase().trim(),
            `${fightData.fighterB.firstName || ''} ${fightData.fighterB.lastName || ''}`.toLowerCase().trim()
          ].sort().join('|');
          scrapedFightPairs.add(pairKey);
        }
      }

      // Check for cancelled fights
      const existingDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          fightStatus: 'UPCOMING',
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      let cancelledCount = 0;
      let unCancelledCount = 0;

      for (const dbFight of existingDbFights) {
        if (isTBAFighter(dbFight.fighter2Id)) continue;

        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        if (!scrapedFightPairs.has(dbFightPairKey)) {
          const fighter1Rebooked = scrapedFighterNames.has(fighter1Name);
          const fighter2Rebooked = scrapedFighterNames.has(fighter2Name);

          if (fighter1Rebooked || fighter2Rebooked) {
            console.log(`    ❌ Cancelling fight (fighter rebooked): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
            await prisma.fight.update({
              where: { id: dbFight.id },
              data: { fightStatus: 'CANCELLED' }
            });
            cancelledCount++;
          } else {
            // Neither fighter appears in scraped data - fight was fully cancelled
            console.log(`    ❌ Cancelling fight (not in scraped data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
            await prisma.fight.update({
              where: { id: dbFight.id },
              data: { fightStatus: 'CANCELLED' }
            });
            cancelledCount++;
          }
        }
      }

      // Un-cancel fights that reappear
      const cancelledDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          fightStatus: 'CANCELLED',
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      for (const dbFight of cancelledDbFights) {
        if (isTBAFighter(dbFight.fighter2Id)) continue;

        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        if (scrapedFightPairs.has(dbFightPairKey)) {
          console.log(`    ✅ Un-cancelling fight (reappeared): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { fightStatus: 'UPCOMING' }
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

  console.log(`✅ Imported all RIZIN events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importRizinData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/rizin/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/rizin/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting RIZIN data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedRizinEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedRizinAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterUrlToId = await importRizinFighters(athletesData);

    // Step 2: Import events and fights
    await importRizinEvents(eventsData, fighterUrlToId);

    console.log('✅ RIZIN data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during RIZIN import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  importRizinData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
