import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

interface JwtPayload {
  id: string;
  email: string;
  role: string;
  school_id: string;
  auth_id?: string;
  is_active?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    school_id: string;
    auth_id: string;
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // First try local JWT verification (to avoid spamming Supabase logs with invalid signatures)
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      // Check if user is suspended — fetch from users table
      if (decoded.auth_id || decoded.id) {
        const { data: userData, error: userError } = await supabaseAdmin
          .from('users')
          .select('is_active')
          .eq('id', decoded.id)
          .maybeSingle();
        if (!userError && userData && userData.is_active === false) {
          return res.status(403).json({ error: 'Account has been suspended' });
        }
      }
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        school_id: decoded.school_id,
        auth_id: decoded.auth_id || decoded.id,
      };
      return next();
    } catch (jwtError) {
      // If local verification fails, try Supabase auth (in case it is a direct Supabase token)
      try {
        const { data: { user: supaUser }, error: supaError } = await supabaseAdmin.auth.getUser(token);
        if (supaUser && !supaError) {
          const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, role, school_id, auth_id, is_active')
            .eq('auth_id', supaUser.id)
            .single();

          if (userData && !userError) {
            // Check if user is suspended
            if (userData.is_active === false) {
              return res.status(403).json({ error: 'Account has been suspended' });
            }
            req.user = {
              id: userData.id,
              email: userData.email,
              role: userData.role,
              school_id: userData.school_id || (supaUser.user_metadata as any)?.school_id || (supaUser.user_metadata as any)?.schoolId,
              auth_id: userData.auth_id,
            };
            return next();
          }
        }
      } catch (supaErr) {
        // Ignore Supabase auth API errors
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

export function roleGuard(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Aliases for cleaner route definitions
export const protect = authMiddleware;
export const authorize = roleGuard;
