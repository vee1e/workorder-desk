import type { NextFunction, Request, Response } from 'express';
import type { CursorQuery, CreateWorkOrderInput, DeleteWorkOrderInput, UpdateWorkOrderInput } from '@workorders/shared';
import { workOrderService } from '../services/work-order.service.js';
import { validation } from '../utils/http-error.js';

export const workOrderController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as CursorQuery;
      const data = await workOrderService.list(req.actor!, query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.create(req.actor!, req.body as CreateWorkOrderInput);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.get(req.actor!, req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.update(req.actor!, req.params.id!, req.body as UpdateWorkOrderInput);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as DeleteWorkOrderInput;
      if (typeof body?.version !== 'number') throw validation([{ field: 'version', message: 'version is required' }]);
      await workOrderService.remove(req.actor!, req.params.id!, body.version);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
};