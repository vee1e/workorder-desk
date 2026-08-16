import type { Request, Response } from 'express';
import mongoose from 'mongoose';

export const healthController = {
  health(_req: Request, res: Response): void {
    res.status(200).json({ status: 'ok' });
  },

  async ready(_req: Request, res: Response): Promise<void> {
    let ok = false;
    try {
      if (mongoose.connection.readyState === 1) {
        ok = true;
      } else if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
        ok = true;
      }
    } catch {
      ok = false;
    }
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded' });
  },
};