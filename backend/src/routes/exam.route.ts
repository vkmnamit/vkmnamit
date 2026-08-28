import express from 'express';
import { createExam, getExams, submitResults, getExamResults, getReportCard, publishResults, getExamTypes, updateExam, deleteExam, getStudentAnalytics, getStudentsForMarksEntry, notifyPendingMarks } from '../controllers/exam.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getExams);
router.get('/types', getExamTypes);
router.get('/marks-entry-students', roleGuard('admin', 'teacher'), getStudentsForMarksEntry);
// Exam lifecycle (create/update/delete) is ADMIN-only — teachers enter marks & view results.
router.post('/', roleGuard('admin'), createExam);
router.put('/:id', roleGuard('admin'), updateExam);
router.delete('/:id', roleGuard('admin'), deleteExam);
router.post('/results', roleGuard('admin', 'teacher'), submitResults);
router.get('/results/:examId', getExamResults);
router.get('/report-card/:studentId', getReportCard);
router.get('/analytics/:studentId', getStudentAnalytics);
router.post('/publish', roleGuard('admin', 'teacher'), publishResults);
router.post('/notify-pending', roleGuard('admin'), notifyPendingMarks);

export default router;
