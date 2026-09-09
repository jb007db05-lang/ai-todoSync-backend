import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";
import { encrypt, decrypt } from "../../../utils/encryption.js";

export interface IProjectAiConfig {
  projectId: Types.ObjectId | string;
  enabled: boolean;
  provider: "gemini" | "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectAiConfigDocument extends IProjectAiConfig, Document {}

const projectAiConfigSchema = new Schema<IProjectAiConfigDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      enum: ["gemini", "openai", "anthropic"],
      default: "gemini",
      required: true,
    },
    apiKey: {
      type: String,
      get: (v: string) => (v ? decrypt(v) : v),
      set: (v: string) => (v ? encrypt(v) : v),
    },
    baseUrl: {
      type: String,
      default: "",
    },
    modelName: {
      type: String,
      required: true,
      default: "Gemini 3.6 Flash",
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

const ProjectAiConfigModel = model<IProjectAiConfigDocument>(
  "ProjectAiConfig",
  projectAiConfigSchema,
);

export default ProjectAiConfigModel;
