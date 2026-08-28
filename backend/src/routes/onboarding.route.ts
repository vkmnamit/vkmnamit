import { Router } from 'express';
import * as onboardingController from '../controllers/onboarding.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = Router();

// Only super admins can trigger the full setup
router.post('/setup', authMiddleware, roleGuard('super_admin'), onboardingController.setupSchoolData);

export default router;
