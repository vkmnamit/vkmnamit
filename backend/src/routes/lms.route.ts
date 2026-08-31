import express from 'express';
import { getLMSData, deleteLMSCourse, submitAssignmentResults, publishAssignmentResults, getAssignmentSubmissions, toggleAssignmentStatus } from '../controllers/lms.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getLMSData);
router.delete('/courses/:id', authorize('admin'), deleteLMSCourse);

router.get('/assignments/:id/submissions', authorize('admin', 'teacher'), getAssignmentSubmissions);
router.post('/assignments/results', authorize('admin', 'teacher'), submitAssignmentResults);
router.post('/assignments/publish', authorize('admin', 'teacher'), publishAssignmentResults);
router.post('/assignments/toggle', toggleAssignmentStatus);

export default router;
