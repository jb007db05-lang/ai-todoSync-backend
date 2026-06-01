import { Schema, model, type Document } from "mongoose";

export type GuideExposureStatus =
  | "shown"
  | "started"
  | "completed"
  | "dismissed"
  | "abandoned";

export interface IGuideExposure {
  tenantId: string;
  guideId: string;
  userId?: string;
  sessionId?: string;
  status: GuideExposureStatus;
  displayCount: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  dismissedAt?: Date | null;
  lastShownAt?: Date | null;
  lastInteractionAt?: Date | null;
  currentStepId?: string | null;
  stepState: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGuideExposureDocument extends IGuideExposure, Document {}

const guideExposureSchema = new Schema<IGuideExposureDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    guideId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    sessionId: { type: String, index: true },
    status: {
      type: String,
      enum: ["shown", "started", "completed", "dismissed", "abandoned"],
      required: true,
      default: "shown",
      index: true,
    },
    displayCount: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
    lastShownAt: { type: Date, default: null, index: true },
    lastInteractionAt: { type: Date, default: null },
    currentStepId: { type: String, default: null },
    stepState: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

guideExposureSchema.index({ tenantId: 1, guideId: 1, userId: 1 });
guideExposureSchema.index({ tenantId: 1, guideId: 1, sessionId: 1 });

export interface IMonthlyTargetedUser {
  tenantId: string;
  userId: string;
  month: string;
  guideIds: string[];
  surveyIds: string[];
  exposureCount: number;
  firstExposedAt: Date;
  lastExposedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMonthlyTargetedUserDocument
  extends IMonthlyTargetedUser, Document {}

const monthlyTargetedUserSchema = new Schema<IMonthlyTargetedUserDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    guideIds: { type: [String], default: [] },
    surveyIds: { type: [String], default: [] },
    exposureCount: { type: Number, default: 0, min: 0 },
    firstExposedAt: { type: Date, required: true },
    lastExposedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

monthlyTargetedUserSchema.index(
  { tenantId: 1, month: 1, userId: 1 },
  { unique: true },
);

export const GuideExposureModel = model<IGuideExposureDocument>(
  "GuideExposure",
  guideExposureSchema,
);

export const MonthlyTargetedUserModel = model<IMonthlyTargetedUserDocument>(
  "MonthlyTargetedUser",
  monthlyTargetedUserSchema,
);
