/**
 * Priority domain MCP tools.
 * All read-only. Delegates to priorityEngineService.
 * The LLM must not replace backend-derived priority calculations.
 */

import toolRegistry from "../../registry/tool-registry.js";
import priorityEngineService from "../../../task/services/priority-engine.service.js";
import taskService from "../../../task/services/task.service.js";

toolRegistry.register({
  name: "priority:evaluate_task",
  description:
    "Get the current priority evaluation for a task: base priority, dynamic priority, urgency score, impact score, dependency weight, and the reason for any escalation. The priority engine is authoritative.",
  domain: "priority",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["taskId"],
    properties: {
      taskId: { type: "string" },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) => {
    const { taskId } = input as { taskId: string };
    return priorityEngineService.evaluateTaskForUser(taskId, userId);
  },
});

toolRegistry.register({
  name: "priority:get_highest",
  description:
    "Get the top open tasks sorted by dynamic priority score descending. Use to understand what should be worked on first.",
  domain: "priority",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "number", minimum: 1, maximum: 50 },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) => {
    const { limit = 10 } = input as { limit?: number };
    const tasks = await taskService.fetchTasks(userId);
    const sorted = tasks
      .filter((t) => t.status !== "DONE" && t.status !== "rolled_over")
      .sort((a, b) => b.dynamicPriorityScore - a.dynamicPriorityScore)
      .slice(0, limit);
    return { tasks: sorted, total: sorted.length };
  },
});

toolRegistry.register({
  name: "priority:explain",
  description:
    "Get a detailed explanation of why a task has its current priority. Returns urgency score, impact score, dependency weight, escalation reason, and contributing factors.",
  domain: "priority",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["taskId"],
    properties: {
      taskId: { type: "string" },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) => {
    const { taskId } = input as { taskId: string };
    const evaluation = await priorityEngineService.evaluateTaskForUser(
      taskId,
      userId,
    );
    return {
      taskId: evaluation.taskId,
      basePriority: evaluation.basePriority,
      dynamicPriority: evaluation.dynamicPriority,
      dynamicPriorityScore: evaluation.dynamicPriorityScore,
      reason: evaluation.reason,
      factors: {
        urgency: {
          score: evaluation.urgencyScore,
          weight: "45%",
          explanation:
            "Derived from task age, due date proximity, and rollover count",
        },
        impact: {
          score: evaluation.impactScore,
          weight: "35%",
          explanation:
            "Based on downstream task count and task importance signals",
        },
        dependency: {
          weight: evaluation.dependencyWeight,
          contribution: "20%",
          explanation: `This task has ${evaluation.downstreamTaskCount} downstream task(s) blocked on it`,
        },
      },
    };
  },
});
