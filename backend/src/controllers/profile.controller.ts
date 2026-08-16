import type { NextFunction, Request, Response } from 'express';
import type { ChangePasswordInput, UpdateProfileInput } from '@workorders/shared';
import { profileService } from '../services/profile.service.js';
import { setAuthCookies } from '../utils/cookies.js';
import { actorOf } from '../utils/request.js';

export const profileController = {
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await profileService.me(actorOf(req).id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async updateName(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await profileService.updateName(actorOf(req).id, (req.body as UpdateProfileInput).name);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await profileService.changePassword(
        actorOf(req).id,
        req.body as ChangePasswordInput,
        req.ip,
        req.get('user-agent'),
      );
      setAuthCookies(res, result.tokens);
      res.status(200).json({ success: true, data: result.user });
    } catch (err) {
      next(err);
    }
  },
};