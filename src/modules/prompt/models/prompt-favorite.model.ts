import type { Document } from "mongoose";
import { Schema, model } from "mongoose";
import type { IPromptFavorite } from "../../../interfaces/prompt/prompt.interface.js";

export interface IPromptFavoriteDocument extends IPromptFavorite, Document {}

const promptFavoriteSchema = new Schema<IPromptFavoriteDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    promptId: {
      type: Schema.Types.ObjectId,
      ref: "PromptLibrary",
      required: true,
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

promptFavoriteSchema.index(
  { workspaceId: 1, userId: 1, promptId: 1 },
  { unique: true },
);

export default model<IPromptFavoriteDocument>(
  "PromptFavorite",
  promptFavoriteSchema,
);
