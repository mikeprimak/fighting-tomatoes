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
      // Upcoming events: not completed AND date is in the future
      where.AND = [
        { isComplete: false },
        { date: { gte: new Date() } }
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