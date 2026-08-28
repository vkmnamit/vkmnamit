import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import webhooksRouter from './routes/webhooks.route';
import { globalLimiter } from './middleware/rateLimit.middleware';
import { auditLogger } from './middleware/security.middleware';
import { bodyParserWithRouteLimit } from './middleware/bodyLimit.middleware';

// Force server to use IST for all Date and Cron operations
process.env.TZ = 'Asia/Kolkata';

import './services/fees_automation.service';
import './services/assessment_automation.service';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers (helmet) ────────────────────────────────
// TODO (roadmap): Remove 'unsafe-inline' from script-src and use nonce/hash
// instead. This is acceptable for launch but should be hardened as the
// platform grows (see security audit notes).
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:', 'https://res.cloudinary.com'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── Audit logging ────────────────────────────────────────────
app.use(auditLogger);

// ── CORS — explicitly allow only known origins ───────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,kautix.in,www.kautix.in,localhost:3000').split(',').map(s => s.trim());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.endsWith(o))) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    maxAge: 86400,
}));

// ── Global rate limiting (DoS protection) ────────────────────
app.use('/api', globalLimiter);

// ── Body parsing — dynamic limit ─────────────────────────────
// Normal routes: 2mb max. Bulk routes (students/bulk, import-*, etc.): 25mb max.
app.use(bodyParserWithRouteLimit);
app.use(cookieParser());

app.use('/api', router);
app.use('/webhooks', webhooksRouter);

// ── Global error handler (no stack leak) ─────────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload too large' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    console.error('[ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
    const server = app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
    // Allow up to 6 minutes for long-running requests like bulk student import
    server.setTimeout(360_000);
    server.keepAliveTimeout = 360_000;
    server.headersTimeout = 361_000;
}

export default app;
