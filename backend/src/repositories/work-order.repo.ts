import type { WorkOrderPriority, WorkOrderStatus } from '@workorders/shared';
import { WorkOrder, type WorkOrderDoc } from '../models/work-order.model.js';
import { signCursor, verifyCursor, type CursorPayload } from '../utils/cursor.js';
import { validation } from '../utils/http-error.js';

function parseCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  const payload = verifyCursor(cursor);
  if (!payload) {
    throw validation([{ field: 'cursor', message: 'Invalid cursor' }]);
  }
  return payload;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface WorkOrderListQuery {
  cursor?: string;
  limit: number;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  search?: string;
}

export interface WorkOrderListResult {
  items: WorkOrderDoc[];
  nextCursor: string | null;
}

function buildFilter(input: WorkOrderListQuery & { ownerId?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.ownerId) {
    filter.owner = input.ownerId;
  }
  if (input.status) {
    filter.status = input.status;
  }
  if (input.priority) {
    filter.priority = input.priority;
  }
  if (input.search) {
    filter.title = new RegExp(escapeRegex(input.search), 'i');
  }
  return filter;
}

async function listPage(
  filter: Record<string, unknown>,
  cursor: CursorPayload | null,
  limit: number,
): Promise<WorkOrderListResult> {
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), _id: { $lt: cursor.id } },
    ];
  }
  const docs = await WorkOrder.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('owner', 'name email')
    .lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const last = page[page.length - 1];
  const nextCursor = last && hasMore ? signCursor({ createdAt: last.createdAt.toISOString(), id: last._id.toString() }) : null;
  return { items: page, nextCursor };
}

export const workOrderRepo = {
  async create(input: {
    ownerId: string;
    title: string;
    description?: string | null;
    priority: WorkOrderPriority;
    status: WorkOrderStatus;
  }): Promise<WorkOrderDoc> {
    return WorkOrder.create({
      owner: input.ownerId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      status: input.status,
      version: 1,
    });
  },

  async findById(id: string): Promise<WorkOrderDoc | null> {
    return WorkOrder.findOne({ _id: id, deletedAt: null }).populate('owner', 'name email').lean();
  },

  async findByIdIncludingDeleted(id: string): Promise<WorkOrderDoc | null> {
    return WorkOrder.findById(id).populate('owner', 'name email').lean();
  },

  async listByOwner(input: WorkOrderListQuery & { ownerId: string }): Promise<WorkOrderListResult> {
    const cursor = parseCursor(input.cursor);
    return listPage(buildFilter(input), cursor, input.limit);
  },

  async listAll(input: WorkOrderListQuery): Promise<WorkOrderListResult> {
    const cursor = parseCursor(input.cursor);
    return listPage(buildFilter(input), cursor, input.limit);
  },

  async updateIfVersion(input: {
    id: string;
    ownerId?: string;
    version: number;
    patch: Partial<Pick<WorkOrderDoc, 'title' | 'description' | 'priority' | 'status'>>;
  }): Promise<WorkOrderDoc | null> {
    const predicate: Record<string, unknown> = { _id: input.id, version: input.version, deletedAt: null };
    if (input.ownerId) {
      predicate.owner = input.ownerId;
    }
    return WorkOrder.findOneAndUpdate(predicate, { $set: input.patch, $inc: { version: 1 } }, { new: true })
      .populate('owner', 'name email')
      .lean();
  },

  async softDelete(input: { id: string; ownerId?: string; version: number }): Promise<WorkOrderDoc | null> {
    const predicate: Record<string, unknown> = { _id: input.id, version: input.version, deletedAt: null };
    if (input.ownerId) {
      predicate.owner = input.ownerId;
    }
    return WorkOrder.findOneAndUpdate(predicate, { $set: { deletedAt: new Date() } }, { new: true })
      .populate('owner', 'name email')
      .lean();
  },

  async countAll(): Promise<number> {
    return WorkOrder.countDocuments({ deletedAt: null });
  },
};