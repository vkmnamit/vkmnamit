import express from 'express';
import { createExam, getExams, submitResults, getExamResults, getReportCard, publishResults, unpublishResults, getExamTypes, updateExam, deleteExam, getStudentAnalytics, getStudentsForMarksEntry, notifyPendingMarks, submitExamAnswer, getClassReports } from '../controllers/exam.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { clearCache } from '../middleware/cache.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getExams);
router.get('/types', getExamTypes);
router.get('/marks-entry-students', roleGuard('admin', 'teacher'), getStudentsForMarksEntry);
// Exam lifecycle: teachers can create/update exams for their OWN classes/
// sections/subject (enforced inside the controller); admin can create for all.
router.post('/', roleGuard('admin', 'teacher'), createExam);
router.put('/:id', roleGuard('admin', 'teacher'), updateExam);
router.delete('/:id', roleGuard('admin'), deleteExam);
router.post('/results', roleGuard('admin', 'teacher'), submitResults);
router.get('/results/:examId', getExamResults);
router.get('/report-card/:studentId', getReportCard);
router.get('/class-reports', roleGuard('admin', 'teacher'), getClassReports);
router.get('/analytics/:studentId', getStudentAnalytics);
router.post('/publish', roleGuard('admin', 'teacher'), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, publishResults);
router.post('/unpublish', roleGuard('admin', 'teacher'), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, unpublishResults);
router.post('/notify-pending', roleGuard('admin'), notifyPendingMarks);
router.post('/submit-answer', roleGuard('student'), submitExamAnswer);

export default router;
