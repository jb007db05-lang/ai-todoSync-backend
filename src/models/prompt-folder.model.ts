import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IPromptFolder {
  workspaceId: Types.ObjectId | string;
  name: string;
  description?: string;
  parentId?: Types.ObjectId | string | null;
  createdBy: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptFolderDocument extends IPromptFolder, Document {}

const promptFolderSchema = new Schema<IPromptFolderDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "PromptFolder",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

promptFolderSchema.index({ workspaceId: 1, parentId: 1, name: 1 });

export default model<IPromptFolderDocument>("PromptFolder", promptFolderSchema);
