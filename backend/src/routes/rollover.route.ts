import { Router } from 'express';
import * as rolloverController from '../controllers/rollover.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { bulkOperationLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// All rollover routes require admin
const adminOnly = [authMiddleware, roleGuard('admin')];

// Get preview of what the rollover will do
router.get('/preview', ...adminOnly, rolloverController.getRolloverPreview);

// Execute the rollover (promote students, copy fees, copy transport)
router.post('/execute', ...adminOnly, bulkOperationLimiter, rolloverController.executeRollover);

// Revert a rollover
router.post('/:rolloverId/revert', ...adminOnly, bulkOperationLimiter, rolloverController.revertRollover);

// Get rollover history
router.get('/logs', ...adminOnly, rolloverController.getRolloverLogs);

// Get rollover status (for polling background job)
router.get('/logs/:rolloverId', ...adminOnly, rolloverController.getRolloverStatus);

// Mark students as repeating (stay in same class)
router.post('/mark-repeating', ...adminOnly, rolloverController.markStudentsRepeating);

export default router;