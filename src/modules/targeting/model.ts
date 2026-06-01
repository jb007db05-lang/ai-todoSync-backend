import { Schema, model, type Document } from "mongoose";
import type { TargetingRuleGroup } from "../engagement/types.js";

export interface ITargetingSegment {
  tenantId: string;
  name: string;
  description?: string;
  rules: TargetingRuleGroup;
  createdBy: string;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITargetingSegmentDocument
  extends ITargetingSegment, Document {}

const targetingSegmentSchema = new Schema<ITargetingSegmentDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    rules: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

targetingSegmentSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const TargetingSegmentModel = model<ITargetingSegmentDocument>(
  "TargetingSegment",
  targetingSegmentSchema,
);

export default TargetingSegmentModel;
