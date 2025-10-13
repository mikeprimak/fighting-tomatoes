import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateDefaultFighterImages() {
  console.log('Starting fighter image update...');

  try {
    // Find all fighters with profile images
    const fighters = await prisma.fighter.findMany({
      where: {
        profileImage: {
          not: null,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
      },
    });

    console.log(`Found ${fighters.length} fighters with profile images`);

    let updatedCount = 0;

    for (const fighter of fighters) {
      if (!fighter.profileImage) continue;

      // Check if the image URL is a default/placeholder image
      const isDefaultImage =
        fighter.profileImage.includes('silhouette') ||
        fighter.profileImage.includes('default-fighter') ||
        fighter.profileImage.includes('placeholder') ||
        fighter.profileImage.includes('avatar-default') ||
        fighter.profileImage.includes('no-image') ||
        fighter.profileImage.includes('_headshot_default') ||
        fighter.profileImage.includes('default_headshot') ||
        // Add any other UFC.com placeholder patterns
        fighter.profileImage.includes('default-profile') ||
        fighter.profileImage.includes('blank-profile');

      if (isDefaultImage) {
        console.log(
          `Updating ${fighter.firstName} ${fighter.lastName} (${fighter.id})`
        );
        console.log(`  Old URL: ${fighter.profileImage}`);

        // Set profileImage to null so the app uses our local transparent placeholder
        await prisma.fighter.update({
          where: { id: fighter.id },
          data: { profileImage: null },
        });

        updatedCount++;
      }
    }

    console.log(`\nUpdate complete!`);
    console.log(`Total fighters checked: ${fighters.length}`);
    console.log(`Fighters updated: ${updatedCount}`);
  } catch (error) {
    console.error('Error updating fighter images:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateDefaultFighterImages()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
