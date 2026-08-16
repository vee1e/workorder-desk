import { Router } from 'express';
import { changePasswordSchema, updateProfileSchema } from '@workorders/shared';
import { profileController } from '../controllers/profile.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const profileRoutes = Router();

profileRoutes.use(authenticate);

profileRoutes.get('/me', profileController.me);
profileRoutes.patch('/me', validate(updateProfileSchema), profileController.updateName);
profileRoutes.post('/me/password', validate(changePasswordSchema), profileController.changePassword);