import { Router } from 'express';
import { getEvents, getEventById, getEventEngagement } from '../controllers/events.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getEvents);
router.get('/:id', getEventById);

// Protected routes
router.get('/:id/engagement', authenticateToken, getEventEngagement);

export default router;