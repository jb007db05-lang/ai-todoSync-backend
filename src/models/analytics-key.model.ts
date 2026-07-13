import { Schema, model, type Document } from "mongoose";
import { encrypt, decrypt, deterministicHash } from "../utils/encryption.js";

export type KeyStatus = "active" | "revoked";

export interface IAnalyticsKey {
  userId: string;
  name: string;
  hashedKey: string; // Reversible encrypted storage
  keyHash: string; // Deterministic hash for indexing
  status: KeyStatus;
  allowedOrigins: string[];
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
      index: true,
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
    keyHash: {
      type: String,
      required: false,
      index: true,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      required: true,
    },
    allowedOrigins: {
      type: [String],
      default: [],
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

// Drop stale legacy indexes that cause E11000 null conflicts.
// Safe to call repeatedly — it's a no-op if the index doesn't exist.
analyticsKeySchema.statics.dropLegacyIndexes = async function () {
  const collection = this.collection;
  const indexesToDrop = ["key_1", "keyHash_1"];
  for (const indexName of indexesToDrop) {
    try {
      await collection.dropIndex(indexName);
    } catch {
      // Index doesn't exist — that's fine, ignore the error
    }
  }
};

const AnalyticsKeyModel = model<IAnalyticsKeyDocument>(
  "AnalyticsKey",
  analyticsKeySchema,
);

export default AnalyticsKeyModel;
