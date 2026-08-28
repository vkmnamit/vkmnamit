import express from 'express';
import {
  getFeeStructures, createFeeStructure, getFeePayments, collectFee,
  createPaymentOrder, verifyPayment, getFeeStats, sendFeeReminders,
  addExtraFee, syncDues, getFeeTransactions, getFeeReceipt, getAllFeeTransactions,
  bulkAssignFee, generateMonthlyFeesJob, getMonthlyGenerationStatus, adminGenerateFees,
  bulkCollectFee, getGenerationLogs,
  // New endpoints
  getFeeCategories, createFeeCategory, updateFeeCategory, deleteFeeCategory,
  getFeeDiscounts, applyDiscount,
  getFeeFines, addFine, waiveFine, getStudentFeePayments,
  getFeeRefunds, createRefund,
  getFinanceDashboard, getStudentLedger, getMyLedger,
  bulkCreatePastDues,
  getFeeExemptions, addFeeExemption, removeFeeExemption,
  updateFeePayment, deleteFeePayment,
  bulkDeleteFeePayments, bulkEditFeePayments,
  updateFeeStructure, deleteFeeStructure,
  getFeeRegisterCumulative
} from '../controllers/fees.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { validate, collectFeeSchema, createFeeStructureSchema, addExtraFeeSchema } from '../middleware/validation.middleware';

const router = express.Router();

// Public / webhook route (protected by secret key inside controller)
router.post('/cron/monthly', generateMonthlyFeesJob);

router.use(authMiddleware);

// Existing
router.get('/structures', getFeeStructures);
router.post('/structures', roleGuard('admin'), validate(createFeeStructureSchema), createFeeStructure);
router.put('/structures/:id', roleGuard('admin'), updateFeeStructure);
router.delete('/structures/:id', roleGuard('admin'), deleteFeeStructure);
router.get('/monthly-status', roleGuard('admin'), getMonthlyGenerationStatus);
router.get('/payments', getFeePayments);
router.get('/payments/:paymentId/transactions', getFeeTransactions);
router.get('/transactions', roleGuard('admin'), getAllFeeTransactions);
router.post('/collect', roleGuard('admin'), validate(collectFeeSchema), collectFee);
router.post('/bulk-collect', roleGuard('admin'), bulkCollectFee);
router.post('/add-extra', roleGuard('admin'), validate(addExtraFeeSchema), addExtraFee);
router.post('/bulk-assign', roleGuard('admin'), bulkAssignFee);
router.post('/admin-generate', roleGuard('admin'), adminGenerateFees);
router.get('/generation-logs', roleGuard('admin'), getGenerationLogs);
router.post('/bulk-dues', roleGuard('admin'), bulkCreatePastDues);
router.put('/payments/:id', roleGuard('admin'), updateFeePayment);
router.delete('/payments/:id', roleGuard('admin'), deleteFeePayment);
router.post('/bulk-delete', roleGuard('admin'), bulkDeleteFeePayments);
router.post('/bulk-edit', roleGuard('admin'), bulkEditFeePayments);
router.post('/sync-dues', roleGuard('admin'), syncDues);
router.post('/create-order', createPaymentOrder);
router.post('/verify-payment', verifyPayment);
router.get('/stats', getFeeStats);
// Cumulative register: current fees + carried-forward back dues for a year
router.get('/register-cumulative', roleGuard('admin', 'teacher'), getFeeRegisterCumulative);
router.get('/receipt/:id', getFeeReceipt);
router.post('/send-reminders', roleGuard('admin'), sendFeeReminders);

// Finance Dashboard
router.get('/dashboard', getFinanceDashboard);

// Fee Categories
router.get('/categories', getFeeCategories);
router.post('/categories', roleGuard('admin'), createFeeCategory);
router.put('/categories/:id', roleGuard('admin'), updateFeeCategory);
router.delete('/categories/:id', roleGuard('admin'), deleteFeeCategory);

// Discounts
router.get('/discounts', getFeeDiscounts);
router.post('/discounts', roleGuard('admin'), applyDiscount);

// Fines
router.get('/fines', getFeeFines);
router.post('/fines', roleGuard('admin'), addFine);
router.put('/fines/:id/waive', roleGuard('admin'), waiveFine);

// Student pending payments (for linking discounts/fines)
router.get('/student-payments/:studentId', roleGuard('admin'), getStudentFeePayments);

// Refunds
router.get('/refunds', getFeeRefunds);
router.post('/refunds', roleGuard('admin'), createRefund);

// Exemptions
router.get('/exemptions', getFeeExemptions);
router.post('/exemptions', roleGuard('admin'), addFeeExemption);
router.delete('/exemptions/:id', roleGuard('admin'), removeFeeExemption);

// Student Ledger
router.get('/my-ledger', getMyLedger);
router.get('/ledger/:studentId', getStudentLedger);

export default router;
