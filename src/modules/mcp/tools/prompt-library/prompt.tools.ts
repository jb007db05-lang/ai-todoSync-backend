/**
 * Prompt Library domain MCP tools.
 * Allows AI clients to discover, read, and render prompts from the workspace prompt library.
 */

import toolRegistry from "../../registry/tool-registry.js";
import promptService from "../../../prompt/services/prompt.service.js";
import workspaceService from "../../../workspace/services/workspace.service.js";

// Helper: resolve workspace ID for user
async function resolveWorkspaceId(
  userId: string,
  workspaceId?: string,
): Promise<string> {
  if (workspaceId) return workspaceId;
  const ws = await workspaceService.getOrCreateDefaultWorkspace(userId);
  return ws._id.toString();
}

toolRegistry.register({
  name: "prompt:list",
  description:
    "List prompts in the workspace prompt library accessible to the authenticated user. Optionally filter by category, folder, or search query.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      workspaceId: { type: "string" },
      category: { type: "string" },
      folderId: { type: "string" },
      search: { type: "string", maxLength: 200 },
      isTemplate: { type: "boolean" },
      isFavorite: { type: "boolean" },
    },
  },
  requiredScope: "prompt:read",
  risk: "read",
  handler: async (userId, input) => {
    const { workspaceId, ...options } = input as {
      workspaceId?: string;
      category?: string;
      folderId?: string;
      search?: string;
      isTemplate?: boolean;
      isFavorite?: boolean;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    const prompts = await promptService.listPrompts(wsId, userId, options);
    return { prompts };
  },
});

toolRegistry.register({
  name: "prompt:get",
  description:
    "Get full details of a single prompt by ID: body, variables, version, tags, and metadata.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["promptId"],
    properties: {
      promptId: { type: "string" },
      workspaceId: { type: "string" },
    },
  },
  requiredScope: "prompt:read",
  risk: "read",
  handler: async (userId, input) => {
    const { promptId, workspaceId } = input as {
      promptId: string;
      workspaceId?: string;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    return promptService.getPromptDetails(wsId, userId, promptId);
  },
});

toolRegistry.register({
  name: "prompt:list_versions",
  description:
    "List all versions of a prompt with their bodies and change summaries.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["promptId"],
    properties: {
      promptId: { type: "string" },
      workspaceId: { type: "string" },
    },
  },
  requiredScope: "prompt:read",
  risk: "read",
  handler: async (userId, input) => {
    const { promptId, workspaceId } = input as {
      promptId: string;
      workspaceId?: string;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    const versions = await promptService.getPromptVersions(
      wsId,
      userId,
      promptId,
    );
    return { versions };
  },
});

toolRegistry.register({
  name: "prompt:compare_versions",
  description:
    "Compare two versions of a prompt side by side. Returns a structured diff of body changes.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["promptId", "versionA", "versionB"],
    properties: {
      promptId: { type: "string" },
      versionA: { type: "number" },
      versionB: { type: "number" },
      workspaceId: { type: "string" },
    },
  },
  requiredScope: "prompt:read",
  risk: "read",
  handler: async (userId, input) => {
    const { promptId, versionA, versionB, workspaceId } = input as {
      promptId: string;
      versionA: number;
      versionB: number;
      workspaceId?: string;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    return promptService.comparePromptVersions(
      wsId,
      userId,
      promptId,
      versionA,
      versionB,
    );
  },
});

toolRegistry.register({
  name: "prompt:render",
  description:
    "Render a prompt by substituting variable values. Returns the resolved prompt text without executing it. Use to preview how a prompt will look with specific variable values.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["promptId"],
    properties: {
      promptId: { type: "string" },
      workspaceId: { type: "string" },
      variables: {
        type: "object",
      },
    },
  },
  requiredScope: "prompt:read",
  risk: "read",
  handler: async (userId, input) => {
    const { promptId, workspaceId, variables } = input as {
      promptId: string;
      workspaceId?: string;
      variables?: Record<string, unknown>;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    const prompt = await promptService.getPromptDetails(wsId, userId, promptId);
    const rendered = promptService.substituteVariables(
      prompt.body as string,
      (prompt.variables as any) ?? [],
      variables ?? {},
    );
    return { promptId, rendered };
  },
});

toolRegistry.register({
  name: "prompt:run_playground",
  description:
    "Execute a prompt through the AI playground with given variable values. Returns the AI-generated output, model metadata, and token usage. Use to test prompts from the library.",
  domain: "prompt-library",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      promptId: { type: "string" },
      workspaceId: { type: "string" },
      variables: { type: "object" },
      modelName: { type: "string" },
      provider: { type: "string", enum: ["gemini", "openai", "anthropic"] },
    },
  },
  requiredScope: "prompt:write",
  risk: "write",
  handler: async (userId, input) => {
    const { workspaceId, ...playgroundPayload } = input as {
      workspaceId?: string;
      [k: string]: unknown;
    };
    const wsId = await resolveWorkspaceId(userId, workspaceId);
    return promptService.runPlayground(wsId, userId, playgroundPayload as any);
  },
});
