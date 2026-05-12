import { connectDatabase, disconnectDatabase } from "../config/db.config.js";
import logger from "../lib/logger.js";
import OperationalAnalyticsEventModel, {
  type OperationalEntityType,
  type OperationalEventName,
} from "../models/operational-analytics-event.model.js";

interface ScenarioEvent {
  eventName: OperationalEventName;
  entityType: OperationalEntityType;
  entityId: string;
  offsetHours: number;
  metadata: Record<string, unknown>;
}

const userId = process.env.SEMANTIC_SEED_USER_ID;
const projectId = process.env.SEMANTIC_SEED_PROJECT_ID;

// ─────────────────────────────────────────────────────────────
// SCENARIO 1: Delivery Collapse with Recovery
// Blocker enters, propagates, review queue stalls, throughput
// collapses. Recovery starts after ~10h.
// ─────────────────────────────────────────────────────────────
const deliveryCollapseScenario: ScenarioEvent[] = [
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-task-1",
    offsetHours: -192,
    metadata: {
      semanticMeaning: "New dependency-heavy work entered workflow.",
      inflowBatch: "collapse-seed",
      status: "TODO",
      priority: "HIGH",
    },
  },
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-task-2",
    offsetHours: -190,
    metadata: {
      inflowBatch: "collapse-seed",
      status: "TODO",
      priority: "MEDIUM",
    },
  },
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-task-3",
    offsetHours: -188,
    metadata: {
      inflowBatch: "collapse-seed",
      status: "TODO",
      priority: "MEDIUM",
    },
  },
  {
    eventName: "task_started",
    entityType: "task",
    entityId: "seed-task-1",
    offsetHours: -186,
    metadata: {
      previousStatus: "TODO",
      nextStatus: "IN_PROGRESS",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "dependency_blocked",
    entityType: "task",
    entityId: "seed-task-1",
    offsetHours: -178,
    metadata: {
      blockedByTaskId: "seed-task-0",
      semanticMeaning: "Dependency bottleneck introduced delivery risk.",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "blocker_introduced",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -176,
    metadata: {
      contributors: ["seed-task-1"],
      confidence: 84,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_assigned",
    entityType: "task",
    entityId: "seed-task-2",
    offsetHours: -168,
    metadata: {
      previousAssigneeId: "seed-user-a",
      nextAssigneeId: "seed-user-b",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_assigned",
    entityType: "task",
    entityId: "seed-task-2",
    offsetHours: -160,
    metadata: {
      previousAssigneeId: "seed-user-b",
      nextAssigneeId: "seed-user-c",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "reassignment_spike",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -158,
    metadata: {
      contributorCount: 4,
      confidence: 78,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_requested",
    entityType: "task",
    entityId: "seed-task-3",
    offsetHours: -150,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "IN_REVIEW",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_delay_introduced",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -140,
    metadata: {
      reviewQueueDepth: 5,
      confidence: 81,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "blocker_propagated",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -128,
    metadata: {
      affectedTaskIds: ["seed-task-1", "seed-task-2", "seed-task-3"],
      confidence: 86,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "throughput_collapse_detected",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -116,
    metadata: {
      created: 9,
      completed: 2,
      confidence: 88,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "overdue_accumulation_increased",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -110,
    metadata: {
      overdueCount: 6,
      staleCount: 4,
      confidence: 82,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "workflow_degradation_started",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -104,
    metadata: {
      causes: [
        "blocker_propagated",
        "review_delay_introduced",
        "throughput_collapse_detected",
      ],
      confidence: 90,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-task-4",
    offsetHours: -40,
    metadata: {
      semanticMeaning:
        "Recovery completion reduced pressure after degradation chain.",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_completed",
    entityType: "task",
    entityId: "seed-task-3",
    offsetHours: -32,
    metadata: {
      previousStatus: "IN_REVIEW",
      nextStatus: "DONE",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-task-3",
    offsetHours: -30,
    metadata: { inflowBatch: "collapse-seed" },
  },
];

// ─────────────────────────────────────────────────────────────
// SCENARIO 2: Escalation Storm
// Multiple tasks escalated, priorities churned, coordination
// overhead spikes. Feeds escalation_frequency and assignment_churn.
// ─────────────────────────────────────────────────────────────
const escalationStormScenario: ScenarioEvent[] = [
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -144,
    metadata: {
      inflowBatch: "collapse-seed",
      priority: "MEDIUM",
      status: "IN_PROGRESS",
    },
  },
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-esc-2",
    offsetHours: -143,
    metadata: { inflowBatch: "collapse-seed", priority: "LOW", status: "TODO" },
  },
  {
    eventName: "task_priority_changed",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -136,
    metadata: {
      previousPriority: "MEDIUM",
      nextPriority: "HIGH",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_escalated",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -136,
    metadata: {
      previousPriority: "MEDIUM",
      nextPriority: "HIGH",
      escalationTrigger: "priority_escalation",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_priority_changed",
    entityType: "task",
    entityId: "seed-esc-2",
    offsetHours: -128,
    metadata: {
      previousPriority: "LOW",
      nextPriority: "HIGH",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_escalated",
    entityType: "task",
    entityId: "seed-esc-2",
    offsetHours: -128,
    metadata: {
      previousPriority: "LOW",
      nextPriority: "HIGH",
      escalationTrigger: "priority_escalation",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "escalation_triggered",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -126,
    metadata: {
      escalatedTaskCount: 2,
      confidence: 85,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_assigned",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -120,
    metadata: {
      previousAssigneeId: "seed-user-a",
      nextAssigneeId: "seed-user-d",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_assigned",
    entityType: "task",
    entityId: "seed-esc-2",
    offsetHours: -118,
    metadata: {
      previousAssigneeId: "seed-user-b",
      nextAssigneeId: "seed-user-d",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "churn_threshold_crossed",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -115,
    metadata: { churnEvents: 5, confidence: 79, inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_due_date_changed",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -110,
    metadata: {
      previousDueDate: "2026-04-01",
      nextDueDate: "2026-04-07",
      inflowBatch: "collapse-seed",
    },
  },
];

// ─────────────────────────────────────────────────────────────
// SCENARIO 3: Review Bottleneck
// Review queue fills up. Completions stall because tasks pile
// in IN_REVIEW. Feeds review_latency and workflow_stagnation.
// ─────────────────────────────────────────────────────────────
const reviewBottleneckScenario: ScenarioEvent[] = [
  {
    eventName: "review_requested",
    entityType: "task",
    entityId: "seed-review-1",
    offsetHours: -96,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "IN_REVIEW",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_requested",
    entityType: "task",
    entityId: "seed-review-2",
    offsetHours: -92,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "IN_REVIEW",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_requested",
    entityType: "task",
    entityId: "seed-review-3",
    offsetHours: -88,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "IN_REVIEW",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_requested",
    entityType: "task",
    entityId: "seed-review-4",
    offsetHours: -84,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "IN_REVIEW",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "review_delay_introduced",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -80,
    metadata: {
      reviewQueueDepth: 4,
      confidence: 87,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "workflow_stall_detected",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -72,
    metadata: {
      stalledTaskCount: 4,
      confidence: 82,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "dependency_bottleneck_detected",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -68,
    metadata: {
      bottleneckStage: "IN_REVIEW",
      queueSize: 4,
      confidence: 85,
      inflowBatch: "collapse-seed",
    },
  },
  // Eventually one review completes
  {
    eventName: "review_completed",
    entityType: "task",
    entityId: "seed-review-1",
    offsetHours: -48,
    metadata: {
      previousStatus: "IN_REVIEW",
      nextStatus: "DONE",
      reviewDurationHours: 48,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-review-1",
    offsetHours: -47,
    metadata: { inflowBatch: "collapse-seed" },
  },
];

// ─────────────────────────────────────────────────────────────
// SCENARIO 4: Blocker Cascade (Dependency Chain Collapse)
// Task A blocked → blocks B → blocks C → chain propagation.
// Feeds blocker_pressure, dependency_pressure, delivery_risk.
// ─────────────────────────────────────────────────────────────
const blockerCascadeScenario: ScenarioEvent[] = [
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-blocker-a",
    offsetHours: -72,
    metadata: {
      inflowBatch: "collapse-seed",
      priority: "HIGH",
      status: "IN_PROGRESS",
    },
  },
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-blocker-b",
    offsetHours: -71,
    metadata: {
      inflowBatch: "collapse-seed",
      priority: "HIGH",
      status: "TODO",
    },
  },
  {
    eventName: "task_created",
    entityType: "task",
    entityId: "seed-blocker-c",
    offsetHours: -70,
    metadata: {
      inflowBatch: "collapse-seed",
      priority: "MEDIUM",
      status: "TODO",
    },
  },
  {
    eventName: "task_blocked",
    entityType: "task",
    entityId: "seed-blocker-a",
    offsetHours: -65,
    metadata: {
      previousStatus: "IN_PROGRESS",
      nextStatus: "BLOCKED",
      blockedByTaskId: "seed-external-dep",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "dependency_blocked",
    entityType: "task",
    entityId: "seed-blocker-b",
    offsetHours: -63,
    metadata: {
      blockedByTaskId: "seed-blocker-a",
      semanticMeaning: "Downstream dependency cascade.",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "blocker_introduced",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -62,
    metadata: {
      contributors: ["seed-blocker-a", "seed-blocker-b"],
      confidence: 88,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "dependency_blocked",
    entityType: "task",
    entityId: "seed-blocker-c",
    offsetHours: -60,
    metadata: {
      blockedByTaskId: "seed-blocker-b",
      semanticMeaning: "Third-level cascade block.",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "blocker_propagated",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -58,
    metadata: {
      affectedTaskIds: ["seed-blocker-a", "seed-blocker-b", "seed-blocker-c"],
      confidence: 91,
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "execution_slowdown_detected",
    entityType: "workflow",
    entityId: "seed-workflow-collapse",
    offsetHours: -54,
    metadata: {
      slowdownFactor: 3,
      confidence: 84,
      inflowBatch: "collapse-seed",
    },
  },
];

// ─────────────────────────────────────────────────────────────
// SCENARIO 5: Recovery Period
// After sustained degradation, blockers are resolved. Tasks
// complete in rapid succession. Momentum rebuilds.
// ─────────────────────────────────────────────────────────────
const recoveryPeriodScenario: ScenarioEvent[] = [
  {
    eventName: "task_unblocked",
    entityType: "task",
    entityId: "seed-blocker-a",
    offsetHours: -24,
    metadata: {
      previousStatus: "BLOCKED",
      nextStatus: "TODO",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_started",
    entityType: "task",
    entityId: "seed-blocker-a",
    offsetHours: -23,
    metadata: {
      previousStatus: "TODO",
      nextStatus: "IN_PROGRESS",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-blocker-a",
    offsetHours: -18,
    metadata: { inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_unblocked",
    entityType: "task",
    entityId: "seed-blocker-b",
    offsetHours: -17,
    metadata: {
      previousStatus: "BLOCKED",
      nextStatus: "TODO",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_started",
    entityType: "task",
    entityId: "seed-blocker-b",
    offsetHours: -16,
    metadata: {
      previousStatus: "TODO",
      nextStatus: "IN_PROGRESS",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-blocker-b",
    offsetHours: -12,
    metadata: {
      semanticMeaning: "Cascade resolution — unblock B completes.",
      inflowBatch: "collapse-seed",
    },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-review-2",
    offsetHours: -10,
    metadata: { inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-review-3",
    offsetHours: -8,
    metadata: { inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-esc-1",
    offsetHours: -6,
    metadata: { inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-esc-2",
    offsetHours: -4,
    metadata: { inflowBatch: "collapse-seed" },
  },
  {
    eventName: "task_completed",
    entityType: "task",
    entityId: "seed-blocker-c",
    offsetHours: -2,
    metadata: {
      semanticMeaning:
        "Final cascade task resolved — full recovery chain complete.",
      inflowBatch: "collapse-seed",
    },
  },
];

const allScenarioEvents: ScenarioEvent[] = [
  ...deliveryCollapseScenario,
  ...escalationStormScenario,
  ...reviewBottleneckScenario,
  ...blockerCascadeScenario,
  ...recoveryPeriodScenario,
];

const seedSemanticOperationalScenarios = async (): Promise<void> => {
  if (!userId || !projectId) {
    throw new Error(
      "Set SEMANTIC_SEED_USER_ID and SEMANTIC_SEED_PROJECT_ID before seeding semantic scenarios",
    );
  }

  await connectDatabase();

  try {
    const now = Date.now();

    // Clear previous seed batch cleanly
    await OperationalAnalyticsEventModel.deleteMany({
      userId,
      projectId,
      "metadata.inflowBatch": "collapse-seed",
    }).exec();

    await OperationalAnalyticsEventModel.insertMany(
      allScenarioEvents.map((event) => ({
        eventName: event.eventName,
        entityType: event.entityType,
        entityId: event.entityId,
        userId,
        projectId,
        metadata: {
          scenario: "multi_scenario_semantic_seed",
          inflowBatch: "collapse-seed",
          semanticMeaning:
            typeof event.metadata.semanticMeaning === "string"
              ? event.metadata.semanticMeaning
              : `${event.eventName.replace(/_/g, " ")} recorded for semantic intelligence.`,
          analyticsUsefulness: "semantic_seed_for_replay_anomaly_trend_testing",
          explainabilityUsefulness: `Explains how ${event.eventName.replace(/_/g, " ")} contributed to operational state.`,
          semanticTags: ["semantic_seed", "operational_event"],
          ...event.metadata,
        },
        createdAt: new Date(now + event.offsetHours * 60 * 60 * 1000),
      })),
    );

    logger.info("Semantic operational scenario seed complete", {
      eventCount: allScenarioEvents.length,
      scenarios: [
        "delivery_collapse_with_recovery",
        "escalation_storm",
        "review_bottleneck",
        "blocker_cascade",
        "recovery_period",
      ],
      userId,
      projectId,
    });
  } finally {
    await disconnectDatabase();
  }
};

void seedSemanticOperationalScenarios().catch((error) => {
  logger.error(
    "Semantic operational scenario seed failed",
    error instanceof Error ? error : new Error("Unknown semantic seed error"),
  );
  process.exit(1);
});
