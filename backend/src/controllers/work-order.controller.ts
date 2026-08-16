import type { NextFunction, Request, Response } from 'express';
import type { CursorQuery, CreateWorkOrderInput, DeleteWorkOrderInput, UpdateWorkOrderInput } from '@workorders/shared';
import { workOrderService } from '../services/work-order.service.js';
import { actorOf, paramOf } from '../utils/request.js';

export const workOrderController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as CursorQuery;
      const data = await workOrderService.list(actorOf(req), query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.create(actorOf(req), req.body as CreateWorkOrderInput);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.get(actorOf(req), paramOf(req, 'id'));
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await workOrderService.update(actorOf(req), paramOf(req, 'id'), req.body as UpdateWorkOrderInput);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as DeleteWorkOrderInput;
      await workOrderService.remove(actorOf(req), paramOf(req, 'id'), body.version);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
};