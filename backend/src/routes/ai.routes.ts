import { Router } from 'express';
import { z } from 'zod';
import { sendCopilotMessageSchema } from '@workorders/shared';
import { aiController } from '../controllers/ai.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.middleware.js';
import { aiLimiter, requireAIAvailable } from '../middleware/ai.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const approveSchema = z.object({ approve: z.boolean() }).strict();

export const aiRoutes = Router();

aiRoutes.use(authenticate, requireAuth, requireAIAvailable, aiLimiter);

aiRoutes.post('/sessions', aiController.createSession);
aiRoutes.get('/sessions', aiController.sessions);
aiRoutes.post('/sessions/:id/messages', validate(sendCopilotMessageSchema), aiController.messages);
aiRoutes.post('/tool-calls/:id/decide', validate(approveSchema), aiController.decide);
