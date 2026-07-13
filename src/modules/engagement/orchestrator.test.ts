import assert from "node:assert/strict";
import test from "node:test";
import { GuideExposureModel } from "./model.js";
import experienceOrchestrator from "./orchestrator.js";
import type { RuntimeGuideDto } from "./dtos.js";

const createMockExperience = (
  id: string,
  type: string,
  priority: string,
): RuntimeGuideDto => ({
  id,
  title: `${type} Experience`,
  type,
  priority,
  theme: {},
  steps: [],
  targetingRules: {},
  frequencyRules: {},
  scheduleRules: {},
  metadata: {},
  eligibility: {
    reasons: [],
    matchedConditions: [],
    failedConditions: [],
  },
});

test("ExperienceOrchestrator: delivers highest priority intrusive experience and all non-intrusive ones", async (t) => {
  // Mock no active lock and no cooldown
  t.mock.method(GuideExposureModel, "findOne", () => {
    return {
      lean: () => ({
        exec: async () => null,
      }),
    };
  });

  const experiences = [
    createMockExperience("1", "CHECKLIST", "MEDIUM"),
    createMockExperience("2", "HOTSPOT", "LOW"),
    createMockExperience("3", "MODAL", "HIGH"),
    createMockExperience("4", "SURVEY", "CRITICAL"),
  ];

  const result = await experienceOrchestrator.orchestrate({
    tenantId: "tenant-1",
    userId: "user-1",
    experiences,
  });

  // Expected:
  // - SURVEY (CRITICAL) is delivered because it is highest priority intrusive
  // - CHECKLIST and HOTSPOT are delivered because they are non-intrusive
  // - MODAL (HIGH) is filtered out
  assert.equal(result.length, 3);
  assert.ok(result.some((e) => e.id === "4" && e.type === "SURVEY"));
  assert.ok(result.some((e) => e.id === "1" && e.type === "CHECKLIST"));
  assert.ok(result.some((e) => e.id === "2" && e.type === "HOTSPOT"));
  assert.ok(!result.some((e) => e.id === "3"));
});

test("ExperienceOrchestrator: blocks all intrusive experiences when an active lock is in place", async (t) => {
  // Mock active lock exists
  t.mock.method(GuideExposureModel, "findOne", () => {
    return {
      lean: () => ({
        exec: async () => ({
          tenantId: "tenant-1",
          guideId: "3",
          status: "started",
          updatedAt: new Date(),
        }),
      }),
    };
  });

  const experiences = [
    createMockExperience("1", "CHECKLIST", "MEDIUM"),
    createMockExperience("2", "MODAL", "HIGH"),
  ];

  const result = await experienceOrchestrator.orchestrate({
    tenantId: "tenant-1",
    userId: "user-1",
    experiences,
  });

  // Expected:
  // - MODAL (intrusive) is blocked by active lock
  // - CHECKLIST (non-intrusive) is delivered
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("ExperienceOrchestrator: blocks non-critical intrusive experiences when global cooldown is active", async (t) => {
  // Mock global cooldown is active (recent shown guide)
  t.mock.method(GuideExposureModel, "findOne", (query: any) => {
    if (query && query.status === "started") {
      return {
        lean: () => ({
          exec: async () => null,
        }),
      };
    }
    return {
      lean: () => ({
        exec: async () => ({
          tenantId: "tenant-1",
          guideId: "5",
          status: "shown",
          lastShownAt: new Date(),
        }),
      }),
    };
  });

  const experiences = [
    createMockExperience("1", "BANNER", "LOW"),
    createMockExperience("2", "MODAL", "HIGH"),
  ];

  const result = await experienceOrchestrator.orchestrate({
    tenantId: "tenant-1",
    userId: "user-1",
    experiences,
  });

  // Expected:
  // - MODAL (intrusive, HIGH) is blocked by cooldown
  // - BANNER (non-intrusive) is delivered
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("ExperienceOrchestrator: permits CRITICAL intrusive experience to bypass global cooldown", async (t) => {
  // Mock global cooldown is active
  t.mock.method(GuideExposureModel, "findOne", (query: any) => {
    if (query && query.status === "started") {
      return {
        lean: () => ({
          exec: async () => null,
        }),
      };
    }
    return {
      lean: () => ({
        exec: async () => ({
          tenantId: "tenant-1",
          guideId: "5",
          status: "shown",
          lastShownAt: new Date(),
        }),
      }),
    };
  });

  const experiences = [
    createMockExperience("1", "BANNER", "LOW"),
    createMockExperience("2", "MODAL", "CRITICAL"),
  ];

  const result = await experienceOrchestrator.orchestrate({
    tenantId: "tenant-1",
    userId: "user-1",
    experiences,
  });

  // Expected:
  // - MODAL (intrusive, CRITICAL) bypasses cooldown and is delivered
  // - BANNER (non-intrusive) is delivered
  assert.equal(result.length, 2);
  assert.ok(result.some((e) => e.id === "2" && e.priority === "CRITICAL"));
  assert.ok(result.some((e) => e.id === "1"));
});
