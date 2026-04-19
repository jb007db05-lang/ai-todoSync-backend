import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsEvent {
  keyId: string;
  userId?: string;
  sessionId: string;
  eventName: string;
  properties: Record<string, any>;
  timestamp: Date;
  sdkVersion?: string;
  context?: {
    library?: { name: string; version: string };
    page?: { url: string; referrer: string; title: string };
    device?: { browser: string; os: string; screen: string; language: string };
    ip?: string;
    geo?: { city?: string; country?: string; region?: string };
  };
}

export interface IAnalyticsEventDocument extends IAnalyticsEvent, Document {}

const analyticsEventSchema = new Schema<IAnalyticsEventDocument>(
  {
    keyId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    sessionId: { type: String, required: true, index: true },
    eventName: { type: String, required: true, index: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
    sdkVersion: { type: String },
    context: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false },
);

// Compound indexes for efficient range queries
analyticsEventSchema.index({ keyId: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ sessionId: 1, timestamp: -1 });

const AnalyticsEventModel = model<IAnalyticsEventDocument>(
  "AnalyticsEvent",
  analyticsEventSchema,
);

export default AnalyticsEventModel;
