import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

import type { TaskPriority } from "./task.model.js";

export interface ISlaConfig {
  userId: Types.ObjectId | string;
  priority: TaskPriority;
  responseTimeHours: number;
  resolutionTimeHours: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISlaConfigDocument extends ISlaConfig, Document {}

const slaConfigSchema = new Schema<ISlaConfigDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      required: true,
    },
    responseTimeHours: {
      type: Number,
      required: true,
      min: 0.01,
    },
    resolutionTimeHours: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { timestamps: true },
);

slaConfigSchema.index({ userId: 1, priority: 1 }, { unique: true });

const SlaConfigModel = model<ISlaConfigDocument>("SlaConfig", slaConfigSchema);

export default SlaConfigModel;
