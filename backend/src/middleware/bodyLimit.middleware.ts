import express from 'express';
import { Request, Response, NextFunction } from 'express';

// URLs that legitimately need to accept large payloads (bulk imports, fee generation)
const BULK_URL_PATTERNS: RegExp[] = [
    /\/students\/bulk$/,
    /\/admin\/import-(students|teachers|fee-structures)/,
    /\/admin\/promote-students/,
    /\/fees\/bulk-(collect|assign|delete|edit|dues)/,
    /\/fees\/admin-generate/,
    /\/fees\/bulk-dues/,
    /\/transport\/students\/bulk-assign/,
    /\/inventory\/distribution\/bulk-issue/,
    /\/exam-papers\/upload/,
    /\/ops\/lms\/upload/,
];

const LARGE_LIMIT = '25mb'; // Bulk imports: up to 25MB (thousands of rows)
const DEFAULT_LIMIT = '2mb'; // Everything else

export function bodyParserWithRouteLimit(req: Request, res: Response, next: NextFunction) {
    const isBulk = BULK_URL_PATTERNS.some(pattern => pattern.test(req.path));
    const limit = isBulk ? LARGE_LIMIT : DEFAULT_LIMIT;
    express.json({ limit })(req, res, next);
}