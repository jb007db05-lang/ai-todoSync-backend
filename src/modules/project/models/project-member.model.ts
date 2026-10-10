import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type ProjectRole = "ADMIN" | "MEMBER";

export interface IProjectMember {
  projectId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  role: ProjectRole;
  /** Who gave this member access to the project. */
  grantedBy?: Types.ObjectId | string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectMemberDocument extends IProjectMember, Document {}

const projectMemberSchema = new Schema<IProjectMemberDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    role: {
      type: String,
      enum: ["ADMIN", "MEMBER"],
      required: true,
      default: "MEMBER",
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMemberSchema.index({ userId: 1, projectId: 1 });
projectMemberSchema.index({ projectId: 1, role: 1 });

const ProjectMemberModel = model<IProjectMemberDocument>(
  "ProjectMember",
  projectMemberSchema,
);

export default ProjectMemberModel;
