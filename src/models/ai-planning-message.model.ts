import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type AiPlanningMessageRole = "USER" | "ASSISTANT";

export interface IAiPlanningMessage {
  projectId: Types.ObjectId | string;
  sessionId: Types.ObjectId | string;
  role: AiPlanningMessageRole;
  content: string;
  createdBy?: Types.ObjectId | string | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiPlanningMessageDocument
  extends IAiPlanningMessage, Document {}

const aiPlanningMessageSchema = new Schema<IAiPlanningMessageDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AiPlanningSession",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["USER", "ASSISTANT"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

aiPlanningMessageSchema.index({ sessionId: 1, createdAt: 1, _id: 1 });

export default model<IAiPlanningMessageDocument>(
  "AiPlanningMessage",
  aiPlanningMessageSchema,
);
