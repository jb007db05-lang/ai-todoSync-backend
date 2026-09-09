export type KeyStatus = "active" | "revoked";

export interface IAnalyticsKey {
  userId: string;
  name: string;
  hashedKey: string;
  keyHash: string;
  status: KeyStatus;
  allowedOrigins: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnalyticsEvent {
  keyId: string;
  userId?: string;
  sessionId: string;
  eventName: string;
  properties: Record<string, any>;
  timestamp: Date;
  sdkVersion?: string;
  context?: {
    library?: { name: string; version: string };
    page?: { url: string; referrer: string; title: string };
    device?: { browser: string; os: string; screen: string; language: string };
    ip?: string;
    geo?: { city?: string; country?: string; region?: string };
  };
}

export interface IAnalyticsLog {
  eventId: string;
  eventRef?: string;
  apiKeyId?: string;
  sdkIntegrationId: string;
  userIdentifier?: string;
  sessionId?: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface IAnalyticsUser {
  apiKeyId: string;
  userIdentifier: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export type OperationalEventName =
  | "task_created"
  | "task_updated"
  | "task_started"
  | "task_status_changed"
  | "task_assigned"
  | "task_unassigned"
  | "task_priority_changed"
  | "task_due_date_changed"
  | "task_blocked"
  | "task_unblocked"
  | "task_completed"
  | "task_reopened"
  | "task_overdue"
  | "task_archived"
  | "workflow_stage_changed"
  | "review_requested"
  | "review_completed"
  | "task_escalated"
  | "dependency_blocked"
  | "blocker_introduced"
  | "blocker_propagated"
  | "reassignment_spike"
  | "review_delay_introduced"
  | "workflow_stall_detected"
  | "execution_slowdown_detected"
  | "escalation_triggered"
  | "throughput_collapse_detected"
  | "dependency_bottleneck_detected"
  | "churn_threshold_crossed"
  | "workflow_degradation_started"
  | "overdue_accumulation_increased"
  | "project_created"
  | "project_archived"
  | "project_reactivated"
  | "member_added"
  | "member_removed"
  | "dashboard_opened";

export type OperationalEntityType =
  | "task"
  | "project"
  | "dashboard"
  | "member"
  | "workflow";

export interface IOperationalAnalyticsEvent {
  eventName: OperationalEventName;
  entityType: OperationalEntityType;
  entityId: string;
  userId: string;
  projectId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ISemanticRollupSnapshot {
  scopeType: "workspace" | "project";
  scopeId: string;
  period: "daily" | "weekly" | "monthly";
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
