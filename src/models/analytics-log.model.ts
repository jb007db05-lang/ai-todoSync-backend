import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsLog {
  eventId: string;
  eventRef?: string;
  apiKeyId: string;
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
    apiKeyId: { type: String, required: true, index: true },
    userIdentifier: { type: String, index: true },
    sessionId: { type: String, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

analyticsLogSchema.index(
  { eventId: 1, apiKeyId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventRef: { $exists: true },
      eventId: { $type: "string" },
    },
  },
);

const AnalyticsLogModel = model<IAnalyticsLogDocument>(
  "AnalyticsLog",
  analyticsLogSchema,
);

export default AnalyticsLogModel;
