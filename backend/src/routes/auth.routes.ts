import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@workorders/shared';
import { authController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { forgotLimiter, loginLimiter, registerLimiter } from '../middleware/rate-limit.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

export const authRoutes = Router();

authRoutes.post('/register', registerLimiter, validate(registerSchema), authController.register);
authRoutes.post('/login', loginLimiter, validate(loginSchema), authController.login);
authRoutes.post('/logout', authController.logout);
authRoutes.post('/logout-all', authenticate, authController.logoutAll);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
authRoutes.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);