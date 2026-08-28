import { Router } from 'express';
import * as integrationsController from '../controllers/integrations.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// OAuth Connect Flow
router.get('/whatsapp/connect', authMiddleware, integrationsController.connectWhatsApp);
router.get('/whatsapp/callback', integrationsController.whatsappCallback);

// Frontend Status Check
router.get('/whatsapp/status', authMiddleware, integrationsController.getWhatsAppStatus);
router.post('/whatsapp/update-ids', authMiddleware, integrationsController.updateWhatsAppIds);

export default router;
