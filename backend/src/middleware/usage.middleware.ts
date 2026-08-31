import { NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

// Student enrollment is intentionally unlimited. This middleware is retained
// as a compatibility hook for routes that import it, but must never enforce a
// subscription cap or block an admission/bulk import.
export function checkStudentLimit(_req: AuthenticatedRequest, _res: unknown, next: NextFunction) {
  next();
}
