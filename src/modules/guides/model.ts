import { Schema, model, type Document } from "mongoose";
import {
  GUIDE_PLACEMENTS,
  GUIDE_PRIORITIES,
  GUIDE_STATUSES,
  GUIDE_TYPES,
  type FrequencyRules,
  type GuidePriority,
  type GuideStatus,
  type GuideType,
  type ScheduleRules,
  type TargetingRuleGroup,
  type TourStep,
} from "../engagement/types.js";

export interface IGuide {
  tenantId: string;
  sdkIntegrationId: string;
  organizationId?: string | null;
  title: string;
  description?: string;
  type: GuideType;
  status: GuideStatus;
  theme: Record<string, unknown>;
  priority: GuidePriority;
  targetingRules?: TargetingRuleGroup | null;
  frequencyRules: FrequencyRules;
  scheduleRules: ScheduleRules;
  steps: TourStep[];
  analytics: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
  versions: Array<{
    version: number;
    changedAt: Date;
    changedBy?: string;
    snapshot: Record<string, unknown>;
  }>;
  createdBy: string;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGuideDocument extends IGuide, Document {}

const tourStepSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    selector: { type: String, default: "" },
    placement: {
      type: String,
      enum: GUIDE_PLACEMENTS,
      default: "CENTER",
    },
    actionType: {
      type: String,
      enum: ["NEXT", "CLICK", "NAVIGATE", "SUBMIT", "CUSTOM"],
      default: "NEXT",
    },
    nextStep: { type: String, default: null },
    branchConditions: { type: Schema.Types.Mixed, default: null },
    analytics: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const guideVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    changedAt: { type: Date, required: true },
    changedBy: { type: String },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const guideSchema = new Schema<IGuideDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    sdkIntegrationId: { type: String, required: true, index: true },
    organizationId: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, enum: GUIDE_TYPES, required: true, index: true },
    status: {
      type: String,
      enum: GUIDE_STATUSES,
      default: "DRAFT",
      index: true,
    },
    theme: { type: Schema.Types.Mixed, default: {} },
    priority: {
      type: String,
      enum: GUIDE_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    targetingRules: { type: Schema.Types.Mixed, default: null },
    frequencyRules: {
      type: Schema.Types.Mixed,
      default: { showOncePerSession: true },
    },
    scheduleRules: { type: Schema.Types.Mixed, default: {} },
    steps: { type: [tourStepSchema], default: [] },
    analytics: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 1 },
    versions: { type: [guideVersionSchema], default: [] },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

guideSchema.index({ tenantId: 1, status: 1, priority: 1 });
guideSchema.index({ tenantId: 1, type: 1, status: 1 });
guideSchema.index({ sdkIntegrationId: 1, status: 1, priority: 1 });
guideSchema.index({ sdkIntegrationId: 1, type: 1, status: 1 });

const GuideModel = model<IGuideDocument>("Guide", guideSchema);

export default GuideModel;
