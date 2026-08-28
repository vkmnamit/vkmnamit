import express from 'express';
import {
  getParents,
  getParentById,
  updateParent,
  getMyChildren,
  getChildAttendance,
  getChildFees,
  getChildResults,
  getNotifications,
  sendMessage,
  getMessages,
  getParentDashboard
} from '../controllers/parents.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

// Parent routes
router.get('/dashboard', roleGuard('parent'), getParentDashboard);
router.get('/children', roleGuard('parent'), getMyChildren);
router.get('/children/:studentId/attendance', roleGuard('parent'), getChildAttendance);
router.get('/children/:studentId/fees', roleGuard('parent'), getChildFees);
router.get('/children/:studentId/results', roleGuard('parent'), getChildResults);
router.get('/notifications', getNotifications);
router.post('/messages', sendMessage);
router.get('/messages', getMessages);

// Admin routes (Dynamic routes must be at the bottom)
router.get('/', roleGuard('admin'), getParents);
router.get('/:id', roleGuard('admin'), getParentById);
router.put('/:id', roleGuard('admin'), updateParent);


export default router;
