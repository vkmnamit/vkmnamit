import express from 'express';
import {
  getTeachers,
  getTeacherDashboard,
  getTeacherById,
  createTeacher,
  updateTeacher,
  getLeaveRequests,
  submitLeaveRequest,
  processLeaveRequest,
  bulkCreateTeachers,
  processTeacherPayout,
  getTeacherSections
} from '../controllers/teacher.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getTeachers);
router.get('/dashboard', roleGuard('teacher'), getTeacherDashboard);
router.get('/my-sections', roleGuard('teacher'), getTeacherSections);
router.post('/payout', roleGuard('admin'), processTeacherPayout);
router.get('/leaves', getLeaveRequests);
router.post('/leaves', roleGuard('teacher'), submitLeaveRequest);
router.put('/leaves/:id', roleGuard('admin'), processLeaveRequest);

router.get('/:id', getTeacherById);
router.post('/', roleGuard('admin'), createTeacher);
router.put('/:id', roleGuard('admin'), updateTeacher);
router.post('/bulk', roleGuard('admin'), bulkCreateTeachers);

export default router;

