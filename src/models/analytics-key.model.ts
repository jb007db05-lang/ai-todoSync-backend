import { Schema, model, type Document } from "mongoose";

export type KeyStatus = "active" | "revoked";

export interface IAnalyticsKey {
  userId: string;
  name: string;
  key: string; // The full key (stored as plain text for simplicity in this task, or hashed if preferred)
  status: KeyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnalyticsKeyDocument extends IAnalyticsKey, Document {}

const analyticsKeySchema = new Schema<IAnalyticsKeyDocument>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true },
);

const AnalyticsKeyModel = model<IAnalyticsKeyDocument>(
  "AnalyticsKey",
  analyticsKeySchema,
);

export default AnalyticsKeyModel;
