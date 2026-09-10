import type { Types } from "mongoose";

export type EntityType = "project" | "epic" | "task" | "subtask" | "note";
export type ActionType =
  | "created"
  | "updated"
  | "deleted"
  | "assigned"
  | "status_changed"
  | "member_added"
  | "member_removed"
  | "approved"
  | "rejected"
  | "escalated";

export interface IFieldChange {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface IActivityLog {
  projectId: string;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActionType;
  userId: string;
  userName: string;
  changes: IFieldChange[];
  description: string;
  metadata?: Record<string, unknown>;
  immutableHash: string;
  previousHash?: string | null;
  sequence: number;
  retentionUntil?: Date | null;
  legalHold: boolean;
  approvalId?: string | null;
  createdAt: Date;
}

/** @deprecated Retention policy is now embedded as Project.audit — no separate collection. */
export interface IAuditRetentionPolicy {
  projectId: Types.ObjectId | string;
  retentionDays: number;
  legalHold: boolean;
  updatedBy?: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

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
