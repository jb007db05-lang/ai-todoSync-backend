import type { Document } from "mongoose";
import { Schema, model } from "mongoose";
import type { IPromptVersion } from "../../../interfaces/prompt/prompt.interface.js";

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
    hash: { type: String, default: "" },
    body: { type: String, required: true, maxlength: 20000 },
    messages: [
      {
        role: {
          type: String,
          enum: ["system", "developer", "user", "assistant"],
          required: true,
        },
        content: { type: String, required: true },
        _id: false,
      },
    ],
    variables: [
      {
        name: { type: String, required: true, trim: true },
        type: {
          type: String,
          enum: ["string", "number", "json", "boolean", "enum"],
          default: "string",
        },
        description: { type: String, default: "" },
        defaultValue: { type: String, default: "" },
        required: { type: Boolean, default: false },
        options: [{ type: String, trim: true }],
        min: { type: Number, default: undefined },
        max: { type: Number, default: undefined },
        regex: { type: String, default: undefined },
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

promptVersionSchema.index({ promptId: 1, version: -1 }, { unique: true });

export default model<IPromptVersionDocument>(
  "PromptVersion",
  promptVersionSchema,
);
