import express from 'express';
import { getSportsData, upsertTeam, deleteTeam } from '../controllers/sports.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getSportsData);
router.post('/teams', authorize('admin'), upsertTeam);
router.delete('/teams/:id', authorize('admin'), deleteTeam);

export default router;
