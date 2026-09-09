import logger from "../../../lib/logger.js";
import OperationalAnalyticsEventModel, {
  type OperationalEntityType,
  type OperationalEventName,
} from "../../../modules/analytics/models/operational-analytics-event.model.js";

interface RecordEventInput {
  eventName: OperationalEventName;
  entityType: OperationalEntityType;
  entityId: string;
  userId: string;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

class OperationalAnalyticsService {
  public async recordEvent(input: RecordEventInput): Promise<void> {
    await OperationalAnalyticsEventModel.create({
      eventName: input.eventName,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      projectId: input.projectId ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        semanticMeaning: this.semanticMeaning(input.eventName),
        analyticsUsefulness: this.analyticsUsefulness(input.eventName),
        explainabilityUsefulness: this.explainabilityUsefulness(
          input.eventName,
        ),
        semanticTags: this.semanticTags(input.eventName),
        workflowContext: this.workflowContext(input.eventName, input.metadata),
        timelineContext: this.timelineContext(input.eventName),
        contributorMetadata: this.contributorMetadata(
          input.eventName,
          input.metadata,
        ),
        operationalImpact: this.operationalImpact(
          input.eventName,
          input.metadata,
        ),
        actorContext: { userId: input.userId },
        projectContext: { projectId: input.projectId ?? null },
        causality: {
          source: "application_service",
          recordedAt: new Date().toISOString(),
          causalRole: this.causalRole(input.eventName),
          downstreamMetrics: this.downstreamMetrics(input.eventName),
        },
      },
    });
  }

