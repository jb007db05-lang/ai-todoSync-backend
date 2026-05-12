import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

export interface ISemanticRollupSnapshot {
  scopeType: "workspace" | "project";
  scopeId: string;
  period: "daily" | "weekly";
  bucketStart: Date;
  bucketEnd: Date;
  metrics: Record<string, unknown>;
  eventCounts: Record<string, number>;
  freshness: {
    computedAt: Date;
    sourceEventMaxCreatedAt: Date | null;
    status: "fresh" | "stale";
  };
  semanticVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISemanticRollupSnapshotDocument
  extends ISemanticRollupSnapshot, Document {}

const semanticRollupSnapshotSchema =
  new Schema<ISemanticRollupSnapshotDocument>(
    {
      scopeType: {
        type: String,
        enum: ["workspace", "project"],
        required: true,
        index: true,
      },
      scopeId: { type: String, required: true, index: true },
      period: {
        type: String,
        enum: ["daily", "weekly"],
        required: true,
        index: true,
      },
      bucketStart: { type: Date, required: true, index: true },
      bucketEnd: { type: Date, required: true },
      metrics: { type: Schema.Types.Mixed, default: {} },
      eventCounts: { type: Schema.Types.Mixed, default: {} },
      freshness: {
        computedAt: { type: Date, required: true },
        sourceEventMaxCreatedAt: { type: Date, default: null },
        status: { type: String, enum: ["fresh", "stale"], default: "fresh" },
      },
      semanticVersion: { type: String, required: true, default: "2.0.0" },
    },
    { timestamps: true },
  );

semanticRollupSnapshotSchema.index(
  { scopeType: 1, scopeId: 1, period: 1, bucketStart: 1 },
  { unique: true },
);

const SemanticRollupSnapshotModel = model<ISemanticRollupSnapshotDocument>(
  "SemanticRollupSnapshot",
  semanticRollupSnapshotSchema,
);

export default SemanticRollupSnapshotModel;
