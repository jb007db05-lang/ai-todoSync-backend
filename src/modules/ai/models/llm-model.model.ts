import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

export interface ILlmModel {
  modelId: string;
  providerId: string;
  displayName: string;
  isEnabled: boolean;
  isDefault: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  cachedInputPricePerMToken: number;
  capabilities: string[];
  supportedParameters: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILlmModelDocument extends ILlmModel, Document {}

const llmModelSchema = new Schema<ILlmModelDocument>(
  {
    modelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    providerId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false },
    contextWindow: { type: Number, default: 128000 },
    maxOutputTokens: { type: Number, default: 4096 },
    inputPricePerMToken: { type: Number, default: 0.15 },
    outputPricePerMToken: { type: Number, default: 0.6 },
    cachedInputPricePerMToken: { type: Number, default: 0.0375 },
    capabilities: [{ type: String, trim: true }],
    supportedParameters: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

llmModelSchema.index({ providerId: 1, isEnabled: 1 });

export default model<ILlmModelDocument>("LlmModel", llmModelSchema);
