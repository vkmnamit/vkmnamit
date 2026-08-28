import express from 'express';
import { register, login, getMe, createUser, resendCredentials, updateUserStatus, deleteUser, forgotPassword, resetPasswordWithOtp } from '../controllers/auth.controller';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { authLimiter, registrationLimiter } from '../middleware/rateLimit.middleware';
import { validate, loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, createUserSchema, resendCredentialsSchema, updateUserStatusSchema } from '../middleware/validation.middleware';

const router = express.Router();

// Public auth endpoints — protected with rate limiting + input validation
router.post('/register', registrationLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password-otp', authLimiter, validate(resetPasswordSchema), resetPasswordWithOtp);

// Authenticated endpoints
router.get('/me', authMiddleware, getMe);
router.post('/create-user', authMiddleware, roleGuard('admin'), validate(createUserSchema), createUser);
router.post('/resend-credentials', authMiddleware, roleGuard('admin'), validate(resendCredentialsSchema), resendCredentials);
router.post('/update-status', authMiddleware, roleGuard('admin'), validate(updateUserStatusSchema), updateUserStatus);
router.delete('/:id', authMiddleware, roleGuard('admin'), deleteUser);

export default router;