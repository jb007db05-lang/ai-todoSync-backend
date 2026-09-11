/**
 * Intelligence domain MCP tools — composite tools that aggregate multiple services.
 * Designed to minimize the number of tool calls an AI needs to make for common workflows.
 */

import toolRegistry from "../../registry/tool-registry.js";
import taskService from "../../../task/services/task.service.js";
import slaService from "../../../task/services/sla.service.js";
import semanticIntelligenceService from "../../../ai/services/semantic-intelligence.service.js";
import semanticOperationalIntelligenceService from "../../../analytics/services/semantic-operational-intelligence.service.js";
import projectService from "../../../project/services/project.service.js";
import activityLogService from "../../../audit/services/activity-log.service.js";

toolRegistry.register({
  name: "intelligence:daily_context",
  description:
    "Get comprehensive daily work context for the authenticated user: today's tasks, high-priority open tasks, blocked tasks, SLA breaches, and SLA analytics. Designed as a single call for 'plan my day' workflows.",
  domain: "intelligence",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      date: { type: "string" },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const { date } = input as { date?: string };
    const today = date ?? new Date().toISOString().split("T")[0];

    const [allTasks, slaBreached, slaAnalytics] = await Promise.all([
      taskService.fetchTasks(userId, today),
      slaService.listBreachedTasks(userId).catch(() => []),
      slaService.getAnalytics(userId).catch(() => null),
    ]);

    const blockedTasks = allTasks.filter(
      (t) => t.isBlocked || t.status === "BLOCKED",
    );
    const highPriority = allTasks
      .filter(
        (t) =>
          (t.dynamicPriority === "HIGH" || t.dynamicPriority === "CRITICAL") &&
          t.status !== "DONE",
      )
      .sort((a, b) => b.dynamicPriorityScore - a.dynamicPriorityScore)
      .slice(0, 10);

    const summary = await taskService.getSummary(userId, today);

    return {
      date: today,
      summary,
      todaysTasks: allTasks,
      highPriorityTasks: highPriority,
      blockedTasks,
      slaBreachedCount: slaBreached.length,
      slaAnalytics,
    };
  },
});

toolRegistry.register({
  name: "intelligence:project_performance",
  description:
    "Get detailed project performance: health report (score, risks, recommendations, task breakdown) combined with operational intelligence explanation. Use for 'why is this project behind?' type questions.",
  domain: "intelligence",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: { type: "string" },
      metric: { type: "string" },
      timeRange: {
        type: "string",
        enum: [
          "today",
          "last_7_days",
          "last_30_days",
          "last_90_days",
          "all_time",
        ],
      },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const {
      projectId,
      metric = "project_health_score",
      timeRange = "last_30_days",
    } = input as { projectId: string; metric?: string; timeRange?: string };

    await projectService.assertProjectMembership(userId, projectId);

    const [healthReport, operationalExplanation] = await Promise.all([
      semanticIntelligenceService.generateReport(projectId),
      semanticOperationalIntelligenceService
        .explainMetric(userId, {
          metric,
          filters: { projectId },
          timeRange: timeRange as any,
        })
        .catch(() => null),
    ]);

    return { healthReport, operationalExplanation };
  },
});

toolRegistry.register({
  name: "intelligence:team_workload",
  description:
    "Get task distribution across team members in a project: count of tasks per user by status. Identifies overloaded or underloaded team members.",
  domain: "intelligence",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: { type: "string" },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const { projectId } = input as { projectId: string };
    await projectService.assertProjectMembership(userId, projectId);

    const [tasks, members] = await Promise.all([
      taskService.fetchTasks(userId),
      projectService.fetchProjectMembers(userId, projectId),
    ]);

    const projectTasks = tasks.filter((t) => t.projectId === projectId);

    const workloadMap = new Map<
      string,
      {
        userId: string;
        name: string | null;
        email: string;
        total: number;
        byStatus: Record<string, number>;
      }
    >();

    for (const member of members) {
      workloadMap.set(member.userId, {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        total: 0,
        byStatus: {},
      });
    }

    for (const task of projectTasks) {
      const assigneeId = task.assignedTo?.id;
      if (!assigneeId) continue;
      const entry = workloadMap.get(assigneeId);
      if (!entry) continue;
      entry.total += 1;
      entry.byStatus[task.status] = (entry.byStatus[task.status] ?? 0) + 1;
    }

    return {
      projectId,
      workload: Array.from(workloadMap.values()).sort(
        (a, b) => b.total - a.total,
      ),
    };
  },
});

toolRegistry.register({
  name: "intelligence:recent_project_changes",
  description:
    "Get a summary of what changed in a project recently: activity log entries from the specified period. Useful for 'what changed in X project yesterday?' questions.",
  domain: "intelligence",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: { type: "string" },
      hoursBack: { type: "number", minimum: 1, maximum: 168 },
      limit: { type: "number", minimum: 1, maximum: 100 },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const {
      projectId,
      hoursBack = 24,
      limit = 50,
    } = input as {
      projectId: string;
      hoursBack?: number;
      limit?: number;
    };
    await projectService.assertProjectMembership(userId, projectId);
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const result = await activityLogService.getProjectActivities(projectId, {
      limit: limit,
    });
    const filtered = result.activities.filter(
      (a) => new Date(a.createdAt) >= since,
    );
    return {
      projectId,
      since: since.toISOString(),
      changes: filtered,
      total: filtered.length,
    };
  },
});
