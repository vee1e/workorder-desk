import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { WorkOrderPriority, WorkOrderPublic, WorkOrderStatus } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface WorkOrderDoc {
  _id: ObjectId;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  owner: ObjectId;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const workOrderSchema = new Schema<WorkOrderDoc>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['pending', 'in_progress', 'done'], default: 'pending' },
    owner: { type: Schema.ObjectId, ref: 'User', required: true, index: true },
    version: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

workOrderSchema.index({ owner: 1, deletedAt: 1, createdAt: -1, _id: -1 });
workOrderSchema.index({ owner: 1, status: 1, deletedAt: 1 });
workOrderSchema.index({ owner: 1, priority: 1, deletedAt: 1 });

export const WorkOrder = (models.WorkOrder ?? model('WorkOrder', workOrderSchema)) as Model<WorkOrderDoc>;

export interface WorkOrderOwner {
  id: string;
  name: string;
  email: string;
}

export function toWorkOrderPublic(workOrder: WorkOrderDoc, owner: WorkOrderOwner): WorkOrderPublic {
  return {
    id: workOrder._id.toString(),
    title: workOrder.title,
    description: workOrder.description ?? null,
    priority: workOrder.priority,
    status: workOrder.status,
    owner,
    version: workOrder.version,
    createdAt: workOrder.createdAt.toISOString(),
    updatedAt: workOrder.updatedAt.toISOString(),
  };
}

export function toWorkOrderPublicWithOwner(workOrder: WorkOrderDoc): WorkOrderPublic {
  const populated = workOrder.owner as unknown as { _id: { toString(): string }; name: string; email: string };
  return toWorkOrderPublic(workOrder, {
    id: populated._id.toString(),
    name: populated.name,
    email: populated.email,
  });
}

export function isDeleted(workOrder: WorkOrderDoc | null): boolean {
  return workOrder !== null && workOrder.deletedAt !== null;
}