import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IAuditRetentionPolicy {
  projectId: Types.ObjectId | string;
  retentionDays: number;
  legalHold: boolean;
  updatedBy: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAuditRetentionPolicyDocument
  extends IAuditRetentionPolicy, Document {}

const auditRetentionPolicySchema = new Schema<IAuditRetentionPolicyDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    retentionDays: {
      type: Number,
      required: true,
      min: 30,
      max: 3650,
      default: 2555,
    },
    legalHold: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

const AuditRetentionPolicyModel = model<IAuditRetentionPolicyDocument>(
  "AuditRetentionPolicy",
  auditRetentionPolicySchema,
);

export default AuditRetentionPolicyModel;
