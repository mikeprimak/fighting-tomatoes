import { Request, Response } from 'express';
import { prisma } from '../app';

export const getEvents = async (req: Request, res: Response) => {
  try {
    const { 
      past, 
      limit = '20', 
      offset = '0' 
    } = req.query;

    const where: any = {};

    // Filter logic based on what we actually want to show
    if (past === 'true') {
      // Past events: either completed OR date is in the past
      where.OR = [
        { isComplete: true },
        { date: { lt: new Date() } }
      ];
    } else {
      // Upcoming events: not completed AND date is in the future AND has at least one fight
      where.AND = [
        { isComplete: false },
        { date: { gte: new Date() } },
        { fights: { some: {} } }  // Only show events that have fights announced
      ];
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          }
        },
        fights: {
          where: {
            isCancelled: false
          },
          include: {
            fighterA: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                photoUrl: true,
              }
            },
            fighterB: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                photoUrl: true,
              }
            }
          },
          orderBy: {
            fightOrder: 'asc'
          }
        }
      },
      orderBy: {
        date: past === 'true' ? 'desc' : 'asc'
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEventById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          }
        },
        fights: {
          where: {
            isCancelled: false
          },
          include: {
            fighterA: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                photoUrl: true,
                record: true,
                weightClass: true,
              }
            },
            fighterB: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                photoUrl: true,
                record: true,
                weightClass: true,
              }
            },
            ratings: {
              select: {
                rating: true,
              }
            }
          },
          orderBy: {
            fightOrder: 'asc'
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Calculate average ratings for each fight
    const fightsWithRatings = event.fights.map(fight => {
      const totalRatings = fight.ratings.length;
      const averageRating = totalRatings > 0
        ? fight.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : null;

      return {
        ...fight,
        averageRating: averageRating ? Number(averageRating.toFixed(1)) : null,
        totalRatings,
        ratings: undefined, // Remove individual ratings from response
      };
    });

    res.json({
      ...event,
      fights: fightsWithRatings,
    });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEventEngagement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get event with all fights
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        fights: {
          select: {
            id: true,
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const fightIds = event.fights.map(f => f.id);

    // Get user's individual predictions for this event
    const individualPredictions = await prisma.fightPrediction.findMany({
      where: {
        userId,
        fightId: { in: fightIds }
      },
      select: {
        id: true,
        fightId: true,
        predictedRating: true,
      }
    });

    // Get user's crew predictions for this event
    const crewPredictions = await prisma.crewPrediction.findMany({
      where: {
        userId,
        fightId: { in: fightIds }
      },
      select: {
        id: true,
        fightId: true,
        hypeLevel: true,
      }
    });

    // Combine both prediction types (deduplicate by fightId)
    const allPredictionsByFight = new Map<string, number | null>();

    // Add individual predictions
    individualPredictions.forEach(p => {
      if (!allPredictionsByFight.has(p.fightId)) {
        allPredictionsByFight.set(p.fightId, p.predictedRating);
      }
    });

    // Add crew predictions
    crewPredictions.forEach(p => {
      if (!allPredictionsByFight.has(p.fightId)) {
        allPredictionsByFight.set(p.fightId, p.hypeLevel);
      }
    });

    const predictions = Array.from(allPredictionsByFight.entries()).map(([fightId, rating]) => ({
      fightId,
      rating
    }));

    // Get user's ratings for this event
    const ratings = await prisma.fightRating.findMany({
      where: {
        userId,
        fightId: { in: fightIds }
      },
      select: {
        id: true,
        fightId: true,
        rating: true,
      }
    });

    // Calculate average hype level from predictions
    const hypeLevels = predictions
      .map(p => p.rating)
      .filter((rating): rating is number => rating !== null && rating > 0);

    const avgHype = hypeLevels.length > 0
      ? hypeLevels.reduce((sum, rating) => sum + rating, 0) / hypeLevels.length
      : null;

    console.log('Event engagement calculated:', {
      eventId: id,
      userId,
      totalFights: event.fights.length,
      individualPredictions: individualPredictions.length,
      crewPredictions: crewPredictions.length,
      totalPredictions: predictions.length,
      ratingsCount: ratings.length,
      avgHype
    });

    const engagement = {
      totalFights: event.fights.length,
      predictionsCount: predictions.length,
      ratingsCount: ratings.length,
      averageHype: avgHype ? Number(avgHype.toFixed(1)) : null,
    };

    res.json(engagement);
  } catch (error) {
    console.error('Get event engagement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};