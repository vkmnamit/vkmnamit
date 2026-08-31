import { Request, Response, NextFunction } from 'express';

// Audit logging middleware — logs auth events, admin actions
export function auditLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const method = req.method;
        const path = req.originalUrl || req.url;
        const status = res.statusCode;

        // Never log request bodies, headers, tokens, passwords, or OTPs.
        // Only log method, path, status, duration, and IP (for audit).
        if (status === 401 || status === 403) {
            console.warn(`[AUDIT] ${method} ${path} -> ${status} (${duration}ms) IP:${req.ip}`);
        } else if (path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/forgot')) {
            console.log(`[AUDIT] ${method} ${path} -> ${status} (${duration}ms) IP:${req.ip}`);
        }

        if (/admin|import|delete|payroll|automation/.test(path) && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            console.log(`[AUDIT][ADMIN] ${method} ${path} -> ${status} (${duration}ms) IP:${req.ip}`);
        }
    });

    next();
}

// No-cache header middleware for sensitive endpoints
export function noStore(req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
}