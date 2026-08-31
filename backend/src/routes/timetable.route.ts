import express from 'express';
import { getTimetable, generateAITimetable, createSlot, updateSlot, deleteSlot, getSubjects, createSubject, deleteSubject, addSubjectToClass, removeSubjectFromClass, publishTimetable, seedDefaultSubjects } from '../controllers/timetable.controller';
import { protect, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getTimetable);
router.get('/subjects', getSubjects);
router.post('/generate-ai', roleGuard('admin', 'teacher'), generateAITimetable);
// Admin-only slot management
router.post('/slot', roleGuard('admin'), createSlot);
router.put('/slot/:id', roleGuard('admin'), updateSlot);
router.delete('/slot/:id', roleGuard('admin'), deleteSlot);

// Subject management (admin only)
router.post('/subjects', roleGuard('admin'), createSubject);
router.post('/subjects/seed-defaults', roleGuard('admin'), seedDefaultSubjects);
router.delete('/subjects/:id', roleGuard('admin'), deleteSubject);
router.post('/class-subjects', roleGuard('admin'), addSubjectToClass);
router.delete('/class-subjects/:classSubjectId', roleGuard('admin'), removeSubjectFromClass);
router.post('/publish', roleGuard('admin'), publishTimetable);

export default router;
