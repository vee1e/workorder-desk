import { Router } from 'express';
import { createWorkOrderSchema, cursorQuerySchema, deleteWorkOrderSchema, updateWorkOrderSchema } from '@workorders/shared';
import { workOrderController } from '../controllers/work-order.controller.js';
import { authenticate, requireWritableUser } from '../middleware/auth.middleware.js';
import { validate, validateQuery } from '../middleware/validate.middleware.js';

export const workOrderRoutes = Router();

workOrderRoutes.use(authenticate);

workOrderRoutes.get('/', validateQuery(cursorQuerySchema), workOrderController.list);
workOrderRoutes.post('/', requireWritableUser, validate(createWorkOrderSchema), workOrderController.create);
workOrderRoutes.get('/:id', workOrderController.get);
workOrderRoutes.patch('/:id', requireWritableUser, validate(updateWorkOrderSchema), workOrderController.update);
workOrderRoutes.delete('/:id', requireWritableUser, validate(deleteWorkOrderSchema), workOrderController.remove);