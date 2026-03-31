import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IProject {
  name: string;
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
      trim: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    }
  },
  { timestamps: true }
);

projectSchema.index({ userId: 1, name: 1 }, { unique: true });

const ProjectModel = model<IProjectDocument>('Project', projectSchema);

export default ProjectModel;
