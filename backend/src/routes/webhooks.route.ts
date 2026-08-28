import { Router } from 'express';
import * as integrationsController from '../controllers/integrations.controller';

const router = Router();

// Webhook for WhatsApp incoming messages/status updates
router.get('/whatsapp', integrationsController.verifyWebhook);
router.post('/whatsapp', integrationsController.handleWebhookEvent);

export default router;
