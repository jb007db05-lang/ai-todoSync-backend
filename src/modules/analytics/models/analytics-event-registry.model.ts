import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsEvent {
  eventName: string;
  apiKeyId?: string;
  sdkIntegrationId: string;
  createdAt: Date;
}

export interface IAnalyticsEventDocument extends IAnalyticsEvent, Document {}

const analyticsEventSchema = new Schema<IAnalyticsEventDocument>(
  {
    eventName: { type: String, required: true, index: true },
    apiKeyId: { type: String, required: false, index: true },
    sdkIntegrationId: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Compound index for efficiency
analyticsEventSchema.index(
  { eventName: 1, sdkIntegrationId: 1 },
  { unique: true },
);

const AnalyticsEventRegistryModel = model<IAnalyticsEventDocument>(
  "AnalyticsEventRegistry",
  analyticsEventSchema,
);

export default AnalyticsEventRegistryModel;
