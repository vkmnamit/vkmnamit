import express from 'express';
import { getCanteenData, createOrder } from '../controllers/canteen.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getCanteenData);
router.post('/orders', createOrder);

export default router;
