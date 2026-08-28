import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as assemblyController from '../controllers/assembly.controller';

const router = Router();

router.post('/', authMiddleware, assemblyController.createAssembly);
router.get('/', authMiddleware, assemblyController.getAssemblies);
router.put('/:id', authMiddleware, assemblyController.updateAssembly);
router.delete('/:id', authMiddleware, assemblyController.deleteAssembly);

export default router;
