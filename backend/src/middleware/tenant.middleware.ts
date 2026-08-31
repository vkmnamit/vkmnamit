import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Middleware to verify that the school has an active subscription
 */
export async function subscriptionGuard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !req.user.school_id) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .select('subscription_plan, is_active')
      .eq('id', req.user.school_id)
      .single();

    if (error || !school) {
      return res.status(404).json({ error: 'School not found' });
    }

    if (!school.is_active) {
      return res.status(403).json({ error: 'School account is deactivated' });
    }

    // Check if subscription has expired (optional: requires a subscription_end_date column)
    // If you add one, you can check it here. For now, we trust is_active.

    // Attach plan to request for feature flagging
    (req as any).subscriptionPlan = school.subscription_plan;
    
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal tenant verification error' });
  }
}

/**
 * Middleware to check for specific plan requirements
 */
export function planGuard(requiredPlan: 'basic' | 'pro' | 'enterprise') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const currentPlan = (req as any).subscriptionPlan || 'free';
    
    const plans = ['free', 'basic', 'pro', 'enterprise'];
    if (plans.indexOf(currentPlan) < plans.indexOf(requiredPlan)) {
      return res.status(403).json({ 
        error: `This feature requires a ${requiredPlan} plan. Your current plan is ${currentPlan}.` 
      });
    }
    
    next();
  };
}
