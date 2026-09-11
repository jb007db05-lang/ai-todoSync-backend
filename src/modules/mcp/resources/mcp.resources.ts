/**
 * MCP Resources — structured data objects an AI can reference.
 * Served via GET /api/mcp/resources/:type/:id
 */

import projectService from "../../project/services/project.service.js";
import taskService from "../../task/services/task.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import semanticIntelligenceService from "../../ai/services/semantic-intelligence.service.js";
import slaService from "../../task/services/sla.service.js";
import priorityEngineService from "../../task/services/priority-engine.service.js";
import { McpError } from "../errors/mcp-error.js";

export type ResourceType = "workspace" | "project" | "task";

export interface McpResource {
  type: ResourceType;
  id: string;
  uri: string;
  name: string;
  description: string;
  data: unknown;
  fetchedAt: string;
}

export async function fetchResource(
  resourceType: ResourceType,
  resourceId: string,
  userId: string,
): Promise<McpResource> {
  const fetchedAt = new Date().toISOString();

  switch (resourceType) {
    case "workspace": {
      const ws = await workspaceService
        .getWorkspaceDetails(userId, resourceId)
        .catch(() => null);
      if (!ws)
        throw new McpError("not_found", `Workspace ${resourceId} not found`);
      return {
        type: "workspace",
        id: resourceId,
        uri: `workspace/${resourceId}`,
        name: (ws as any).name ?? "Workspace",
        description: "Workspace overview including members and settings",
        data: ws,
        fetchedAt,
      };
    }

    case "project": {
      const [access, healthReport, slaAnalytics] = await Promise.all([
        projectService.getProjectAccess(userId, resourceId).catch(() => null),
        semanticIntelligenceService
          .generateReport(resourceId)
          .catch(() => null),
        slaService.getAnalytics(userId).catch(() => null),
      ]);
      if (!access)
        throw new McpError(
          "not_found",
          `Project ${resourceId} not found or not accessible`,
        );
      return {
        type: "project",
        id: resourceId,
        uri: `project/${resourceId}`,
        name: access.project.name,
        description: access.project.description ?? "",
        data: {
          project: access.project,
          role: access.role,
          healthReport,
          slaAnalytics,
        },
        fetchedAt,
      };
    }

    case "task": {
      const tasks = await taskService.fetchTasks(userId);
      const task = tasks.find((t) => t.id === resourceId);
      if (!task)
        throw new McpError("not_found", `Task ${resourceId} not found`);

      const [slaStatus, priorityEval] = await Promise.all([
        slaService.getTaskStatus(resourceId, userId).catch(() => null),
        priorityEngineService
          .evaluateTaskForUser(resourceId, userId)
          .catch(() => null),
      ]);

      return {
        type: "task",
        id: resourceId,
        uri: `task/${resourceId}`,
        name: task.title,
        description: task.description ?? "",
        data: { task, slaStatus, priorityEval },
        fetchedAt,
      };
    }

    default:
      throw new McpError(
        "not_found",
        `Unknown resource type: ${String(resourceType)}. Supported: workspace, project, task`,
      );
  }
}
