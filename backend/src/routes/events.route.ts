import express from 'express';
import { getEventsData, upsertEvent, deleteEvent } from '../controllers/events.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getEventsData);
router.post('/', authorize('admin'), upsertEvent);
router.delete('/:id', authorize('admin'), deleteEvent);

export default router;
