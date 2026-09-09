import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import slaService from "./sla.service.js";
import SlaConfigModel from "../models/sla-config.model.js";
import TaskModel from "../models/task.model.js";

// Helper mock functions
function makeMockQuery(result: any) {
  return {
    sort: () => ({
      exec: async () => result,
    }),
    exec: async () => result,
  };
}

test("SlaService: getConfigs returns configurations and inserts defaults", async () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  const originalUpdateOne = SlaConfigModel.updateOne;
  const originalFind = SlaConfigModel.find;

  let updateCalled = 0;
  SlaConfigModel.updateOne = function () {
    updateCalled += 1;
    return {
      exec: async () => ({
        acknowledged: true,
        modifiedCount: 0,
        upsertedId: null,
        upsertedCount: 0,
        matchedCount: 1,
      }),
    } as any;
  };

  SlaConfigModel.find = function () {
    return makeMockQuery([]) as any;
  };

  try {
    const configs = await slaService.getConfigs(mockUserId);
    assert.equal(updateCalled, 4); // LOW, MEDIUM, HIGH, CRITICAL defaults ensured
    assert.equal(configs.length, 4);

    const mediumConfig = configs.find((c) => c.priority === "MEDIUM");
    assert.ok(mediumConfig);
    assert.equal(mediumConfig.responseTimeHours, 24);
    assert.equal(mediumConfig.resolutionTimeHours, 72);
  } finally {
    SlaConfigModel.updateOne = originalUpdateOne;
    SlaConfigModel.find = originalFind;
  }
});

test("SlaService: updateConfig updates SLA config or errors on invalid inputs", async () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  const originalFindOneAndUpdate = SlaConfigModel.findOneAndUpdate;
  const originalFindOne = SlaConfigModel.findOne;
  const originalFind = TaskModel.find;
  const originalUpdateOne = SlaConfigModel.updateOne;

  SlaConfigModel.updateOne = function () {
    return { exec: async () => {} } as any;
  };

  SlaConfigModel.findOne = function () {
    return {
      exec: async () => ({
        responseTimeHours: 4,
        resolutionTimeHours: 24,
      }),
    } as any;
  };

  TaskModel.find = function () {
    return {
      exec: async () => [],
    } as any;
  };

  SlaConfigModel.findOneAndUpdate = function () {
    return {
      exec: async () => ({
        _id: new mongoose.Types.ObjectId(),
        priority: "HIGH",
        responseTimeHours: 4,
        resolutionTimeHours: 24,
      }),
    } as any;
  };

  try {
    // 1. Successful update
    const updated = await slaService.updateConfig(mockUserId, {
      priority: "HIGH",
      responseTimeHours: 4,
      resolutionTimeHours: 24,
    });
    assert.equal(updated.priority, "HIGH");
    assert.equal(updated.responseTimeHours, 4);
    assert.equal(updated.resolutionTimeHours, 24);

    // 2. Reject response time >= resolution time
    await assert.rejects(async () => {
      await slaService.updateConfig(mockUserId, {
        priority: "HIGH",
        responseTimeHours: 24,
        resolutionTimeHours: 12,
      });
    }, /Response SLA must be shorter than resolution SLA/);

    // 3. Reject invalid priority
    await assert.rejects(async () => {
      await slaService.updateConfig(mockUserId, {
        priority: "INVALID_PRIORITY",
        responseTimeHours: 2,
        resolutionTimeHours: 8,
      });
    }, /Invalid SLA priority/);
  } finally {
    SlaConfigModel.findOneAndUpdate = originalFindOneAndUpdate;
    SlaConfigModel.findOne = originalFindOne;
    TaskModel.find = originalFind;
    SlaConfigModel.updateOne = originalUpdateOne;
  }
});

test("SlaService: buildInitialSlaFields computes correct due dates", async () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const originalFindOne = SlaConfigModel.findOne;
  const originalUpdateOne = SlaConfigModel.updateOne;

  SlaConfigModel.updateOne = function () {
    return { exec: async () => {} } as any;
  };

  SlaConfigModel.findOne = function () {
    return {
      exec: async () => ({
        responseTimeHours: 2,
        resolutionTimeHours: 8,
      }),
    } as any;
  };

  try {
    const baseTime = new Date("2026-07-21T12:00:00.000Z");
    const fields = await slaService.buildInitialSlaFields(
      mockUserId,
      "HIGH",
      "TODO",
      baseTime,
    );

    assert.equal(
      fields.slaResponseDueAt?.toISOString(),
      "2026-07-21T14:00:00.000Z",
    );
    assert.equal(
      fields.slaResolutionDueAt?.toISOString(),
      "2026-07-21T20:00:00.000Z",
    );
    assert.equal(fields.currentSlaState, "HEALTHY");
  } finally {
    SlaConfigModel.findOne = originalFindOne;
    SlaConfigModel.updateOne = originalUpdateOne;
  }
});

test("SlaService: applyStatusTransition manages BLOCKED pause and unpause durations", () => {
  const baseTime = new Date("2026-07-21T12:00:00.000Z");

  const currentTask: any = {
    status: "TODO",
    createdAt: baseTime,
    slaResponseDueAt: new Date(baseTime.getTime() + 4 * 3600000), // +4h
    slaResolutionDueAt: new Date(baseTime.getTime() + 24 * 3600000), // +24h
    responseBreached: false,
    resolutionBreached: false,
    firstResponseAt: null,
    completedAt: null,
    slaPausedAt: null,
    totalPausedDuration: 0,
    currentSlaState: "HEALTHY",
  };

  // 1. Transition to BLOCKED (Pause SLA)
  const blockUpdates = slaService.applyStatusTransition(
    currentTask,
    { status: "BLOCKED" },
    baseTime,
  );
  assert.equal(blockUpdates.status, "BLOCKED");
  assert.equal(blockUpdates.slaPausedAt?.toISOString(), baseTime.toISOString());
  assert.equal(blockUpdates.currentSlaState, "PAUSED");

  // 2. Transition from BLOCKED back to TODO after 1 hour (Unpause SLA and extend due dates)
  const pausedTask = {
    ...currentTask,
    status: "BLOCKED",
    slaPausedAt: baseTime,
  };
  const oneHourLater = new Date(baseTime.getTime() + 3600000);
  const unblockUpdates = slaService.applyStatusTransition(
    pausedTask,
    { status: "TODO" },
    oneHourLater,
  );

  assert.equal(unblockUpdates.status, "TODO");
  assert.equal(unblockUpdates.slaPausedAt, null);
  assert.equal(unblockUpdates.totalPausedDuration, 3600000);
  assert.equal(
    unblockUpdates.slaResponseDueAt?.toISOString(),
    new Date(currentTask.slaResponseDueAt.getTime() + 3600000).toISOString(),
  );
  assert.equal(
    unblockUpdates.slaResolutionDueAt?.toISOString(),
    new Date(currentTask.slaResolutionDueAt.getTime() + 3600000).toISOString(),
  );
});
