import { Router } from 'express';
import { getEvents, getEventById } from '../controllers/events.controller';

const router = Router();

// Public routes
router.get('/', getEvents);
router.get('/:id', getEventById);

export default router;