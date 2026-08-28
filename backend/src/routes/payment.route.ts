import express from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';

const router = express.Router();

// Payment routes are now handled via fees.collect (manual/offline payments)
// Razorpay has been removed per requirements.
// Retained as a placeholder router for API compatibility.

export default router;