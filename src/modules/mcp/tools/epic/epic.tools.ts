/**
 * Work Management — Epic domain MCP tools.
 */

import toolRegistry from "../../registry/tool-registry.js";
import epicService from "../../../epic/services/epic.service.js";
import projectService from "../../../project/services/project.service.js";

toolRegistry.register({
  name: "epic:list",
  description:
    "List all epics in a project. Returns epic names, descriptions, and ordering.",
  domain: "epic",
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
    const epics = await epicService.fetchProjectEpics(userId, projectId);
    return { epics };
  },
});

toolRegistry.register({
  name: "epic:get",
  description: "Get details of a single epic by ID.",
  domain: "epic",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["epicId"],
    properties: {
      epicId: { type: "string" },
    },
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (_userId, input) => {
    const { epicId } = input as { epicId: string };
    const epic = await epicService.getEpicById(epicId);
    if (!epic) {
      const err = new Error("Epic not found");
      (err as any).status = 404;
      throw err;
    }
    return epic;
  },
});

toolRegistry.register({
  name: "epic:create",
  description:
    "Create a new epic in a project. Requires MEMBER or higher role.",
  domain: "epic",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId", "name"],
    properties: {
      projectId: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000 },
    },
  },
  requiredScope: "work:write",
  risk: "write",
  handler: async (userId, input) => {
    const { projectId, name, description } = input as {
      projectId: string;
      name: string;
      description?: string;
    };
    return epicService.createEpic(projectId, userId, { name, description });
  },
});

toolRegistry.register({
  name: "epic:update",
  description: "Update an epic's name or description.",
  domain: "epic",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["epicId", "projectId"],
    properties: {
      epicId: { type: "string" },
      projectId: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000 },
    },
  },
  requiredScope: "work:write",
  risk: "write",
  handler: async (userId, input) => {
    const { epicId, projectId, ...updates } = input as {
      epicId: string;
      projectId: string;
      [k: string]: unknown;
    };
    return epicService.updateEpic(epicId, projectId, userId, updates as any);
  },
});
