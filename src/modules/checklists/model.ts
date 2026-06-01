import { Schema, model, type Document } from "mongoose";
import {
  GUIDE_PRIORITIES,
  GUIDE_STATUSES,
  type ChecklistItem,
  type FrequencyRules,
  type GuidePriority,
  type GuideStatus,
  type ScheduleRules,
  type TargetingRuleGroup,
} from "../engagement/types.js";

export interface IChecklist {
  tenantId: string;
  title: string;
  description?: string;
  status: GuideStatus;
  priority: GuidePriority;
  items: ChecklistItem[];
  targetingRules?: TargetingRuleGroup | null;
  frequencyRules: FrequencyRules;
  scheduleRules: ScheduleRules;
  estimatedMinutes?: number;
  analytics: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdBy: string;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IChecklistDocument extends IChecklist, Document {}

const checklistItemSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    linkedEvent: { type: String, default: "" },
    completionConditions: { type: Schema.Types.Mixed, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    estimatedMinutes: { type: Number, default: 5 },
  },
  { _id: false },
);

const checklistSchema = new Schema<IChecklistDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: GUIDE_STATUSES,
      default: "DRAFT",
      index: true,
    },
    priority: {
      type: String,
      enum: GUIDE_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    items: { type: [checklistItemSchema], default: [] },
    targetingRules: { type: Schema.Types.Mixed, default: null },
    frequencyRules: { type: Schema.Types.Mixed, default: {} },
    scheduleRules: { type: Schema.Types.Mixed, default: {} },
    estimatedMinutes: { type: Number, default: 0 },
    analytics: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

checklistSchema.index({ tenantId: 1, status: 1, priority: 1 });

export interface IChecklistProgress {
  tenantId: string;
  checklistId: string;
  userId?: string;
  sessionId?: string;
  completedItemIds: string[];
  completedAt?: Date | null;
  lastEventName?: string | null;
  progressPercent: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IChecklistProgressDocument
  extends IChecklistProgress, Document {}

const checklistProgressSchema = new Schema<IChecklistProgressDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    checklistId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    sessionId: { type: String, index: true },
    completedItemIds: { type: [String], default: [] },
    completedAt: { type: Date, default: null },
    lastEventName: { type: String, default: null },
    progressPercent: { type: Number, default: 0 },
  },
  { timestamps: true },
);

checklistProgressSchema.index({ tenantId: 1, checklistId: 1, userId: 1 });

export const ChecklistModel = model<IChecklistDocument>(
  "Checklist",
  checklistSchema,
);
export const ChecklistProgressModel = model<IChecklistProgressDocument>(
  "ChecklistProgress",
  checklistProgressSchema,
);
