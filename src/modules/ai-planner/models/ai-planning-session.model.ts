import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type AiPlanningSessionStatus = "ACTIVE" | "ARCHIVED";

export interface IAiPlanningSession {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  createdBy: Types.ObjectId | string;
  title: string;
  status: AiPlanningSessionStatus;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiPlanningSessionDocument
  extends IAiPlanningSession, Document {}

const aiPlanningSessionSchema = new Schema<IAiPlanningSessionDocument>(
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
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Planning Session",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

aiPlanningSessionSchema.index({ workspaceId: 1, updatedAt: -1 });
aiPlanningSessionSchema.index({ createdBy: 1, updatedAt: -1 });

export default model<IAiPlanningSessionDocument>(
  "AiPlanningSession",
  aiPlanningSessionSchema,
);
