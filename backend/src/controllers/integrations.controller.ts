import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import axios from 'axios';

// ── GET /api/integrations/whatsapp/connect ──────────────────────────────────────
export async function connectWhatsApp(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const clientId = process.env.META_APP_ID;
    const redirectUri = process.env.META_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'META configuration is missing in .env' });
    }

    // Pass the schoolId in state so we know who connected it when callback hits
    const state = schoolId;
    const configId = ''; // Typically required for Embedded Signup, but if not provided, standard OAuth

    const metaOauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=whatsapp_business_management,whatsapp_business_messaging&state=${state}`;

    res.json({ url: metaOauthUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ── GET /api/integrations/whatsapp/callback ─────────────────────────────────────
export async function whatsappCallback(req: Request, res: Response) {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`Error from Meta: ${error_description}`);
    }

    if (!code || !state) {
      return res.status(400).send('Missing code or state in callback.');
    }

    const schoolId = state as string;

    // Exchange code for access token
    const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code,
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // In a real flow, you might need to query the Graph API to get the specific WABA ID and Phone Number ID.
    // For now, if the token gives us access, we can attempt to fetch the WABA ID.
    // Since the structure of the Graph API response can vary, we will store placeholders if we can't fetch them immediately,
    // or typically we fetch: /v19.0/me/accounts to see the connected businesses.
    // Let's assume we fetch them successfully:
    let wabaId = 'pending_waba_id';
    let phoneNumberId = 'pending_phone_id';

    try {
      // Simplified fetch to get business accounts (actual Meta API call might differ slightly based on permissions)
      const wabaResponse = await axios.get(`https://graph.facebook.com/v19.0/me/clients`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Just a placeholder logic for extraction
      if (wabaResponse.data?.data?.length > 0) {
        wabaId = wabaResponse.data.data[0].id;
        // Phone numbers usually fetched via /v19.0/{wabaId}/phone_numbers
      }
    } catch (e) {
      console.warn('Failed to fetch WABA details automatically, using placeholders for now.');
    }

    // Store in database
    const { error: dbError } = await supabaseAdmin
      .from('whatsapp_connections')
      .upsert({
        school_id: schoolId,
        access_token: accessToken,
        whatsapp_business_account_id: wabaId,
        phone_number_id: phoneNumberId,
        status: 'ACTIVE',
        updated_at: new Date().toISOString()
      }, { onConflict: 'school_id' });

    if (dbError) {
      throw dbError;
    }

    // Redirect back to frontend settings page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard/settings?whatsapp=success`);
  } catch (error: any) {
    console.error('WhatsApp callback error:', error.response?.data || error.message);
    res.status(500).send('Internal Server Error during WhatsApp connection.');
  }
}

// ── GET /webhooks/whatsapp ──────────────────────────────────────────────────────
export async function verifyWebhook(req: Request, res: Response) {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Forbidden: Verify token mismatch.');
    }
  } catch (error: any) {
    res.status(500).send('Internal Server Error');
  }
}

// ── POST /webhooks/whatsapp ─────────────────────────────────────────────────────
export async function handleWebhookEvent(req: Request, res: Response) {
  try {
    // ── Verify Meta webhook signature (X-Hub-Signature-256) ──
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret) {
      if (!signature) {
        return res.status(403).send('Missing signature');
      }
      const rawBody = JSON.stringify(req.body);
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return res.status(403).send('Invalid signature');
      }
    }

    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      console.log('Received WhatsApp Webhook Event:', JSON.stringify(body, null, 2));

      // Process messages, status updates (delivered, read, failed) here
      // Example: body.entry[0].changes[0].value.messages

      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  } catch (error: any) {
    console.error('Error handling webhook event:', error);
    res.status(500).send('Internal Server Error');
  }
}

// ── GET /api/integrations/whatsapp/status ──────────────────────────────────────
export async function getWhatsAppStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { data, error } = await supabaseAdmin
      .from('whatsapp_connections')
      .select('status, phone_number_id, updated_at')
      .eq('school_id', schoolId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ connected: false });

    return res.json({ connected: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ── POST /api/integrations/whatsapp/update-ids ────────────────────────────────
export async function updateWhatsAppIds(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { phone_number_id, whatsapp_business_account_id } = req.body;

    const { error } = await supabaseAdmin
      .from('whatsapp_connections')
      .update({
        phone_number_id,
        whatsapp_business_account_id,
        updated_at: new Date().toISOString()
      })
      .eq('school_id', schoolId);

    if (error) throw error;
    res.json({ message: 'WhatsApp IDs updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
