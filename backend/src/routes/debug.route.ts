import express from 'express';
import webpush from 'web-push';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';

const router = express.Router();

const hasVapidKeys = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (hasVapidKeys) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

router.post('/push', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
        if (!hasVapidKeys) {
            return res.status(500).json({
                error: 'VAPID keys are not configured',
                details: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in the backend env.',
            });
        }

        const schoolId = req.user!.school_id;
        const userId = req.user!.id;

        const { data: subscriptions, error: fetchError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth, expiration_time, created_at')
            .eq('school_id', schoolId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (fetchError) {
            return res.status(500).json({
                error: 'Failed to load push subscriptions',
                details: fetchError.message,
            });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return res.status(404).json({
                error: 'No push subscription found for current user',
                details: 'Open the app in a browser that has allowed notifications and logged in as this user, then refresh the page to create a subscription.',
            });
        }

        const subscriptionRow = subscriptions[0];
        const pushPayload = JSON.stringify({
            title: 'Kautix',
            body: 'Browser Push Working!',
            url: '/communication',
            type: 'debug_push',
        });

        try {
            const response = await webpush.sendNotification(
                {
                    endpoint: subscriptionRow.endpoint,
                    expirationTime: subscriptionRow.expiration_time ?? null,
                    keys: {
                        p256dh: subscriptionRow.p256dh,
                        auth: subscriptionRow.auth,
                    },
                },
                pushPayload,
            );

            return res.json({
                success: true,
                message: 'Test push sent successfully',
                endpoint: subscriptionRow.endpoint,
                responseStatusCode: response?.statusCode ?? null,
                responseBody: response?.body ?? null,
            });
        } catch (pushError: any) {
            const statusCode = pushError?.statusCode ?? null;
            const body = pushError?.body ?? null;

            if (statusCode === 404 || statusCode === 410) {
                await supabaseAdmin
                    .from('push_subscriptions')
                    .delete()
                    .eq('school_id', schoolId)
                    .eq('user_id', userId)
                    .eq('endpoint', subscriptionRow.endpoint);
            }

            return res.status(500).json({
                error: 'Push delivery failed',
                details: pushError?.message || String(pushError),
                statusCode,
                body,
                endpoint: subscriptionRow.endpoint,
            });
        }
    } catch (err: any) {
        return res.status(500).json({
            error: 'Unexpected debug push failure',
            details: err.message || String(err),
        });
    }
});

export default router;