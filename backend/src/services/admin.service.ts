import type { Metrics, OffsetPage, Role, UserAdmin, WorkOrderPublic } from '@workorders/shared';
import { userRepo } from '../repositories/user.repo.js';
import { workOrderRepo, type WorkOrderListQuery } from '../repositories/work-order.repo.js';
import { refreshSessionRepo } from '../repositories/refresh-session.repo.js';
import { toWorkOrderPublicWithOwner } from '../models/work-order.model.js';
import { toUserAdmin } from '../models/user.model.js';
import { assertValidObjectId } from '../utils/object-id.js';
import { forbidden, notFound } from '../utils/http-error.js';

export interface UserListQuery {
  page: number;
  limit: number;
  role?: Role;
  search?: string;
}

export const adminService = {
  async listUsers(query: UserListQuery): Promise<OffsetPage<UserAdmin>> {
    const result = await userRepo.listUsers(query);
    return {
      items: result.items.map(toUserAdmin),
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  },

  async updateRole(adminId: string, targetId: string, role: Role): Promise<UserAdmin> {
    assertValidObjectId(targetId, 'id');
    if (targetId === adminId) throw forbidden('Cannot change your own role');
    const target = await userRepo.findById(targetId);
    if (!target) throw notFound();
    if (target.role === 'admin' && role === 'user') {
      const admins = await userRepo.countAdmins();
      if (admins <= 1) throw forbidden('Cannot demote the last admin');
    }
    const updated = await userRepo.updateRole(targetId, role);
    if (!updated) throw notFound();
    if (target.role === 'admin' && role === 'user') {
      await refreshSessionRepo.revokeForUsers([targetId]);
    }
    return toUserAdmin(updated);
  },

  async updateStatus(adminId: string, targetId: string, isActive: boolean): Promise<UserAdmin> {
    assertValidObjectId(targetId, 'id');
    if (targetId === adminId) throw forbidden('Cannot change your own status');
    const target = await userRepo.findById(targetId);
    if (!target) throw notFound();
    const updated = await userRepo.updateStatus(targetId, isActive);
    if (!updated) throw notFound();
    if (!isActive) {
      await refreshSessionRepo.revokeForUsers([targetId]);
    }
    return toUserAdmin(updated);
  },

  async listWorkOrders(query: WorkOrderListQuery): Promise<{ items: WorkOrderPublic[]; nextCursor: string | null }> {
    const { items, nextCursor } = await workOrderRepo.listAll(query);
    return { items: items.map(toWorkOrderPublicWithOwner), nextCursor };
  },

  async metrics(): Promise<Metrics> {
    const [users, workOrders] = await Promise.all([userRepo.countAll(), workOrderRepo.countAll()]);
    return { users, workOrders, uptimeSeconds: Math.floor(process.uptime()) };
  },
};