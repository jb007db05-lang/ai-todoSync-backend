import assert from "node:assert/strict";
import test from "node:test";
import AnalyticsKeyModel from "../../models/analytics-key.model.js";
import trackingService from "../../services/tracking.service.js";
import engagementRepository from "./repository.js";
import engagementService from "./service.js";
import type { RuntimeGuideDto } from "./dtos.js";

type UpsertExposureArgs = Parameters<
  typeof engagementRepository.upsertExposure
>;
type IncrementMtuInput = Parameters<
  typeof engagementRepository.incrementMtu
>[0];

const runtimeExperience = (
  overrides: Partial<RuntimeGuideDto>,
): RuntimeGuideDto => ({
  id: "experience-1",
  title: "Experience",
  type: "MODAL",
  priority: "MEDIUM",
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
  ...overrides,
});

test("recordRuntimeDelivery stores survey exposure under canonical survey id", async (t) => {
  const upserts: UpsertExposureArgs[] = [];
  const mtuInputs: IncrementMtuInput[] = [];

  t.mock.method(
    engagementRepository,
    "upsertExposure",
    async (identity: UpsertExposureArgs[0], patch: UpsertExposureArgs[1]) => {
      upserts.push([identity, patch]);
      return {} as Awaited<
        ReturnType<typeof engagementRepository.upsertExposure>
      >;
    },
  );
  t.mock.method(
    engagementRepository,
    "incrementMtu",
    async (input: IncrementMtuInput) => {
      mtuInputs.push(input);
    },
  );
  t.mock.method(AnalyticsKeyModel, "findOne", () => ({
    sort: () => ({
      exec: async () => null,
    }),
  }));
  t.mock.method(trackingService, "trackSingle", async () => ({}));

  await engagementService.recordRuntimeDelivery({
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
    guides: [
      runtimeExperience({
        id: "survey:display-id",
        type: "SURVEY",
        metadata: { surveyId: "survey-raw-id" },
      }),
    ],
  });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0][0].guideId, "survey-raw-id");
  assert.equal(upserts[0][1].incrementDisplay, true);
  assert.equal(mtuInputs.length, 1);
  assert.equal(mtuInputs[0].guideId, undefined);
  assert.equal(mtuInputs[0].surveyId, "survey-raw-id");
});

test("recordRuntimeDelivery stores checklist exposure under canonical checklist id", async (t) => {
  const upserts: UpsertExposureArgs[] = [];

  t.mock.method(
    engagementRepository,
    "upsertExposure",
    async (identity: UpsertExposureArgs[0], patch: UpsertExposureArgs[1]) => {
      upserts.push([identity, patch]);
      return {} as Awaited<
        ReturnType<typeof engagementRepository.upsertExposure>
      >;
    },
  );
  t.mock.method(engagementRepository, "incrementMtu", async () => undefined);
  t.mock.method(AnalyticsKeyModel, "findOne", () => ({
    sort: () => ({
      exec: async () => null,
    }),
  }));
  t.mock.method(trackingService, "trackSingle", async () => ({}));

  await engagementService.recordRuntimeDelivery({
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
    guides: [
      runtimeExperience({
        id: "checklist:display-id",
        type: "CHECKLIST",
        metadata: { checklistId: "checklist-raw-id" },
      }),
    ],
  });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0][0].guideId, "checklist-raw-id");
});
