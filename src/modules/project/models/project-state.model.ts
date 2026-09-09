import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type ProjectStateCategory =
  | "BACKLOG"
  | "UNSTARTED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELED";

export interface IProjectState {
  projectId: Types.ObjectId | string;
  name: string;
  description?: string;
  color: string;
  position: number;
  category: ProjectStateCategory;
  isDefault?: boolean;
  isTerminal?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectStateDocument extends IProjectState, Document {}

const projectStateSchema = new Schema<IProjectStateDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    color: {
      type: String,
      default: "#6B7280",
    },
    position: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      enum: ["BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELED"],
      default: "STARTED",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isTerminal: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

projectStateSchema.index({ projectId: 1, position: 1 });
projectStateSchema.index({ projectId: 1, name: 1 }, { unique: true });

const ProjectStateModel = model<IProjectStateDocument>(
  "ProjectState",
  projectStateSchema,
);

export default ProjectStateModel;
