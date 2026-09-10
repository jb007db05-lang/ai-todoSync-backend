import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsUser {
  apiKeyId: string;
  userIdentifier: string; // Unique per key
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface IAnalyticsUserDocument extends IAnalyticsUser, Document {}

const analyticsUserSchema = new Schema<IAnalyticsUserDocument>(
  {
    apiKeyId: { type: String, required: true, index: true },
    userIdentifier: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Compound index for unique identifier per key
analyticsUserSchema.index({ apiKeyId: 1, userIdentifier: 1 }, { unique: true });

const AnalyticsUserModel = model<IAnalyticsUserDocument>(
  "AnalyticsUser",
  analyticsUserSchema,
);

export default AnalyticsUserModel;
