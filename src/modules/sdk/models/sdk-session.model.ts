import { Schema, model, type Document } from "mongoose";

export interface ISdkSession {
  sessionId: string;
  sessionSecret: string;
  tenantId: string;
  sdkKeyHash: string;
  environment: "live" | "sandbox";
  validatedOrigin: string;
  issuedAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export interface ISdkSessionDocument extends ISdkSession, Document {}

const sdkSessionSchema = new Schema<ISdkSessionDocument>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    sessionSecret: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    sdkKeyHash: { type: String, required: true, index: true },
    environment: {
      type: String,
      enum: ["live", "sandbox"],
      default: "live",
    },
    validatedOrigin: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true }, // TTL index below
    revoked: { type: Boolean, required: true, default: false },
  },
  {
    timestamps: true,
  },
);

// TTL index to automatically purge expired sessions from MongoDB
sdkSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SdkSessionModel = model<ISdkSessionDocument>(
  "SdkSession",
  sdkSessionSchema,
);

export default SdkSessionModel;
