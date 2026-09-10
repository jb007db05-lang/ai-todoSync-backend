import type { Document } from "mongoose";
import { Schema, model } from "mongoose";
import type { IPromptFolder } from "../../../interfaces/prompt/prompt.interface.js";

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
