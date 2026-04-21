import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsEvent {
  eventName: string;
  apiKeyId: string;
  createdAt: Date;
}

export interface IAnalyticsEventDocument extends IAnalyticsEvent, Document {}

const analyticsEventSchema = new Schema<IAnalyticsEventDocument>(
  {
    eventName: { type: String, required: true, index: true },
    apiKeyId: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for efficiency
analyticsEventSchema.index({ eventName: 1, apiKeyId: 1 }, { unique: true });

const AnalyticsEventRegistryModel = model<IAnalyticsEventDocument>(
  "AnalyticsEventRegistry",
  analyticsEventSchema
);

export default AnalyticsEventRegistryModel;
