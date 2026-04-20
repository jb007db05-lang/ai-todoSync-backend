import { Schema, model, type Document } from "mongoose";
import { encrypt, decrypt, deterministicHash } from "../utils/encryption.js";

export type KeyStatus = "active" | "revoked";

export interface IAnalyticsKey {
  userId: string;
  name: string;
  hashedKey: string; // Reversible encrypted storage
  keyHash: string;   // Deterministic hash for indexing
  status: KeyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnalyticsKeyDocument extends IAnalyticsKey, Document {}

const analyticsKeySchema = new Schema<IAnalyticsKeyDocument>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    hashedKey: { 
      type: String, 
      required: true, 
      unique: true,
      get: (v: string) => {
        try {
          return decrypt(v);
        } catch (e) {
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
    keyHash: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } },
);

// Pre-save hook to ensure keyHash is always synced with the raw key
analyticsKeySchema.pre<IAnalyticsKeyDocument>("save", async function () {
  if (this.isModified("hashedKey")) {
    const rawKey = this.hashedKey;
    this.keyHash = deterministicHash(rawKey);
  }
});

const AnalyticsKeyModel = model<IAnalyticsKeyDocument>(
  "AnalyticsKey",
  analyticsKeySchema,
);

export default AnalyticsKeyModel;
