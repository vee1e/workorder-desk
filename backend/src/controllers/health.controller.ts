import type { Request, Response } from 'express';
import { mongoRepo } from '../repositories/mongo.repo.js';

export const healthController = {
  health(_req: Request, res: Response): void {
    res.status(200).json({ status: 'ok' });
  },

  async ready(_req: Request, res: Response): Promise<void> {
    const ok = await mongoRepo.isReady();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded' });
  },
};