import { Schema, model, type Document } from "mongoose";
import {
  encrypt,
  decrypt,
} from "../../utils/encryption.js";

export type SdkIntegrationStatus =
  | "pending"
  | "connected"
  | "disabled"
  | "revoked";

export type SdkEnvironment = "development" | "staging" | "production";

export interface ISdkIntegration {
  tenantId: string; // owner user id
  name: string;
  environment: SdkEnvironment;
  domain: string; // registered domain, e.g. https://app.company.com
  allowedOrigins?: string[];
  description?: string;
  status: SdkIntegrationStatus;
  sdkKey: string; // encrypted public SDK key (plain-text on get)
  sdkKeyHash: string; // deterministic HMAC for fast lookup
  sdkVersion?: string;
  // Connection tracking
  firstConnectedAt?: Date | null;
  lastConnectedAt?: Date | null;
  lastRuntimeRequestAt?: Date | null;
  lastEventRequestAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  connectionCount: number;
  latestOrigin?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISdkIntegrationDocument extends ISdkIntegration, Document {}

const sdkIntegrationSchema = new Schema<ISdkIntegrationDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
      required: true,
      default: "production",
    },
    domain: { type: String, required: true },
    allowedOrigins: { type: [String], default: [] },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "connected", "disabled", "revoked"],
      default: "pending",
      index: true,
    },
    sdkKey: {
      type: String,
      required: true,
      get: (v: string) => {
        try {
          return decrypt(v);
        } catch {
          return v;
        }
      },
      set: (v: string) => {
        if (v && !v.includes(":")) {
          return encrypt(v);
        }
        return v;
      },
    },
    sdkKeyHash: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    sdkVersion: { type: String, default: null },
    firstConnectedAt: { type: Date, default: null },
    lastConnectedAt: { type: Date, default: null },
    lastRuntimeRequestAt: { type: Date, default: null },
    lastEventRequestAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    connectionCount: { type: Number, default: 0, min: 0 },
    latestOrigin: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

sdkIntegrationSchema.index({ tenantId: 1, status: 1 });

const SdkIntegrationModel = model<ISdkIntegrationDocument>(
  "SdkIntegration",
  sdkIntegrationSchema,
);

export default SdkIntegrationModel;
