import express from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import * as transport from '../controllers/transport.controller';
import * as library from '../controllers/library.controller';
import * as lms from '../controllers/lms.controller';
import * as finance from '../controllers/finance_v2.controller';

const router = express.Router();

router.use(authMiddleware);

// ── Transport Routes
router.get('/transport/vehicles', transport.getVehicles);
router.post('/transport/vehicles', roleGuard('admin'), transport.createVehicle);
router.get('/transport/routes', transport.getRoutes);
router.post('/transport/routes', roleGuard('admin'), transport.createRoute);
router.post('/transport/assign', roleGuard('admin', 'teacher'), transport.assignStudentToRoute);

// ── Library Routes
router.get('/library/books', library.getBooks);
router.post('/library/books', roleGuard('admin', 'teacher'), library.addBooks);
router.post('/library/issue', roleGuard('admin', 'teacher'), library.issueBook);
router.post('/library/return', roleGuard('admin', 'teacher'), library.returnBook);

// ── LMS & Document Vault
router.get('/lms', lms.getLMSData);
router.post('/lms/submit', lms.submitAssignment);
router.post('/lms/grade', roleGuard('admin', 'teacher'), lms.gradeSubmission);
router.delete('/lms/course/:id', roleGuard('admin'), lms.deleteLMSCourse);
router.post('/vault/upload', lms.uploadDocument);
router.get('/vault/:userId', lms.getUserDocuments);
router.post('/lms/upload', roleGuard('admin', 'teacher'), lms.uploadAssignmentFile);
router.post('/lms/submissions/upload', roleGuard('student'), lms.uploadSubmissionFile);
router.post('/lms/assignments', roleGuard('admin', 'teacher'), lms.createAssignment);
router.get('/lms/assignments', lms.getAssignments);
router.put('/lms/assignments/:id', roleGuard('admin', 'teacher'), lms.updateAssignment);
router.delete('/lms/assignments/:id', roleGuard('admin', 'teacher'), lms.deleteAssignment);
router.post('/lms/assignments/toggle', roleGuard('admin', 'teacher', 'student'), lms.toggleAssignmentStatus);
router.get('/lms/assignments/:id/submissions', roleGuard('admin', 'teacher'), lms.getAssignmentSubmissions);
// ── Granular Finance
router.get('/finance/heads', finance.getFeeHeads);
router.post('/finance/heads', roleGuard('admin'), finance.createFeeHead);
router.get('/finance/structure/:structureId/components', finance.getStructureComponents);
router.post('/finance/structure/component', roleGuard('admin'), finance.addComponentToStructure);

export default router;
