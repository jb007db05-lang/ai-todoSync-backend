import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

export interface ISemanticGovernanceAudit {
  metric: string;
  version: string;
  lifecycleState: "active" | "deprecated" | "retired";
  owner: string;
  changeType: "created" | "updated" | "deprecated" | "compatibility_review";
  compatibility: "backward_compatible" | "breaking" | "unknown";
  summary: string;
  lineage: {
    sourceMetrics: string[];
    sourceEvents: string[];
    sourceCollections: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ISemanticGovernanceAuditDocument
  extends ISemanticGovernanceAudit, Document {}

const semanticGovernanceAuditSchema =
  new Schema<ISemanticGovernanceAuditDocument>(
    {
      metric: { type: String, required: true, index: true },
      version: { type: String, required: true },
      lifecycleState: {
        type: String,
        enum: ["active", "deprecated", "retired"],
        default: "active",
        index: true,
      },
      owner: { type: String, required: true },
      changeType: {
        type: String,
        enum: ["created", "updated", "deprecated", "compatibility_review"],
        required: true,
      },
      compatibility: {
        type: String,
        enum: ["backward_compatible", "breaking", "unknown"],
        default: "backward_compatible",
      },
      summary: { type: String, required: true },
      lineage: {
        sourceMetrics: { type: [String], default: [] },
        sourceEvents: { type: [String], default: [] },
        sourceCollections: { type: [String], default: [] },
      },
    },
    { timestamps: true },
  );

semanticGovernanceAuditSchema.index({ metric: 1, version: 1, createdAt: -1 });

const SemanticGovernanceAuditModel = model<ISemanticGovernanceAuditDocument>(
  "SemanticGovernanceAudit",
  semanticGovernanceAuditSchema,
);

export default SemanticGovernanceAuditModel;
