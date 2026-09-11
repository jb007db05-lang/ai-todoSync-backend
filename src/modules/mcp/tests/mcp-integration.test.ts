import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { listTools, callTool } from "../mcp.server.js";
import { listMcpPrompts, getMcpPrompt } from "../prompts/mcp.prompts.js";
import toolRegistry from "../registry/tool-registry.js";
import { McpError } from "../errors/mcp-error.js";

const DEFAULT_SCOPES = [
  "work:read" as const,
  "work:write" as const,
  "analytics:read" as const,
  "collaboration:read" as const,
  "prompt:read" as const,
];

describe("MCP Server Integration & Resources/Prompts Test Suite", () => {
  test("mcpServer lists all registered tools", async () => {
    const manifest = listTools();
    assert.ok(
      manifest.length > 10,
      "Should have registered tools across domains",
    );
  });

  test("mcpServer handles non-existent tool call gracefully", async () => {
    await assert.rejects(
      async () => {
        await callTool("non_existent_tool", "user-123", DEFAULT_SCOPES, {});
      },
      (err: unknown) => {
        return err instanceof McpError && err.httpStatus === 404;
      },
    );
  });

  test("mcpServer checks schema validation on tool execution", async () => {
    toolRegistry.register({
      name: "test:strict_tool",
      description: "Test tool",
      domain: "test",
      inputSchema: {
        type: "object",
        required: ["requiredField"],
        properties: {
          requiredField: { type: "string" },
        },
      },
      requiredScope: "work:read",
      risk: "read",
      handler: async () => ({ success: true }),
    });

    await assert.rejects(
      async () => {
        await callTool("test:strict_tool", "user-123", DEFAULT_SCOPES, {});
      },
      (err: unknown) => {
        return err instanceof McpError && err.httpStatus === 400;
      },
    );
  });

  test("listMcpPrompts returns standard prompt templates", () => {
    const prompts = listMcpPrompts();
    assert.ok(prompts.length >= 3, "Should return at least 3 standard prompts");
    assert.ok(prompts.some((p) => p.name === "daily_planning"));

    const dailyPlanning = getMcpPrompt("daily_planning");
    assert.ok(dailyPlanning, "daily_planning prompt should be found");
    assert.equal(dailyPlanning?.name, "daily_planning");
  });
});
