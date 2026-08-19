import type { WorkOrderPriority, WorkOrderPublic } from '@workorders/shared';
import { workOrderRepo, type WorkOrderListQuery } from '../repositories/work-order.repo.js';
import { toWorkOrderPublicWithOwner } from '../models/work-order.model.js';
import { isSystemActor, type Actor } from '../utils/actor.js';
import { assertValidObjectId } from '../utils/object-id.js';
import { conflictVersion, forbidden, notFound, validation } from '../utils/http-error.js';

export interface WorkOrderListResult {
  items: WorkOrderPublic[];
  nextCursor: string | null;
}


function ownerIdOf(wo: { owner: unknown }): string {
  const owner = wo.owner as { _id?: { toString(): string } };
  return owner._id?.toString() ?? '';
}

export const workOrderService = {
  async create(
    actor: Actor,
    input: { title: string; description?: string | null; priority: 'low' | 'medium' | 'high'; status: 'pending' | 'in_progress' | 'done' },
  ): Promise<WorkOrderPublic> {
    assertWritable(actor);
    const wo = await workOrderRepo.create({ ownerId: actor.id, ...input });
    const populated = await workOrderRepo.findById(wo._id.toString());
    if (!populated) throw notFound();
    return toWorkOrderPublicWithOwner(populated);
  },

  async list(actor: Actor, query: WorkOrderListQuery): Promise<WorkOrderListResult> {
    const { items, nextCursor } = await workOrderRepo.listByOwner({ ...query, ownerId: actor.id });
    return { items: items.map((wo) => toWorkOrderPublicWithOwner(wo)), nextCursor };
  },

  async get(actor: Actor, id: string): Promise<WorkOrderPublic> {
    if (isSystemActor(actor)) throw forbidden('System actors cannot use this endpoint');
    assertValidObjectId(id);
    const wo = await workOrderRepo.findById(id);
    if (!wo) throw notFound();
    if (actor.role !== 'admin' && actor.role !== 'viewer' && ownerIdOf(wo) !== actor.id) throw notFound();
    return toWorkOrderPublicWithOwner(wo);
  },

  async update(
    actor: Actor,
    id: string,
    input: {
      title?: string;
      description?: string | null;
      priority?: 'low' | 'medium' | 'high';
      status?: 'pending' | 'in_progress' | 'done';
      version: number;
    },
  ): Promise<WorkOrderPublic> {
    if (isSystemActor(actor)) throw forbidden('System actors cannot use this endpoint');
    assertWritable(actor);
    assertValidObjectId(id);
    const existing = await workOrderRepo.findById(id);
    if (!existing) throw notFound();
    if (actor.role !== 'admin' && ownerIdOf(existing) !== actor.id) throw notFound();

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;

    const updated = await workOrderRepo.updateIfVersion({
      id,
      ownerId: actor.role === 'admin' ? undefined : actor.id,
      version: input.version,
      patch,
    });
    if (!updated) {
      const current = await workOrderRepo.findByIdIncludingDeleted(id);
      if (!current || current.deletedAt) throw notFound();
      throw conflictVersion();
    }
    return toWorkOrderPublicWithOwner(updated);
  },

  async remove(actor: Actor, id: string, version: number): Promise<void> {
    if (isSystemActor(actor)) throw forbidden('System actors cannot use this endpoint');
    assertWritable(actor);
    assertValidObjectId(id);
    const existing = await workOrderRepo.findByIdIncludingDeleted(id);
    if (!existing) throw notFound();
    if (existing.deletedAt) return; // idempotent: already deleted → 204
    if (actor.role !== 'admin' && ownerIdOf(existing) !== actor.id) throw notFound();

    const deleted = await workOrderRepo.softDelete({
      id,
      ownerId: actor.role === 'admin' ? undefined : actor.id,
      version,
    });
    if (!deleted) {
      const current = await workOrderRepo.findByIdIncludingDeleted(id);
      if (!current) throw notFound();
      if (current.deletedAt) return; // idempotent
      throw conflictVersion();
    }
  },

  async triagePatch(actor: Actor, id: string, input: { priority?: WorkOrderPriority }): Promise<WorkOrderPublic> {
    if (!isSystemActor(actor) || actor.capability !== 'triage') throw forbidden('Triage capability required');
    assertValidObjectId(id);
    if (input.priority === undefined) throw validation([{ field: 'priority', message: 'priority is required' }]);
    const existing = await workOrderRepo.findByIdIncludingDeleted(id);
    if (!existing) throw notFound();
    if (existing.deletedAt) throw notFound();
    const updated = await workOrderRepo.updateIfVersion({
      id,
      version: existing.version,
      patch: { priority: input.priority },
    });
    if (!updated) {
      const current = await workOrderRepo.findByIdIncludingDeleted(id);
      if (!current || current.deletedAt) throw notFound();
      throw conflictVersion();
    }
    return toWorkOrderPublicWithOwner(updated);
  },
};

function assertWritable(actor: Actor): void {
  if (actor.role === 'viewer') throw forbidden('Viewer accounts are read-only');
}