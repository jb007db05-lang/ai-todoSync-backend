import { Schema, model, type Document } from "mongoose";

export interface IGuideAnalyticsSnapshot {
  tenantId: string;
  guideId?: string | null;
  surveyId?: string | null;
  metrics: Record<string, unknown>;
  period: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGuideAnalyticsSnapshotDocument
  extends IGuideAnalyticsSnapshot, Document {}

const guideAnalyticsSnapshotSchema =
  new Schema<IGuideAnalyticsSnapshotDocument>(
    {
      tenantId: { type: String, required: true, index: true },
      guideId: { type: String, default: null, index: true },
      surveyId: { type: String, default: null, index: true },
      metrics: { type: Schema.Types.Mixed, default: {} },
      period: { type: String, required: true, index: true },
    },
    { timestamps: true },
  );

guideAnalyticsSnapshotSchema.index({
  tenantId: 1,
  guideId: 1,
  surveyId: 1,
  period: 1,
});

const GuideAnalyticsSnapshotModel = model<IGuideAnalyticsSnapshotDocument>(
  "GuideAnalyticsSnapshot",
  guideAnalyticsSnapshotSchema,
);

export default GuideAnalyticsSnapshotModel;
