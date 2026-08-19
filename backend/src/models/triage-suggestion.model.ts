import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { TriageSuggestion as TriageSuggestionDTO, WorkOrderPriority } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface TriageSuggestionDoc {
  _id: ObjectId;
  workOrderId: ObjectId;
  runId: ObjectId;
  summary: string;
  suggestedPriority: WorkOrderPriority;
  flagForDispatcher: boolean;
  applied: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const triageSuggestionSchema = new Schema<TriageSuggestionDoc>(
  {
    workOrderId: { type: Schema.ObjectId, ref: 'WorkOrder', required: true, index: true },
    runId: { type: Schema.ObjectId, ref: 'AgentRun', required: true },
    summary: { type: String, required: true },
    suggestedPriority: { type: String, enum: ['low', 'medium', 'high'], required: true },
    flagForDispatcher: { type: Boolean, default: false },
    applied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const TriageSuggestion = (models.TriageSuggestion ?? model('TriageSuggestion', triageSuggestionSchema)) as Model<TriageSuggestionDoc>;

export function toTriageSuggestionPublic(suggestion: TriageSuggestionDoc): TriageSuggestionDTO {
  return {
    id: suggestion._id.toString(),
    workOrderId: suggestion.workOrderId.toString(),
    runId: suggestion.runId.toString(),
    summary: suggestion.summary,
    suggestedPriority: suggestion.suggestedPriority,
    flagForDispatcher: suggestion.flagForDispatcher,
    applied: suggestion.applied,
    createdAt: suggestion.createdAt.toISOString(),
  };
}