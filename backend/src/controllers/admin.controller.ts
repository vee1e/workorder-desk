import type { NextFunction, Request, Response } from 'express';
import type { CursorQuery, OffsetQuery, UpdateRoleInput, UpdateStatusInput } from '@workorders/shared';
import { adminService, type UserListQuery } from '../services/admin.service.js';

export const adminController = {
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as OffsetQuery;
      const data = await adminService.listUsers(query as UserListQuery);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminService.updateRole(req.actor!.id, req.params.id!, (req.body as UpdateRoleInput).role);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminService.updateStatus(req.actor!.id, req.params.id!, (req.body as UpdateStatusInput).isActive);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async listWorkOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminService.listWorkOrders(req.query as unknown as CursorQuery);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async metrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminService.metrics();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};