  public recordEventSafely(input: RecordEventInput): void {
    void this.recordEvent(input).catch((error) => {
      logger.warn("Operational analytics event was not recorded", {
        eventName: input.eventName,
        entityType: input.entityType,
        entityId: input.entityId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }

  private semanticMeaning(eventName: OperationalEventName): string {
    const meanings: Partial<Record<OperationalEventName, string>> = {
      task_created: "New work entered operational system.",
      task_status_changed: "Task moved between workflow states.",
      task_assigned: "Task ownership changed to a member.",
      task_unassigned: "Task ownership removed from a member.",
      task_priority_changed: "Task urgency changed.",
      task_due_date_changed: "Task delivery expectation changed.",
      task_blocked: "Task execution became blocked.",
      task_unblocked: "Task execution blockage was removed.",
      task_completed: "Task reached done state.",
      task_reopened: "Completed task returned to active workflow.",
      workflow_stage_changed: "Work item moved through workflow stage.",
      review_requested: "Task entered review demand.",
      review_completed: "Task review finished.",
      task_escalated: "Task required escalation attention.",
      dependency_blocked: "Task became blocked by a dependency.",
      blocker_introduced:
        "Blocker entered workflow and increased downstream delivery risk.",
      blocker_propagated:
        "Blocker impact propagated to dependent operational work.",
      reassignment_spike:
        "Ownership churn crossed normal coordination threshold.",
      review_delay_introduced:
        "Review queue latency started affecting delivery confidence.",
      workflow_stall_detected:
        "Workflow stopped progressing within expected transition window.",
      execution_slowdown_detected:
        "Execution pace degraded against recent throughput baseline.",
      escalation_triggered: "Operational pressure triggered escalation.",
      throughput_collapse_detected:
        "Completion throughput fell materially below inflow.",
      dependency_bottleneck_detected:
        "Dependency pressure concentrated into a workflow bottleneck.",
      churn_threshold_crossed:
        "Assignment or priority churn exceeded stable-work threshold.",
      workflow_degradation_started:
        "Multiple negative signals began degrading workflow health.",
      overdue_accumulation_increased:
        "Past-due open work accumulated and increased delivery risk.",
      project_archived: "Project left active operational scope.",
      project_reactivated: "Project returned to active operational scope.",
      member_added: "Member gained project operational visibility.",
      member_removed: "Member lost project operational visibility.",
    };

    return (
      meanings[eventName] ??
      "Operational fact recorded for semantic intelligence."
    );
  }

  private analyticsUsefulness(eventName: OperationalEventName): string {
    if (eventName.includes("blocked")) {
      return "Supports blocker pressure, workflow friction, and delivery risk metrics.";
    }

    if (eventName.includes("completed") || eventName.includes("reopened")) {
      return "Supports throughput, completion, reopen, and execution health metrics.";
    }

    if (eventName.includes("assigned") || eventName.includes("member")) {
      return "Supports ownership, workload, and coordination metrics.";
    }

    return "Supports timeline reconstruction and operational trend analysis.";
  }

  private explainabilityUsefulness(eventName: OperationalEventName): string {
    return `Explains why ${eventName.replace(/_/g, " ")} affected operational state.`;
  }

  private semanticTags(eventName: OperationalEventName): string[] {
    const tags = new Set<string>(["operational_event"]);
    if (eventName.includes("blocked") || eventName.includes("blocker")) {
      tags.add("blocker");
      tags.add("propagation_risk");
    }
    if (eventName.includes("assigned") || eventName.includes("churn")) {
      tags.add("coordination");
      tags.add("ownership_churn");
    }
    if (eventName.includes("review")) {
      tags.add("review_latency");
      tags.add("quality_gate");
    }
    if (eventName.includes("slowdown") || eventName.includes("collapse")) {
      tags.add("throughput");
      tags.add("degradation");
    }
    if (eventName.includes("overdue") || eventName.includes("escalat")) {
      tags.add("delivery_pressure");
    }
    if (eventName.includes("completed") || eventName.includes("unblocked")) {
      tags.add("recovery");
    }

    return [...tags];
  }

  private workflowContext(
    eventName: OperationalEventName,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      stageBefore: metadata?.previousStatus ?? metadata?.previousStage ?? null,
      stageAfter: metadata?.nextStatus ?? metadata?.nextStage ?? null,
      transitionType: eventName.includes("review")
        ? "review"
        : eventName.includes("blocked") || eventName.includes("blocker")
          ? "blocking"
          : eventName.includes("assigned")
            ? "ownership"
            : "workflow",
      blockedByTaskId: metadata?.blockedByTaskId ?? null,
    };
  }

  private timelineContext(
    eventName: OperationalEventName,
  ): Record<string, unknown> {
    const impact = this.operationalImpact(eventName) as { score: number };
    return {
      narrativeRole: this.causalRole(eventName),
      replayPriority: impact.score >= 70 ? "high" : "normal",
      replayCategory: this.semanticTags(eventName).filter(
        (tag) => tag !== "operational_event",
      ),
    };
  }

  private contributorMetadata(
    eventName: OperationalEventName,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      contributorType:
        eventName.includes("blocked") || eventName.includes("blocker")
          ? "blocker"
          : eventName.includes("assigned")
            ? "ownership"
            : eventName.includes("review")
              ? "review"
              : "workflow",
      blockedByTaskId: metadata?.blockedByTaskId ?? null,
      priority: metadata?.priority ?? metadata?.nextPriority ?? null,
      dueDate: metadata?.nextDueDate ?? null,
    };
  }

  private operationalImpact(
    eventName: OperationalEventName,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    const scoreByPattern: Array<[RegExp, number]> = [
      [/collapse|degradation|bottleneck|propagated/, 90],
      [/blocked|blocker|escalat|overdue/, 80],
      [/reopened|churn|delay|stall|slowdown/, 70],
      [/priority|due_date|assigned|review_requested/, 55],
      [/completed|unblocked|review_completed/, 25],
    ];
    const score =
      scoreByPattern.find(([pattern]) => pattern.test(eventName))?.[1] ?? 40;

    return {
      score,
      severity: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
      polarity:
        eventName.includes("completed") || eventName.includes("unblocked")
          ? "positive"
          : "negative",
      confidence: metadata?.confidence ?? 70,
    };
  }

  private causalRole(eventName: OperationalEventName): string {
    if (eventName.includes("introduced") || eventName.includes("created")) {
      return "cause";
    }
    if (eventName.includes("propagated") || eventName.includes("changed")) {
      return "propagation";
    }
    if (eventName.includes("detected") || eventName.includes("crossed")) {
      return "derived_signal";
    }
    if (eventName.includes("completed") || eventName.includes("unblocked")) {
      return "recovery";
    }
    return "contributor";
  }

  private downstreamMetrics(eventName: OperationalEventName): string[] {
    if (eventName.includes("blocked") || eventName.includes("blocker")) {
      return ["delivery_risk", "workflow_friction", "blocker_pressure"];
    }
    if (eventName.includes("assigned") || eventName.includes("churn")) {
      return ["coordination_overhead", "assignment_churn", "review_latency"];
    }
    if (eventName.includes("review")) {
      return ["review_latency", "execution_confidence", "workflow_bottlenecks"];
    }
    if (eventName.includes("completed") || eventName.includes("started")) {
      return ["project_momentum", "execution_confidence", "throughput_decay"];
    }
    return ["operational_drift", "delivery_risk"];
  }
}

export default new OperationalAnalyticsService();
