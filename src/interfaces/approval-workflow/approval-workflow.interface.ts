import type { Types } from "mongoose";

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
