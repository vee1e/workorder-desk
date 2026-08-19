import { Router } from 'express';
import {
  agentAdminController,
  configPatchSchema,
  runSchema,
  runsQuerySchema,
} from '../controllers/agent-admin.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { validate, validateQuery } from '../middleware/validate.middleware.js';

export const agentAdminRoutes = Router();

agentAdminRoutes.use(authenticate, requireAdmin);

agentAdminRoutes.get('/triage', agentAdminController.getConfig);
agentAdminRoutes.patch('/triage/config', validate(configPatchSchema), agentAdminController.updateConfig);
agentAdminRoutes.post('/triage/run', validate(runSchema), agentAdminController.manualRun);
agentAdminRoutes.post('/disable', agentAdminController.disable);
agentAdminRoutes.get('/runs', validateQuery(runsQuerySchema), agentAdminController.listRuns);
agentAdminRoutes.get('/runs/:id', agentAdminController.runDetail);