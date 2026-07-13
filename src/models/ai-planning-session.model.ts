import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type AiPlanningSessionStatus = "ACTIVE" | "ARCHIVED";

export interface IAiPlanningSession {
  projectId: Types.ObjectId | string;
  createdBy: Types.ObjectId | string;
  title: string;
  status: AiPlanningSessionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiPlanningSessionDocument
  extends IAiPlanningSession, Document {}

const aiPlanningSessionSchema = new Schema<IAiPlanningSessionDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Planning conversation",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
      required: true,
    },
  },
  { timestamps: true },
);

aiPlanningSessionSchema.index({ projectId: 1, updatedAt: -1 });

export default model<IAiPlanningSessionDocument>(
  "AiPlanningSession",
  aiPlanningSessionSchema,
);
