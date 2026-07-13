import assert from "node:assert/strict";
import test from "node:test";
import targetingService from "./service.js";
import type { TargetingRuleGroup } from "../engagement/types.js";

test("targeting engine matches URL and user conditions", async () => {
  const rules: TargetingRuleGroup = {
    id: "root",
    operator: "AND",
    conditions: [
      { id: "url", type: "URL_CONTAINS", value: "/dashboard" },
      { id: "role", type: "ROLE_EQUALS", value: "ADMIN" },
    ],
  };

  const result = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      url: "https://sync.todo/dashboard",
      role: "ADMIN",
    },
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.failedConditions, []);
  assert.deepEqual(result.matchedConditions, ["url", "role"]);
});

test("targeting engine supports nested OR groups", async () => {
  const rules: TargetingRuleGroup = {
    id: "root",
    operator: "AND",
    conditions: [{ id: "url", type: "URL_CONTAINS", value: "/projects" }],
    groups: [
      {
        id: "plan-group",
        operator: "OR",
        conditions: [
          { id: "free", type: "PLAN_EQUALS", value: "free" },
          { id: "pro", type: "PLAN_EQUALS", value: "pro" },
        ],
      },
    ],
  };

  const result = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      url: "https://sync.todo/projects/123",
      plan: "pro",
    },
  });

  assert.equal(result.eligible, true);
  assert.ok(result.matchedConditions.includes("url"));
  assert.ok(result.matchedConditions.includes("pro"));
  assert.ok(result.failedConditions.includes("free"));
});

test("targeting engine rejects failed AND condition", async () => {
  const rules: TargetingRuleGroup = {
    id: "root",
    operator: "AND",
    conditions: [
      { id: "url", type: "URL_EQUALS", value: "/dashboard" },
      {
        id: "score",
        type: "ENGAGEMENT_SCORE",
        operator: "GREATER_THAN",
        value: 80,
      },
    ],
  };

  const result = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      url: "/dashboard",
      session: { engagementScore: 42 },
    },
  });

  assert.equal(result.eligible, false);
  assert.ok(result.failedConditions.includes("score"));
});

test("targeting engine evaluates exit intent trigger correctly", async () => {
  const rules: TargetingRuleGroup = {
    id: "root",
    operator: "AND",
    conditions: [
      { id: "exit", type: "EXIT_INTENT" }
    ],
  };

  // Test when eventName matches
  const matchResult = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      eventName: "exit_intent",
    },
  });

  assert.equal(matchResult.eligible, true);
  assert.deepEqual(matchResult.matchedConditions, ["exit"]);

  // Test when eventName does not match
  const failResult = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      eventName: "different_event",
    },
  });

  assert.equal(failResult.eligible, false);
  assert.deepEqual(failResult.failedConditions, ["exit"]);
});

test("targeting engine evaluates idle timeout trigger correctly", async () => {
  const rules: TargetingRuleGroup = {
    id: "root",
    operator: "AND",
    conditions: [
      { id: "idle", type: "IDLE_TIMEOUT" }
    ],
  };

  // Test when eventName matches
  const matchResult = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      eventName: "idle_timeout",
    },
  });

  assert.equal(matchResult.eligible, true);
  assert.deepEqual(matchResult.matchedConditions, ["idle"]);

  // Test when eventName does not match
  const failResult = await targetingService.evaluate({
    rules,
    context: {
      tenantId: "tenant-1",
      eventName: "different_event",
    },
  });

  assert.equal(failResult.eligible, false);
  assert.deepEqual(failResult.failedConditions, ["idle"]);
});
