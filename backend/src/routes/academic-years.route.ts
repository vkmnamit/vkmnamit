import express from 'express';
import {
  getAcademicYears,
  getCurrentAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  setCurrentAcademicYear,
  generateFeesForYear
} from '../controllers/academic-years.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getAcademicYears);
router.get('/current', getCurrentAcademicYear);
router.post('/', roleGuard('admin'), createAcademicYear);
router.put('/:id', roleGuard('admin'), updateAcademicYear);
router.delete('/:id', roleGuard('admin'), deleteAcademicYear);
router.patch('/:id/set-current', roleGuard('admin'), setCurrentAcademicYear);
router.post('/:id/generate-fees', roleGuard('admin'), generateFeesForYear);

export default router;
