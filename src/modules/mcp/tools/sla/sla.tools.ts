/**
 * SLA domain MCP tools.
 * All read-only. Delegates to slaService. SLA calculations remain authoritative server-side.
 */

import toolRegistry from "../../registry/tool-registry.js";
import slaService from "../../../task/services/sla.service.js";

toolRegistry.register({
  name: "sla:get_task_status",
  description:
    "Get the SLA status for a specific task: response/resolution due dates, breach flags, remaining time in milliseconds, and current SLA state.",
  domain: "sla",
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
    return slaService.getTaskStatus(taskId, userId);
  },
});

toolRegistry.register({
  name: "sla:list_breached",
  description:
    "List all tasks that have breached their SLA (response or resolution), sorted by priority and resolution due date. Use to identify SLA violations requiring immediate attention.",
  domain: "sla",
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
    const { limit = 20 } = input as { limit?: number };
    const tasks = await slaService.listBreachedTasks(userId);
    return {
      tasks: tasks.slice(0, limit).map((t) => ({
        id: t._id.toString(),
        title: t.title,
        priority: t.priority,
        status: t.status,
        responseBreached: t.responseBreached,
        resolutionBreached: t.resolutionBreached,
        slaResolutionDueAt: t.slaResolutionDueAt?.toISOString() ?? null,
        projectId: t.projectId?.toString() ?? null,
      })),
      total: tasks.length,
    };
  },
});

toolRegistry.register({
  name: "sla:get_analytics",
  description:
    "Get SLA analytics: total breached tasks, breach rate by priority, average resolution time, and response/resolution compliance percentages.",
  domain: "sla",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId) => slaService.getAnalytics(userId),
});

toolRegistry.register({
  name: "sla:get_configs",
  description:
    "Get the current SLA configuration for each priority level: response time hours and resolution time hours.",
  domain: "sla",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId) => {
    const configs = await slaService.getConfigs(userId);
    return { configs };
  },
});
