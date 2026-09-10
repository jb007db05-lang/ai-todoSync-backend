import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type AiPlanningDraftStatus =
  | "REVIEW"
  | "EXECUTING"
  | "EXECUTED"
  | "REJECTED"
  | "FAILED";

export interface IAiPlanningSubtaskDraft {
  title: string;
  description?: string;
}

export interface IAiPlanningTaskDraft {
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  date: string;
  milestoneIndex: number;
  subtasks: IAiPlanningSubtaskDraft[];
}

export interface IAiPlanningMilestoneDraft {
  name: string;
  description?: string;
}

export interface IAiPlanningPlan {
  documentationTitle: string;
  documentation: string;
  milestones: IAiPlanningMilestoneDraft[];
  tasks: IAiPlanningTaskDraft[];
  [key: string]: any;
}

export interface IAiPlanningArtifactIds {
  noteId?: string;
  epicIds?: string[];
  taskIds?: string[];
}

export interface IAiPlanningDraft {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  sessionId: Types.ObjectId | string;
  requestedBy: Types.ObjectId | string;
  status: AiPlanningDraftStatus;
  plan: IAiPlanningPlan;
  rejectionReason?: string;
  approvedBy?: Types.ObjectId | string | null;
  rejectedBy?: Types.ObjectId | string | null;
  artifacts?: IAiPlanningArtifactIds;
  failureReason?: string;
  executedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiPlanningDraftDocument extends IAiPlanningDraft, Document {}

const aiPlanningDraftSchema = new Schema<IAiPlanningDraftDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AiPlanningSession",
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["REVIEW", "EXECUTING", "EXECUTED", "REJECTED", "FAILED"],
      default: "REVIEW",
      required: true,
      index: true,
    },
    plan: {
      type: Schema.Types.Mixed,
      required: true,
    },
    rejectionReason: { type: String, default: "" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    failureReason: { type: String, default: "" },
    executedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiPlanningDraftSchema.index({ workspaceId: 1, createdAt: -1 });
aiPlanningDraftSchema.index({ sessionId: 1, createdAt: -1 });

export default model<IAiPlanningDraftDocument>(
  "AiPlanningDraft",
  aiPlanningDraftSchema,
);
