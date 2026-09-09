import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IProjectCustomField {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  options?: string[];
}

export interface IProject {
  name: string;
  description?: string;
  userId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string | null;
  icon?: string;
  color?: string;
  startDate?: Date | null;
  targetDate?: Date | null;
  status?: "ACTIVE" | "PLANNING" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tags?: string[];
  customFields?: IProjectCustomField[];
  isArchived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectDocument extends IProject, Document {}

const projectSchema = new Schema<IProjectDocument>(
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
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    icon: {
      type: String,
      default: "folder",
    },
    color: {
      type: String,
      default: "#3B82F6",
    },
    startDate: {
      type: Date,
      default: null,
    },
    targetDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PLANNING", "PAUSED", "COMPLETED", "ARCHIVED"],
      default: "ACTIVE",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },
    tags: {
      type: [String],
      default: [],
    },
    customFields: {
      type: Array,
      default: [],
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

projectSchema.index({ userId: 1, name: 1 }, { unique: true });
projectSchema.index({ workspaceId: 1, name: 1 });

const ProjectModel = model<IProjectDocument>("Project", projectSchema);

export default ProjectModel;
