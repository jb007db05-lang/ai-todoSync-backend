import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsLog {
  eventId: string;
  eventRef?: string;
  /** Event name — added to eliminate AnalyticsEventRegistry collection */
  eventName?: string;
  apiKeyId?: string;
  sdkIntegrationId: string;
  /** "sandbox" for traffic from the integration's sandbox key */
  environment?: "live" | "sandbox";
  userIdentifier?: string;
  sessionId?: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface IAnalyticsLogDocument extends IAnalyticsLog, Document {}

const analyticsLogSchema = new Schema<IAnalyticsLogDocument>(
  {
    eventId: { type: String, required: true, index: true },
    eventRef: { type: String, index: true },
    eventName: { type: String, index: true },
    apiKeyId: { type: String, required: false, index: true },
    sdkIntegrationId: { type: String, required: true, index: true },
    environment: { type: String, enum: ["live", "sandbox"], default: "live" },
    userIdentifier: { type: String, index: true },
    sessionId: { type: String, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

analyticsLogSchema.index(
  { eventId: 1, sdkIntegrationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventRef: { $exists: true },
      eventId: { $type: "string" },
    },
  },
);

analyticsLogSchema.index({
  sdkIntegrationId: 1,
  environment: 1,
  createdAt: -1,
});
analyticsLogSchema.index({ sdkIntegrationId: 1, environment: 1, eventRef: 1 });

// Sparse index for event-name-seen queries (replaces AnalyticsEventRegistry)
analyticsLogSchema.index(
  { eventName: 1, sdkIntegrationId: 1 },
  { sparse: true },
);

const AnalyticsLogModel = model<IAnalyticsLogDocument>(
  "AnalyticsLog",
  analyticsLogSchema,
);

export default AnalyticsLogModel;
