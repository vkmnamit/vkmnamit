import express from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import * as queries from '../controllers/queries.controller';

const router = express.Router();

router.use(authMiddleware);

router.post('/', queries.createQuery);
router.get('/', queries.getQueries);
router.get('/:id', queries.getQueryById);
router.post('/:id/reply', queries.replyToQuery);
router.patch('/:id', roleGuard('admin'), queries.updateQuery);

export default router;
