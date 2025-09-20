import { Router } from 'express';
import { 
  register, 
  login, 
  logout, 
  refreshToken, 
  getProfile 
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

// Protected routes
router.get('/profile', authenticateToken, getProfile);

export default router;