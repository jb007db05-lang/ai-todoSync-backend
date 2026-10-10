import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsEvent {
  eventName: string;
  apiKeyId?: string;
  sdkIntegrationId: string;
  /** Lexicon: human-friendly name shown instead of the raw event name. */
  displayName?: string;
  /** Lexicon: what the event means and when it is sent. */
  description?: string;
  /** Lexicon: hidden events are still collected but left out of pickers. */
  hidden?: boolean;
  tags?: string[];
  createdAt: Date;
}

export interface IAnalyticsEventDocument extends IAnalyticsEvent, Document {}

const analyticsEventSchema = new Schema<IAnalyticsEventDocument>(
  {
    eventName: { type: String, required: true, index: true },
    apiKeyId: { type: String, required: false, index: true },
    sdkIntegrationId: { type: String, required: true, index: true },
    displayName: { type: String, default: "" },
    description: { type: String, default: "" },
    hidden: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
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
