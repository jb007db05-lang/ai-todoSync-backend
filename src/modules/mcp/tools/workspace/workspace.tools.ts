/**
 * Workspace domain MCP tools.
 * Read-only. Requires workspace:admin scope.
 */

import toolRegistry from "../../registry/tool-registry.js";
import workspaceService from "../../../workspace/services/workspace.service.js";

toolRegistry.register({
  name: "workspace:get",
  description:
    "Get details of a workspace: name, plan, member count, and settings. Requires workspace admin scope.",
  domain: "workspace",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId"],
    properties: {
      workspaceId: { type: "string" },
    },
  },
  requiredScope: "workspace:admin",
  risk: "read",
  handler: async (userId, input) => {
    const { workspaceId } = input as { workspaceId: string };
    return workspaceService.getWorkspaceDetails(userId, workspaceId);
  },
});

toolRegistry.register({
  name: "workspace:list_members",
  description:
    "List all members of a workspace with their roles and status. Requires workspace admin scope.",
  domain: "workspace",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId"],
    properties: {
      workspaceId: { type: "string" },
    },
  },
  requiredScope: "workspace:admin",
  risk: "read",
  handler: async (userId, input) => {
    const { workspaceId } = input as { workspaceId: string };
    const members = await workspaceService.listMembers(userId, workspaceId);
    return { members };
  },
});

toolRegistry.register({
  name: "workspace:list_mine",
  description: "List all workspaces the authenticated user belongs to.",
  domain: "workspace",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  requiredScope: "work:read",
  risk: "read",
  handler: async (userId) => {
    const workspaces = await workspaceService.listUserWorkspaces(userId);
    return { workspaces };
  },
});
