import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as financeController from '../controllers/finance.controller';

const router = Router();

// All finance routes require authentication
router.use(authMiddleware);

router.get('/summary', financeController.getFinancialSummary);
router.get('/expenses', financeController.getExpenses);
router.post('/expenses', financeController.createExpense);
router.get('/insights', financeController.getAIInsights);

export default router;
