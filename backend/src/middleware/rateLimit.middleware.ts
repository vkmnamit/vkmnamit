import rateLimit from 'express-rate-limit';

// Global API rate limiter — protects against DoS / brute force
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
});

// Strict limiter for auth endpoints (login, register, forgot/reset password)
// 15/min/IP — high enough for school lab/NAT (50 students on one IP),
// low enough to block brute force.
export const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15, // 15 attempts per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again later.' },
});

// Per-IP hourly limit on registration to prevent spam signups
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 registrations per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many registration attempts. Please try again later.' },
});

// Bulk import / heavy operations limiter — prevents memory abuse
export const bulkOperationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 heavy ops per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many bulk operations. Please wait a moment.' },
});