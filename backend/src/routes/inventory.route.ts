import { Router } from 'express';
import { 
  getInventory, upsertInventoryItem, deleteInventoryItem,
  getCategories, createCategory,
  getTransactions, adjustStock,
  getClassRequirements, setClassRequirement, removeClassRequirement,
  getStudentInventory, issueStudentItem, returnStudentItem, bulkIssueItem,
  getKits, createKit, undoBulkOperation, getAllDistributions, issuePendingItem
} from '../controllers/inventory.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);
router.use(authorize('admin'));

// Categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);

// Items
router.get('/', getInventory);
router.post('/', upsertInventoryItem);
router.delete('/:id', deleteInventoryItem);

// Transactions
router.get('/transactions', getTransactions);
router.post('/adjust', adjustStock);

// Requirements
router.get('/requirements', getClassRequirements);
router.post('/requirements', setClassRequirement);
router.delete('/requirements/:id', removeClassRequirement);

// Student Distribution
router.get('/distribution/all', getAllDistributions);
router.get('/distribution/student/:student_id', getStudentInventory);
router.post('/distribution/student/:student_id/issue', issueStudentItem);
router.post('/distribution/bulk-issue', bulkIssueItem);
router.post('/distribution/bulk-undo/:id', undoBulkOperation);
router.post('/distribution/student/return/:id', returnStudentItem);
router.post('/distribution/issue-pending/:id', issuePendingItem);

// Kits / Bundles
router.get('/kits', getKits);
router.post('/kits', createKit);

export default router;
