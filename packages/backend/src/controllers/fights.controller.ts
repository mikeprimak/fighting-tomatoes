import { Request, Response } from 'express';
import { prisma } from '../app';

export const getFights = async (req: Request, res: Response) => {
  try {
    const { eventId, limit = '20', offset = '0' } = req.query;

    const where: any = {};
    if (eventId) {
      where.eventId = eventId;
    }

    const fights = await prisma.fight.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            shortName: true,
            date: true,
            organization: {
              select: {
                name: true,
                shortName: true,
                logoUrl: true,
              }
            }
          }
        },
        fighterA: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            photoUrl: true,
            record: true,
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
          }
        },
        ratings: {
          select: {
            rating: true,
          }
        }
      },
      orderBy: [
        { event: { date: 'desc' } },
        { fightOrder: 'asc' }
      ],
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    // Calculate average ratings
    const fightsWithRatings = fights.map(fight => {
      const totalRatings = fight.ratings.length;
      const averageRating = totalRatings > 0 
        ? fight.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings 
        : null;

      return {
        ...fight,
        averageRating: averageRating ? Number(averageRating.toFixed(1)) : null,
        totalRatings,
        ratings: undefined,
      };
    });

    res.json({ fights: fightsWithRatings });
  } catch (error) {
    console.error('Get fights error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFightById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId; // May be undefined if not authenticated

    const fight = await prisma.fight.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            shortName: true,
            date: true,
            venue: true,
            location: true,
            organization: {
              select: {
                name: true,
                shortName: true,
                logoUrl: true,
              }
            }
          }
        },
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
            id: true,
            rating: true,
            comment: true,
            userId: true,
            createdAt: true,
            user: {
              select: {
                username: true,
                avatar: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!fight) {
      return res.status(404).json({ error: 'Fight not found' });
    }

    // Calculate average rating
    const totalRatings = fight.ratings.length;
    const averageRating = totalRatings > 0 
      ? fight.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings 
      : null;

    // Find user's rating if authenticated
    const userRating = userId 
      ? fight.ratings.find(r => r.userId === userId)
      : null;

    res.json({
      ...fight,
      averageRating: averageRating ? Number(averageRating.toFixed(1)) : null,
      totalRatings,
      userRating,
      ratings: fight.ratings.slice(0, 10), // Limit to 10 recent ratings
    });
  } catch (error) {
    console.error('Get fight by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rateFight = async (req: Request, res: Response) => {
  try {
    const { id: fightId } = req.params;
    const userId = (req as any).userId;
    const { rating, comment } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }

    // Check if fight exists
    const fight = await prisma.fight.findUnique({
      where: { id: fightId }
    });

    if (!fight) {
      return res.status(404).json({ error: 'Fight not found' });
    }

    // Check if user already rated this fight
    const existingRating = await prisma.fightRating.findUnique({
      where: {
        userId_fightId: {
          userId,
          fightId
        }
      }
    });

    if (existingRating) {
      return res.status(409).json({ error: 'You have already rated this fight' });
    }

    // Create rating
    const newRating = await prisma.fightRating.create({
      data: {
        userId,
        fightId,
        rating: parseInt(rating),
        comment,
      },
      include: {
        user: {
          select: {
            username: true,
            avatar: true,
          }
        }
      }
    });

    res.status(201).json({
      message: 'Fight rated successfully',
      rating: newRating,
    });
  } catch (error) {
    console.error('Rate fight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateFightRating = async (req: Request, res: Response) => {
  try {
    const { id: fightId } = req.params;
    const userId = (req as any).userId;
    const { rating, comment } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }

    // Update rating
    const updatedRating = await prisma.fightRating.update({
      where: {
        userId_fightId: {
          userId,
          fightId
        }
      },
      data: {
        rating: parseInt(rating),
        comment,
      },
      include: {
        user: {
          select: {
            username: true,
            avatar: true,
          }
        }
      }
    });

    res.json({
      message: 'Rating updated successfully',
      rating: updatedRating,
    });
  } catch (error) {
    console.error('Update rating error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Rating not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteFightRating = async (req: Request, res: Response) => {
  try {
    const { id: fightId } = req.params;
    const userId = (req as any).userId;

    // Delete rating
    await prisma.fightRating.delete({
      where: {
        userId_fightId: {
          userId,
          fightId
        }
      }
    });

    res.json({ message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Delete rating error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Rating not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};