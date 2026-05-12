import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

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

export interface IOperationalAnalyticsEventDocument
  extends IOperationalAnalyticsEvent, Document {}

const operationalAnalyticsEventSchema =
  new Schema<IOperationalAnalyticsEventDocument>(
    {
      eventName: {
        type: String,
        required: true,
        enum: [
          "task_created",
          "task_updated",
          "task_started",
          "task_status_changed",
          "task_assigned",
          "task_unassigned",
          "task_priority_changed",
          "task_due_date_changed",
          "task_blocked",
          "task_unblocked",
          "task_completed",
          "task_reopened",
          "task_overdue",
          "task_archived",
          "workflow_stage_changed",
          "review_requested",
          "review_completed",
          "task_escalated",
          "dependency_blocked",
          "blocker_introduced",
          "blocker_propagated",
          "reassignment_spike",
          "review_delay_introduced",
          "workflow_stall_detected",
          "execution_slowdown_detected",
          "escalation_triggered",
          "throughput_collapse_detected",
          "dependency_bottleneck_detected",
          "churn_threshold_crossed",
          "workflow_degradation_started",
          "overdue_accumulation_increased",
          "project_created",
          "project_archived",
          "project_reactivated",
          "member_added",
          "member_removed",
          "dashboard_opened",
        ],
        index: true,
      },
      entityType: {
        type: String,
        required: true,
        enum: ["task", "project", "dashboard", "member", "workflow"],
        index: true,
      },
      entityId: { type: String, required: true, index: true },
      userId: { type: String, required: true, index: true },
      projectId: { type: String, default: null, index: true },
      metadata: { type: Schema.Types.Mixed, default: {} },
    },
    {
      timestamps: { createdAt: true, updatedAt: false },
    },
  );

operationalAnalyticsEventSchema.index({ eventName: 1, createdAt: -1 });
operationalAnalyticsEventSchema.index({ userId: 1, createdAt: -1 });
operationalAnalyticsEventSchema.index({ projectId: 1, createdAt: -1 });
operationalAnalyticsEventSchema.index({
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});

const OperationalAnalyticsEventModel =
  model<IOperationalAnalyticsEventDocument>(
    "OperationalAnalyticsEvent",
    operationalAnalyticsEventSchema,
  );

export default OperationalAnalyticsEventModel;
