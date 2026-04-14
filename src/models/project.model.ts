import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IProject {
  name: string;
  description?: string;
  userId: Types.ObjectId | string;
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
  },
  { timestamps: true },
);

projectSchema.index({ userId: 1, name: 1 }, { unique: true });

const ProjectModel = model<IProjectDocument>("Project", projectSchema);

export default ProjectModel;
