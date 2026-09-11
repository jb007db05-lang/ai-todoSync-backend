/**
 * Activity/Audit domain MCP tools.
 * Read-only. Delegates to activityLogService.
 */

import toolRegistry from "../../registry/tool-registry.js";
import activityLogService from "../../../audit/services/activity-log.service.js";
import projectService from "../../../project/services/project.service.js";
import type { EntityType } from "../../../audit/models/activity-log.model.js";

toolRegistry.register({
  name: "activity:list_project",
  description:
    "List activity log entries for a project, newest first. Each entry records who performed what action on which entity and when. Useful for auditing changes and understanding project history.",
  domain: "activity",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: { type: "string" },
      entityType: {
        type: "string",
        enum: [
          "task",
          "project",
          "epic",
          "note",
          "comment",
          "member",
          "approval",
        ],
      },
      limit: { type: "number", minimum: 1, maximum: 100 },
      page: { type: "number", minimum: 1 },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const {
      projectId,
      entityType,
      limit = 50,
      page = 1,
    } = input as {
      projectId: string;
      entityType?: EntityType;
      limit?: number;
      page?: number;
    };
    await projectService.assertProjectMembership(userId, projectId);
    return activityLogService.getProjectActivities(projectId, {
      limit,
      page,
      entityType,
    });
  },
});

toolRegistry.register({
  name: "activity:recent",
  description:
    "Get recent activity across all of the user's projects (last 24 hours). Returns up to 100 entries ordered by newest first.",
  domain: "activity",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "number", minimum: 1, maximum: 100 },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId, input) => {
    const { limit = 50 } = input as { limit?: number };
    const projects = await projectService.fetchProjects(userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const allActivity = await Promise.all(
      projects.map((p) =>
        activityLogService
          .getProjectActivities(p.id, { limit: 20 })
          .then((r) =>
            r.activities.filter((a) => new Date(a.createdAt) >= since),
          )
          .catch(() => []),
      ),
    );

    const merged = allActivity
      .flat()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit);

    return { activities: merged, total: merged.length };
  },
});
