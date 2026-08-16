import type { NextFunction, Request, Response } from 'express';
import { REFRESH_COOKIE } from '@workorders/shared';
import { authService } from '../services/auth.service.js';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import { unauthorized } from '../utils/http-error.js';

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      setAuthCookies(res, result.tokens);
      res.status(201).json({ success: true, data: result.user });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body, req.ip, req.get('user-agent'));
      setAuthCookies(res, result.tokens);
      res.status(200).json({ success: true, data: result.user });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.signedCookies?.[REFRESH_COOKIE];
      if (req.actor && req.sessionId) {
        await authService.logout(req.actor.id, req.sessionId, refreshToken);
      } else if (typeof refreshToken === 'string' && refreshToken) {
        await authService.logoutByRefreshToken(refreshToken);
      }
      clearAuthCookies(res);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.actor) await authService.logoutAll(req.actor.id);
      clearAuthCookies(res);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.signedCookies?.[REFRESH_COOKIE];
      if (typeof token !== 'string' || !token) throw unauthorized();
      const result = await authService.refresh(token, req.ip, req.get('user-agent'));
      setAuthCookies(res, result.tokens);
      res.status(200).json({ success: true, data: result.user });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await authService.forgotPassword(req.body.email);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.resetPassword(req.body, req.ip, req.get('user-agent'));
      setAuthCookies(res, result.tokens);
      res.status(200).json({ success: true, data: result.user });
    } catch (err) {
      next(err);
    }
  },
};