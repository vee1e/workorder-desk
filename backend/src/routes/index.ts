import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { profileRoutes } from './profile.routes.js';
import { workOrderRoutes } from './work-order.routes.js';
import { adminRoutes } from './admin.routes.js';
import { agentAdminRoutes } from './agent-admin.routes.js';

export const routes = Router();

routes.use('/auth', authRoutes);
routes.use('/users', profileRoutes);
routes.use('/work-orders', workOrderRoutes);
routes.use('/admin', adminRoutes);
routes.use('/admin/agents', agentAdminRoutes);