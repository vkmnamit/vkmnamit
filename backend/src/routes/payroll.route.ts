import { Router } from 'express';
import {
  getPayrollHistory, createPayrollEntry, payTeacher,
  getPayrollStructures, createPayrollStructure, updatePayrollStructure, deletePayrollStructure,
  bulkAssignPayroll, assignStructureToTeacher, getStaffForPayroll, notifyMonthlySalaryDue
} from '../controllers/payroll.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Staff list for payroll (admin only)
router.get('/staff', roleGuard('admin'), getStaffForPayroll);

// Assign structure to a teacher (admin only)
router.post('/assign-structure', roleGuard('admin'), assignStructureToTeacher);

// Payroll Structures (admin only)
router.get('/structures', roleGuard('admin'), getPayrollStructures);
router.post('/structures', roleGuard('admin'), createPayrollStructure);
router.put('/structures/:id', roleGuard('admin'), updatePayrollStructure);
router.delete('/structures/:id', roleGuard('admin'), deletePayrollStructure);

// Payroll Assignments
router.post('/bulk-assign', roleGuard('admin'), bulkAssignPayroll);
router.post('/notify-due', roleGuard('admin'), notifyMonthlySalaryDue);

// Payroll entries (admin sees all; teacher sees own — handled in controller)
router.get('/', getPayrollHistory);
router.post('/', roleGuard('admin'), createPayrollEntry);
router.post('/:id/pay', roleGuard('admin'), payTeacher);

export default router;
