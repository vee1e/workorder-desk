import { Router } from 'express';
import { cursorQuerySchema, offsetQuerySchema, updateRoleSchema, updateStatusSchema } from '@workorders/shared';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate, requireAdmin, requireAdminOrViewer } from '../middleware/auth.middleware.js';
import { validate, validateQuery } from '../middleware/validate.middleware.js';

export const adminRoutes = Router();

adminRoutes.use(authenticate);

adminRoutes.get('/work-orders', requireAdminOrViewer, validateQuery(cursorQuerySchema), adminController.listWorkOrders);

adminRoutes.use(requireAdmin);

adminRoutes.get('/users', validateQuery(offsetQuerySchema), adminController.listUsers);
adminRoutes.patch('/users/:id/role', validate(updateRoleSchema), adminController.updateRole);
adminRoutes.patch('/users/:id/status', validate(updateStatusSchema), adminController.updateStatus);
adminRoutes.get('/metrics', adminController.metrics);