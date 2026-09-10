import assert from "node:assert/strict";
import test from "node:test";

import type { IAiPlanningPlan } from "../models/ai-planning-draft.model.js";
import aiPlanningService from "./ai-planning.service.js";

const service = aiPlanningService as unknown as {
  buildFallbackPlan(
    projectName: string,
    requirements: string[],
  ): IAiPlanningPlan;
  normalizePlan(value: unknown): IAiPlanningPlan;
};

test("AI planning fallback creates reviewable milestone, task, and subtask hierarchy", () => {
  const plan = service.buildFallbackPlan("Portal", [
    "Allow users to submit requests. Add admin review workflow.",
  ]);

  assert.equal(plan.documentationTitle, "AI Project Plan - Portal");
  assert.equal(plan.milestones.length, 1);
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].milestoneIndex, 0);
  assert.equal(plan.tasks[0].subtasks.length, 2);
  assert.match(plan.documentation, /Allow users to submit requests/);
});

test("AI planning rejects provider plans with invalid milestone references", () => {
  assert.throws(
    () =>
      service.normalizePlan({
        documentationTitle: "Plan",
        documentation: "Plan body",
        milestones: [{ name: "MVP" }],
        tasks: [
          {
            title: "Deliver",
            date: "2026-06-02",
            priority: "MEDIUM",
            milestoneIndex: 2,
            subtasks: [],
          },
        ],
      }),
    /milestoneIndex is invalid/,
  );
});
