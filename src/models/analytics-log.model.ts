import { Schema, model, type Document } from "mongoose";

export interface IAnalyticsLog {
  eventId: string;
  apiKeyId: string;
  userIdentifier?: string;
  payload: Record<string, any>;
  createdAt: Date;
}

export interface IAnalyticsLogDocument extends IAnalyticsLog, Document {}

const analyticsLogSchema = new Schema<IAnalyticsLogDocument>(
  {
    eventId: { type: String, required: true, index: true },
    apiKeyId: { type: String, required: true, index: true },
    userIdentifier: { type: String, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AnalyticsLogModel = model<IAnalyticsLogDocument>(
  "AnalyticsLog",
  analyticsLogSchema
);

export default AnalyticsLogModel;
