import express from 'express';
import { markAttendance, getAttendance, getAttendanceStats, markHoliday, getHolidays, deleteHoliday } from '../controllers/attendance.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getAttendance);
router.get('/stats', getAttendanceStats);
router.post('/mark', roleGuard('admin', 'teacher'), markAttendance);

// ── Holiday management ──────────────────────────────────────────────────────
router.get('/holidays', getHolidays);
router.post('/holidays', roleGuard('admin'), markHoliday);
router.delete('/holidays/:id', roleGuard('admin'), deleteHoliday);

export default router;
