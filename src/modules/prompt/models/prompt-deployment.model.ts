import type { Document } from "mongoose";
import { Schema, model } from "mongoose";
import {
  PROMPT_DEPLOYMENT_ACTIONS,
  type IPromptDeployment,
} from "../../../interfaces/prompt/prompt.interface.js";

export interface IPromptDeploymentDocument
  extends IPromptDeployment, Document {}

export const PROMPT_DEPLOYMENT_HISTORY_LIMIT = 50;

const promptDeploymentSchema = new Schema<IPromptDeploymentDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    promptId: {
      type: Schema.Types.ObjectId,
      ref: "PromptLibrary",
      required: true,
    },
    featureKey: { type: String, default: null },
    productionVersion: { type: Number, required: true, min: 1 },
    stagingVersion: { type: Number, default: null, min: 1 },
    canary: {
      type: new Schema(
        {
          version: { type: Number, required: true, min: 1 },
          percentage: { type: Number, required: true, min: 1, max: 99 },
          startedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    history: [
      {
        action: {
          type: String,
          enum: PROMPT_DEPLOYMENT_ACTIONS,
          required: true,
        },
        version: { type: Number, default: null },
        previousVersion: { type: Number, default: null },
        percentage: { type: Number, default: null },
        featureKey: { type: String, default: null },
        actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
        at: { type: Date, required: true },
        _id: false,
      },
    ],
  },
  // Concurrent deploy actions on the same prompt fail instead of overwriting.
  { timestamps: true, optimisticConcurrency: true },
);

promptDeploymentSchema.index({ workspaceId: 1, promptId: 1 }, { unique: true });
// One prompt per feature per workspace.
promptDeploymentSchema.index(
  { workspaceId: 1, featureKey: 1 },
  {
    unique: true,
    partialFilterExpression: { featureKey: { $type: "string" } },
  },
);

export default model<IPromptDeploymentDocument>(
  "PromptDeployment",
  promptDeploymentSchema,
);
