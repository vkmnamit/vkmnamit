import { Router } from 'express';
import {
  getRoutes, getLiveTracking, getBusAbsentees, updateLocation,
  getTransportDashboard, deleteTransportRoute,
  createRoute, updateRoute,
  getRouteStudents, getUnassignedStudents, bulkAssignStudentsToRoute,
  assignStudentToRoute
} from '../controllers/transport.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

router.get('/dashboard', getTransportDashboard);
router.get('/routes', getRoutes);
router.post('/routes', authorize('admin'), createRoute);
router.put('/routes/:id', authorize('admin'), updateRoute);
router.delete('/routes/:id', authorize('admin'), deleteTransportRoute);
router.get('/routes/:id/students', getRouteStudents);
router.get('/students/unassigned', getUnassignedStudents);
router.post('/students/bulk-assign', authorize('admin'), bulkAssignStudentsToRoute);
router.post('/assign-student', authorize('admin'), assignStudentToRoute);
router.get('/live/:route_id', getLiveTracking);
router.get('/absentees/:route_id', getBusAbsentees);
router.post('/update-location', updateLocation);

export default router;
