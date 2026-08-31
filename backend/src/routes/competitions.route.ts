import express from 'express';
import { getCompetitionsData, upsertCompetition, deleteCompetition } from '../controllers/competitions.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getCompetitionsData);
router.post('/', authorize('admin'), upsertCompetition);
router.delete('/:id', authorize('admin'), deleteCompetition);

export default router;
