import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "GUEST";

export interface IWorkspaceMember {
  workspaceId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  role: WorkspaceRole;
  /**
   * Flags set by a workspace admin, overlaid on the role's defaults
   * (see access/permissions.ts). Missing keys fall back to the role default.
   */
  permissions?: Record<string, boolean>;
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWorkspaceMemberDocument extends IWorkspaceMember, Document {}

const workspaceMemberSchema = new Schema<IWorkspaceMemberDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Workspace",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "MANAGER", "MEMBER", "GUEST"],
      default: "MEMBER",
      required: true,
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const WorkspaceMemberModel = model<IWorkspaceMemberDocument>(
  "WorkspaceMember",
  workspaceMemberSchema,
);

export default WorkspaceMemberModel;
