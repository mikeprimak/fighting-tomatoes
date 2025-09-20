import { Router } from 'express';
import authRoutes from './auth.routes';
import fightsRoutes from './fights.routes';
import eventsRoutes from './events.routes';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/fights', fightsRoutes);
router.use('/events', eventsRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Fighting Tomatoes API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      fights: '/api/fights',
      events: '/api/events',
    }
  });
});

export default router;