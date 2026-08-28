import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as plannerController from '../controllers/planner.controller';

const router = Router();

// Lecture Planner
router.post('/lectures', authMiddleware, plannerController.createLecturePlan);
router.get('/lectures', authMiddleware, plannerController.getLecturePlans);
router.put('/lectures/:id', authMiddleware, plannerController.updateLecturePlan);

// Assessment Planner
router.post('/assessments', authMiddleware, plannerController.createAssessment);
router.get('/assessments', authMiddleware, plannerController.getAssessments);
router.put('/assessments/:id', authMiddleware, plannerController.updateAssessment);

export default router;
