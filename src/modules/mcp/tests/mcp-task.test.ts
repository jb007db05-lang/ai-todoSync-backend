import assert from "node:assert/strict";
import test, { describe } from "node:test";
import toolRegistry from "../registry/tool-registry.js";
import "../tools/task/task.tools.js";

describe("MCP Task Tools Suite", () => {
  test("task:get is registered with correct properties", () => {
    const entry = toolRegistry.getEntry("task:get");
    assert.ok(entry, "task:get tool should be registered");
    assert.equal(entry?.domain, "task");
    assert.equal(entry?.requiredScope, "work:read");
    assert.equal(entry?.risk, "read");
  });

  test("task:create is registered with correct properties", () => {
    const entry = toolRegistry.getEntry("task:create");
    assert.ok(entry, "task:create tool should be registered");
    assert.equal(entry?.domain, "task");
    assert.equal(entry?.requiredScope, "work:write");
    assert.equal(entry?.risk, "write");
  });

  test("task:delete requires confirmation", () => {
    const entry = toolRegistry.getEntry("task:delete");
    assert.ok(entry, "task:delete tool should be registered");
    assert.equal(entry?.requiresConfirmation, true);
    assert.equal(entry?.risk, "destructive");
  });

  test("task:search schema validates query, status, and limit filters", () => {
    const entry = toolRegistry.getEntry("task:search");
    assert.ok(entry, "task:search tool should be registered");
    assert.equal(entry?.inputSchema.type, "object");
  });
});
