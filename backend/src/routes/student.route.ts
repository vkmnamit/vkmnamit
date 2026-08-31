import express from 'express';
import {
  getStudents,
  getHistoricalStudents,
  getStudentById,
  createStudent,
  updateStudent,
  promoteStudents,
  bulkCreateStudents,
  getTeacherStudents,
  getStudentDashboard,
  getAIPerformanceSummary,
  deleteStudent,
  getStudentResults,
  getStudentExamReports
} from '../controllers/student.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { cacheGet, clearCache } from '../middleware/cache.middleware';
import { validate, createStudentSchema, updateStudentSchema, bulkCreateStudentsSchema } from '../middleware/validation.middleware';

const router = express.Router();

router.use(authMiddleware);

// Static routes should come before dynamic :id routes
router.get('/dashboard/:id?', cacheGet(60), getStudentDashboard);
router.get('/performance-summary/:id?', cacheGet(300), getAIPerformanceSummary);
router.get('/my-students', roleGuard('teacher'), getTeacherStudents);
router.get('/results/:id?', getStudentResults);
router.get('/exam-reports/:id?', getStudentExamReports);
router.get('/', cacheGet(60), getStudents);
// Historical class roster for a past academic year (must come before /:id)
router.get('/historical', roleGuard('admin', 'teacher'), getHistoricalStudents);
// Don't cache individual student details - must be fresh after updates
router.get('/:id', getStudentById);

router.post('/', roleGuard('admin', 'teacher'), validate(createStudentSchema), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, createStudent);
router.post('/bulk', roleGuard('admin'), validate(bulkCreateStudentsSchema), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, bulkCreateStudents);
router.put('/:id', roleGuard('admin', 'teacher'), validate(updateStudentSchema), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, updateStudent);
router.delete('/:id', roleGuard('admin'), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, deleteStudent);
router.post('/promote', roleGuard('admin'), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, promoteStudents);
router.post('/promote/:id', roleGuard('admin'), (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, promoteStudents);


//assigment routes
router.post('/:id/assignments', roleGuard('teacher', 'admin'), (req, res) => {

  res.json({ message: `Create assignment for student ${req.params.id}` });
});

router.get('/:id/assignments', roleGuard('teacher', 'student', 'admin'), (req, res) => {
  // Placeholder for getting assignments for a student
  res.json({ message: `Get assignments for student ${req.params.id}` });
});
router.put('/:id/assignments/:assignmentId', roleGuard('teacher', 'admin'), (req, res) => {
  // Placeholder for updating an assignment for a student
  res.json({ message: `Update assignment ${req.params.assignmentId} for student ${req.params.id}` });
});

export default router;
