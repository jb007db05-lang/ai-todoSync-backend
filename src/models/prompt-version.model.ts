import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";
import type { IPromptVariable } from "./prompt-library.model.js";

export interface IPromptVersion {
  promptId: Types.ObjectId | string; // root prompt id (parentId or self for v1)
  version: number;
  body: string;
  variables: IPromptVariable[];
  changedBy: Types.ObjectId | string;
  changeNote?: string;
  createdAt?: Date;
}

export interface IPromptVersionDocument extends IPromptVersion, Document {}

const promptVersionSchema = new Schema<IPromptVersionDocument>(
  {
    promptId: {
      type: Schema.Types.ObjectId,
      ref: "PromptLibrary",
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    body: { type: String, required: true, maxlength: 20000 },
    variables: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        defaultValue: { type: String, default: "" },
        required: { type: Boolean, default: false },
        _id: false,
      },
    ],
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changeNote: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

promptVersionSchema.index({ promptId: 1, version: -1 });

export default model<IPromptVersionDocument>(
  "PromptVersion",
  promptVersionSchema,
);
