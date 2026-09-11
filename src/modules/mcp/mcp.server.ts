/**
 * MCP Server Bootstrap.
 * Imports all domain tool files (triggering self-registration into the registry),
 * then exports the request handler used by the MCP router.
 */

import toolRegistry from "./registry/tool-registry.js";
import { checkConfirmation } from "./registry/risk-policy.js";
import { validateInput } from "./validation/schema-validator.js";
import { mapDomainError, McpError } from "./errors/mcp-error.js";
import type { McpScope } from "./registry/tool-types.js";
import type { McpToolCallResult } from "./registry/tool-types.js";
import logger from "../../lib/logger.js";

// --- Domain tool imports (self-register into toolRegistry at import time) ---
import "./tools/analytics/analytics.tools.js";
import "./tools/task/task.tools.js";
import "./tools/project/project.tools.js";
import "./tools/epic/epic.tools.js";
import "./tools/sla/sla.tools.js";
import "./tools/priority/priority.tools.js";
import "./tools/activity/activity.tools.js";
import "./tools/intelligence/intelligence.tools.js";
import "./tools/ai-capabilities/ai-capabilities.tools.js";
import "./tools/collaboration/collaboration.tools.js";
import "./tools/prompt-library/prompt.tools.js";
import "./tools/workspace/workspace.tools.js";

logger.info(`MCP Server initialized with ${toolRegistry.size()} tools`);

// --- Public API ---

export function listTools(userScopes?: McpScope[]) {
  return toolRegistry.listManifest(userScopes);
}

export async function callTool(
  toolName: string,
  userId: string,
  userScopes: McpScope[],
  rawInput: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const entry = toolRegistry.getEntry(toolName);

  if (!entry) {
    throw new McpError(
      "not_found",
      `Tool "${toolName}" not found. Call GET /api/mcp/tools to see available tools.`,
    );
  }

  // Scope check
  if (!userScopes.includes(entry.requiredScope)) {
    throw new McpError(
      "forbidden",
      `Tool "${toolName}" requires scope "${entry.requiredScope}". Your current scopes: ${userScopes.join(", ")}`,
    );
  }

  // Input validation
  const validation = validateInput(entry.inputSchema, rawInput);
  if (!validation.valid) {
    throw new McpError(
      "validation_error",
      `Invalid input for tool "${toolName}"`,
      { errors: validation.errors },
    );
  }

  // Confirmation check (for destructive / sensitive_write tools)
  const confirmationResult = checkConfirmation(entry, userId, rawInput);
  if (confirmationResult) {
    throw new McpError("confirmation_required", confirmationResult.summary, {
      confirmationToken: confirmationResult.confirmationToken,
      tool: toolName,
    });
  }

  // Execute
  try {
    logger.info(`MCP tool call: ${toolName}`, {
      userId,
      tool: toolName,
      domain: entry.domain,
      risk: entry.risk,
    });

    const data = await entry.handler(userId, rawInput);

    return {
      tool: toolName,
      data,
      risk: entry.risk,
      domain: entry.domain,
    };
  } catch (error) {
    const mcpError = mapDomainError(error);
    logger.error(`MCP tool "${toolName}" failed: ${mcpError.message}`, {
      userId,
      tool: toolName,
      code: mcpError.code,
    });
    throw mcpError;
  }
}
