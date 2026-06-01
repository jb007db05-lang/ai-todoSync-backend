import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalAction =
  | "PRIORITY_CHANGE"
  | "DYNAMIC_PRIORITY_ESCALATION"
  | "RETENTION_POLICY_CHANGE"
  | "LEGAL_HOLD_CHANGE";

export interface ISignOffStep {
  order: number;
  approverUserId: Types.ObjectId | string;
  status: ApprovalStatus;
  decidedAt?: Date | null;
  note?: string;
}

export interface IApprovalWorkflow {
  projectId: Types.ObjectId | string;
  taskId?: Types.ObjectId | string | null;
  requestedBy: Types.ObjectId | string;
  action: ApprovalAction;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  reason: string;
  signOffChain: ISignOffStep[];
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IApprovalWorkflowDocument
  extends IApprovalWorkflow, Document {}

const signOffStepSchema = new Schema<ISignOffStep>(
  {
    order: { type: Number, required: true },
    approverUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },
    decidedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const approvalWorkflowSchema = new Schema<IApprovalWorkflowDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: [
        "PRIORITY_CHANGE",
        "DYNAMIC_PRIORITY_ESCALATION",
        "RETENTION_POLICY_CHANGE",
        "LEGAL_HOLD_CHANGE",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: "" },
    signOffChain: { type: [signOffStepSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

approvalWorkflowSchema.index({ projectId: 1, status: 1, createdAt: -1 });

const ApprovalWorkflowModel = model<IApprovalWorkflowDocument>(
  "ApprovalWorkflow",
  approvalWorkflowSchema,
);

export default ApprovalWorkflowModel;
