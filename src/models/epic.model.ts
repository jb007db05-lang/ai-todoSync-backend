import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type EpicStatus = "planned" | "active" | "completed" | "archived";

export interface IEpic {
  name: string;
  description?: string;
  projectId: Types.ObjectId | string;
  status?: EpicStatus;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IEpicDocument extends IEpic, Document {}

const epicSchema = new Schema<IEpicDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
    },
    status: {
      type: String,
      enum: ["planned", "active", "completed", "archived"],
      default: "planned",
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true },
);

epicSchema.index({ projectId: 1, order: 1 }, { unique: true });
epicSchema.index({ projectId: 1, _id: 1 });

const EpicModel = model<IEpicDocument>("Epic", epicSchema);

export default EpicModel;
