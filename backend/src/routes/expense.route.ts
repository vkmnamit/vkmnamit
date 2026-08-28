import express from 'express';
import { getExpenses, createExpense, getFinancialSummary } from '../controllers/expense.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', roleGuard('admin'), getExpenses);
router.post('/', roleGuard('admin'), createExpense);
router.get('/summary', roleGuard('admin'), getFinancialSummary);

export default router;
