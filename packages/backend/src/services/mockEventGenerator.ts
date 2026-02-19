// Mock Event Generator
// Creates fake UFC events for testing live event workflows

import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';

interface MockEventOptions {
  fightCount?: number;
  eventName?: string;
  includeTitle?: boolean;
}

const prisma = new PrismaClient();

// Pool of mock fighter names
const FIGHTER_NAMES = [
  { firstName: 'Jon', lastName: 'Smith' },
  { firstName: 'Alex', lastName: 'Johnson' },
  { firstName: 'Michael', lastName: 'Williams' },
  { firstName: 'Daniel', lastName: 'Brown' },
  { firstName: 'Robert', lastName: 'Jones' },
  { firstName: 'Chris', lastName: 'Garcia' },
  { firstName: 'James', lastName: 'Martinez' },
  { firstName: 'David', lastName: 'Rodriguez' },
  { firstName: 'Ryan', lastName: 'Wilson' },
  { firstName: 'Kevin', lastName: 'Anderson' },
  { firstName: 'Sean', lastName: 'Thomas' },
  { firstName: 'Brandon', lastName: 'Taylor' },
  { firstName: 'Max', lastName: 'Moore' },
  { firstName: 'Justin', lastName: 'Jackson' },
  { firstName: 'Tony', lastName: 'White' },
  { firstName: 'Henry', lastName: 'Harris' },
  { firstName: 'Gilbert', lastName: 'Martin' },
  { firstName: 'Marlon', lastName: 'Thompson' },
  { firstName: 'Aljamain', lastName: 'Garcia' },
  { firstName: 'Dominick', lastName: 'Cruz' },
];

const WEIGHT_CLASSES = [
  WeightClass.FLYWEIGHT,
  WeightClass.BANTAMWEIGHT,
  WeightClass.FEATHERWEIGHT,
  WeightClass.LIGHTWEIGHT,
  WeightClass.WELTERWEIGHT,
  WeightClass.MIDDLEWEIGHT,
  WeightClass.LIGHT_HEAVYWEIGHT,
  WeightClass.HEAVYWEIGHT,
];

/**
 * Generate a mock UFC event with fighters and fights
 */
export async function generateMockEvent(options: MockEventOptions = {}) {
  const {
    fightCount = 10,
    eventName = `UFC Mock Event ${Date.now()}`,
    includeTitle = true,
  } = options;

  console.log(`Generating mock event: ${eventName} with ${fightCount} fights`);

  // Create event
  const eventDate = new Date();
  eventDate.setHours(eventDate.getHours() + 1); // Event starts in 1 hour

  const event = await prisma.event.create({
    data: {
      name: eventName,
      promotion: 'UFC',
      date: eventDate,
      venue: 'Mock Arena',
      location: 'Las Vegas, NV',
      mainStartTime: eventDate,
      eventStatus: 'UPCOMING',
    },
  });

  console.log(`Created event: ${event.id}`);

  // Generate fighters and fights
  const fights = [];
  const usedFighterIndices = new Set<number>();

  for (let i = 0; i < fightCount; i++) {
    const isMainEvent = i === 0;
    const isTitleFight = includeTitle && isMainEvent;
    const scheduledRounds = isTitleFight ? 5 : 3;

    // Get unique fighters for this fight
    let fighter1Index: number;
    let fighter2Index: number;

    do {
      fighter1Index = Math.floor(Math.random() * FIGHTER_NAMES.length);
    } while (usedFighterIndices.has(fighter1Index));
    usedFighterIndices.add(fighter1Index);

    do {
      fighter2Index = Math.floor(Math.random() * FIGHTER_NAMES.length);
    } while (usedFighterIndices.has(fighter2Index));
    usedFighterIndices.add(fighter2Index);

    const fighter1Name = FIGHTER_NAMES[fighter1Index];
    const fighter2Name = FIGHTER_NAMES[fighter2Index];
    const weightClass = WEIGHT_CLASSES[Math.floor(Math.random() * WEIGHT_CLASSES.length)];

    // Create or get fighters
    const fighter1 = await prisma.fighter.upsert({
      where: {
        firstName_lastName: {
          firstName: fighter1Name.firstName,
          lastName: fighter1Name.lastName,
        },
      },
      update: {},
      create: {
        firstName: fighter1Name.firstName,
        lastName: fighter1Name.lastName,
        wins: Math.floor(Math.random() * 20),
        losses: Math.floor(Math.random() * 5),
        weightClass,
        sport: Sport.MMA,
        gender: Gender.MALE,
      },
    });

    const fighter2 = await prisma.fighter.upsert({
      where: {
        firstName_lastName: {
          firstName: fighter2Name.firstName,
          lastName: fighter2Name.lastName,
        },
      },
      update: {},
      create: {
        firstName: fighter2Name.firstName,
        lastName: fighter2Name.lastName,
        wins: Math.floor(Math.random() * 20),
        losses: Math.floor(Math.random() * 5),
        weightClass,
        sport: Sport.MMA,
        gender: Gender.MALE,
      },
    });

    // Create fight
    const fight = await prisma.fight.create({
      data: {
        eventId: event.id,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass,
        isTitle: isTitleFight,
        titleName: isTitleFight ? `UFC ${weightClass} Championship` : undefined,
        scheduledRounds,
        orderOnCard: i + 1,
        fightStatus: 'UPCOMING',
      },
      include: {
        fighter1: true,
        fighter2: true,
      },
    });

    fights.push(fight);
    console.log(
      `Created fight ${i + 1}/${fightCount}: ${fighter1.firstName} ${fighter1.lastName} vs ${fighter2.firstName} ${fighter2.lastName}`
    );
  }

  console.log(`Mock event generation complete: ${event.id}`);

  return {
    event,
    fights,
  };
}

/**
 * Delete a mock event and all related data
 */
export async function deleteMockEvent(eventId: string) {
  console.log(`Deleting mock event: ${eventId}`);

  await prisma.event.delete({
    where: { id: eventId },
  });

  console.log(`Mock event deleted: ${eventId}`);
}

/**
 * Delete all mock events (events with "Mock Event" in the name)
 */
export async function deleteAllMockEvents(): Promise<number> {
  console.log('Deleting all mock events...');

  const mockEvents = await prisma.event.findMany({
    where: {
      name: {
        contains: 'Mock Event',
        mode: 'insensitive'
      }
    },
    select: { id: true, name: true }
  });

  if (mockEvents.length === 0) {
    console.log('No mock events to delete');
    return 0;
  }

  const eventIds = mockEvents.map(e => e.id);

  // First delete all fights for these events
  await prisma.fight.deleteMany({
    where: {
      eventId: { in: eventIds }
    }
  });

  // Then delete all mock events
  const result = await prisma.event.deleteMany({
    where: {
      id: { in: eventIds }
    }
  });

  console.log(`Deleted ${result.count} mock events:`, mockEvents.map(e => e.name));
  return result.count;
}
