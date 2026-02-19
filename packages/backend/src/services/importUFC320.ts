import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function importUFC320() {
  console.log('📥 Importing UFC 320 data...\n');

  // Read the scraped data
  const dataPath = path.join(__dirname, '../../test-results/ufc-320-fight-card.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const eventData = JSON.parse(rawData);

  try {
    // 1. Create the event
    console.log('Creating event...');
    const event = await prisma.event.create({
      data: {
        name: 'UFC 320: Ankalaev vs Pereira 2',
        promotion: 'UFC',
        date: new Date('2025-10-04T22:00:00-04:00'), // 10 PM EDT on Oct 4
        venue: 'TBD',
        location: 'TBD',
        mainStartTime: new Date('2025-10-04T22:00:00-04:00'), // Main card 10 PM EDT
        prelimStartTime: new Date('2025-10-04T20:00:00-04:00'), // Prelims 8 PM EDT
        eventStatus: 'UPCOMING',
      },
    });
    console.log(`✅ Event created: ${event.id}\n`);

    // 2. Process fighters and create them if they don't exist
    console.log('Processing fighters...');
    const fighterMap = new Map<string, string>(); // name -> id

    for (const fight of eventData.fights) {
      // Process Fighter A
      const fighterAName = fight.fighterA.name;
      if (fighterAName && !fighterMap.has(fighterAName)) {
        const [firstName, ...lastNameParts] = fighterAName.split(' ');
        const lastName = lastNameParts.join(' ') || firstName;

        const existingFighter = await prisma.fighter.findFirst({
          where: {
            firstName,
            lastName,
          },
        });

        if (existingFighter) {
          fighterMap.set(fighterAName, existingFighter.id);
        } else {
          const newFighter = await prisma.fighter.create({
            data: {
              firstName,
              lastName,
              gender: fighterAName.toLowerCase().includes('women') ? 'FEMALE' : 'MALE',
              weightClass: mapWeightClass(fight.weightClass),
            },
          });
          fighterMap.set(fighterAName, newFighter.id);
          console.log(`  Created fighter: ${fighterAName}`);
        }
      }

      // Process Fighter B
      const fighterBName = fight.fighterB.name;
      if (fighterBName && !fighterMap.has(fighterBName)) {
        const [firstName, ...lastNameParts] = fighterBName.split(' ');
        const lastName = lastNameParts.join(' ') || firstName;

        const existingFighter = await prisma.fighter.findFirst({
          where: {
            firstName,
            lastName,
          },
        });

        if (existingFighter) {
          fighterMap.set(fighterBName, existingFighter.id);
        } else {
          const newFighter = await prisma.fighter.create({
            data: {
              firstName,
              lastName,
              gender: fighterBName.toLowerCase().includes('women') ? 'FEMALE' : 'MALE',
              weightClass: mapWeightClass(fight.weightClass),
            },
          });
          fighterMap.set(fighterBName, newFighter.id);
          console.log(`  Created fighter: ${fighterBName}`);
        }
      }
    }
    console.log(`✅ Processed ${fighterMap.size} fighters\n`);

    // 3. Create fights
    console.log('Creating fights...');
    let createdCount = 0;

    for (const fight of eventData.fights) {
      const fighter1Id = fighterMap.get(fight.fighterA.name);
      const fighter2Id = fighterMap.get(fight.fighterB.name);

      if (!fighter1Id || !fighter2Id) {
        console.log(`  ⚠️  Skipping fight: ${fight.fighterA.name} vs ${fight.fighterB.name} (missing fighters)`);
        continue;
      }

      const weightClass = mapWeightClass(fight.weightClass);
      const titleName = fight.isTitle
        ? `UFC ${fight.weightClass} Championship`
        : undefined;

      await prisma.fight.create({
        data: {
          eventId: event.id,
          fighter1Id,
          fighter2Id,
          weightClass,
          isTitle: fight.isTitle,
          titleName,
          scheduledRounds: fight.isTitle ? 5 : 3,
          orderOnCard: fight.order,
          startTime: fight.startTime,
          fightStatus: 'UPCOMING',
        },
      });

      createdCount++;
      console.log(`  ✅ ${fight.order}. ${fight.fighterA.name} vs ${fight.fighterB.name} - ${fight.startTime}`);
    }

    console.log(`\n✅ Created ${createdCount} fights`);
    console.log(`\n🎉 UFC 320 import complete!`);
    console.log(`Event ID: ${event.id}`);
  } catch (error: any) {
    console.error('❌ Error importing data:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Map scraped weight class to enum
function mapWeightClass(weightClass: string): any {
  const normalized = weightClass.toUpperCase().replace(/'/g, '').replace(/\s+/g, '_');

  if (normalized.includes('STRAWWEIGHT')) return 'STRAWWEIGHT';
  if (normalized.includes('FLYWEIGHT')) return 'FLYWEIGHT';
  if (normalized.includes('BANTAMWEIGHT')) return 'BANTAMWEIGHT';
  if (normalized.includes('FEATHERWEIGHT')) return 'FEATHERWEIGHT';
  if (normalized.includes('LIGHTWEIGHT')) return 'LIGHTWEIGHT';
  if (normalized.includes('WELTERWEIGHT')) return 'WELTERWEIGHT';
  if (normalized.includes('MIDDLEWEIGHT')) return 'MIDDLEWEIGHT';
  if (normalized.includes('LIGHT_HEAVYWEIGHT')) return 'LIGHT_HEAVYWEIGHT';
  if (normalized.includes('HEAVYWEIGHT')) return 'HEAVYWEIGHT';

  return null;
}

// Run the import
importUFC320();
