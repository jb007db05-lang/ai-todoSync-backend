import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

export interface ILlmProvider {
  providerId: string;
  displayName: string;
  isEnabled: boolean;
  baseUrl?: string;
  configMetadata?: Record<string, unknown>;
  supportedCapabilities: string[];
  supportedParameters: string[];
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILlmProviderDocument extends ILlmProvider, Document {}

const llmProviderSchema = new Schema<ILlmProviderDocument>(
  {
    providerId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, default: true, index: true },
    baseUrl: { type: String, default: "" },
    configMetadata: { type: Schema.Types.Mixed, default: {} },
    supportedCapabilities: [{ type: String, trim: true }],
    supportedParameters: [{ type: String, trim: true }],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default model<ILlmProviderDocument>("LlmProvider", llmProviderSchema);
