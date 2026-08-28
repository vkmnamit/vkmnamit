import { Router } from 'express';
import { publicController } from '../controllers/public.controller';

const router = Router();

// Route for getting public landing page data (stats and gallery)
router.get('/landing-data', publicController.getLandingData);

export default router;
