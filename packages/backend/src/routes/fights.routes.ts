import { Router } from 'express';
import { 
  getFights, 
  getFightById, 
  rateFight, 
  updateFightRating, 
  deleteFightRating 
} from '../controllers/fights.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getFights);
router.get('/:id', getFightById);

// Protected routes (require authentication)
router.post('/:id/rate', authenticateToken, rateFight);
router.put('/:id/rate', authenticateToken, updateFightRating);
router.delete('/:id/rate', authenticateToken, deleteFightRating);

export default router;