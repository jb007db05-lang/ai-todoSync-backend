import assert from "node:assert/strict";
import test, { describe } from "node:test";
import toolRegistry from "../registry/tool-registry.js";
import "../tools/analytics/analytics.tools.js";

describe("MCP Analytics Tools Suite", () => {
  test("analytics:list_metrics is registered", () => {
    const entry = toolRegistry.getEntry("analytics:list_metrics");
    assert.ok(entry, "analytics:list_metrics should be registered");
    assert.equal(entry?.domain, "analytics");
    assert.equal(entry?.requiredScope, "analytics:read");
  });

  test("analytics:query_metric is registered and requires metric field", () => {
    const entry = toolRegistry.getEntry("analytics:query_metric");
    assert.ok(entry, "analytics:query_metric should be registered");
    assert.deepEqual(entry?.inputSchema.required, ["metric"]);
  });

  test("analytics:forecast_operational_state is registered", () => {
    const entry = toolRegistry.getEntry("analytics:forecast_operational_state");
    assert.ok(
      entry,
      "analytics:forecast_operational_state should be registered",
    );
  });

  test("analytics:simulate_operational_intervention is registered", () => {
    const entry = toolRegistry.getEntry(
      "analytics:simulate_operational_intervention",
    );
    assert.ok(
      entry,
      "analytics:simulate_operational_intervention should be registered",
    );
  });
});
