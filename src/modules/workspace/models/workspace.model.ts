import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IWorkspaceSettings {
  defaultProjectRole?: string;
  allowGuestInvites?: boolean;
}

export interface IWorkspace {
  name: string;
  slug: string;
  ownerId: Types.ObjectId | string;
  settings?: IWorkspaceSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWorkspaceDocument extends IWorkspace, Document {}

const workspaceSchema = new Schema<IWorkspaceDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    settings: {
      defaultProjectRole: { type: String, default: "MEMBER" },
      allowGuestInvites: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ slug: 1 }, { unique: true });

const WorkspaceModel = model<IWorkspaceDocument>("Workspace", workspaceSchema);

export default WorkspaceModel;
